import type {
  ConstellationCategory,
  OMMRecord,
  OrbitalElements,
} from '../../types/satellite';
import { RateLimiter, fetchWithRetry } from '../rateLimiter';
import { type DataProvider, parseThreeLineElementText } from './types';

/**
 * Proveedor principal CelesTrak (Sección 4.2 del TP7):
 * - Soporta formato OMM/JSON (objetos de 6 dígitos y estándar CCSDS) y fallback a TLE.
 * - Para Starlink consume prioritariamente el set suplementario (SupGP) derivado de efemérides de SpaceX:
 *   https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json
 */
export class CelesTrakProvider implements DataProvider {
  public readonly name = 'CelesTrak';
  // CelesTrak actualiza cada ~12-24h; limitamos a 15 req/min y 100 req/hora para respetar sus servidores
  public readonly limiter = new RateLimiter('CelesTrak', 15, 100);

  private mapOmmArrayToElements(
    records: OMMRecord[],
    source: OrbitalElements['source'],
    category?: ConstellationCategory,
    maxRecords: number = 150
  ): OrbitalElements[] {
    const now = Date.now();
    return records.slice(0, maxRecords).map((r) => ({
      noradId: Number(r.NORAD_CAT_ID),
      name: (r.OBJECT_NAME || `SAT-${r.NORAD_CAT_ID}`).trim(),
      omm: {
        ...r,
        NORAD_CAT_ID: Number(r.NORAD_CAT_ID),
        MEAN_MOTION: Number(r.MEAN_MOTION),
        ECCENTRICITY: Number(r.ECCENTRICITY),
        INCLINATION: Number(r.INCLINATION),
        RA_OF_ASC_NODE: Number(r.RA_OF_ASC_NODE),
        ARG_OF_PERICENTER: Number(r.ARG_OF_PERICENTER),
        MEAN_ANOMALY: Number(r.MEAN_ANOMALY),
        BSTAR: Number(r.BSTAR),
      },
      epochIso: r.EPOCH.endsWith('Z') ? r.EPOCH : `${r.EPOCH}Z`,
      source,
      fetchedAt: now,
      category,
    }));
  }

  public async getCatalog(category: ConstellationCategory): Promise<OrbitalElements[]> {
    // Caso de estudio Starlink: intentar primero el endpoint Supplemental GP (SupGP) en JSON/OMM
    if (category === 'starlink') {
      try {
        const supGpUrl =
          'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json';
        const res = await fetchWithRetry(supGpUrl, this.limiter, {}, 1, 9000);
        if (res.ok) {
          const data = (await res.json()) as OMMRecord[];
          if (Array.isArray(data) && data.length > 0) {
            return this.mapOmmArrayToElements(data, 'CelesTrak-SupGP', 'starlink', 120);
          }
        }
      } catch {
        // Si SupGP tarda demasiado por tamaño, continuamos al catálogo GP general de CelesTrak
      }
    }

    // Consulta estándar en formato OMM/JSON
    const jsonUrl = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${category}&FORMAT=json`;
    const res = await fetchWithRetry(jsonUrl, this.limiter, {}, 1, 9000);
    if (res.ok) {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text) as OMMRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.mapOmmArrayToElements(
            parsed,
            category === 'starlink' ? 'CelesTrak-SupGP' : 'CelesTrak',
            category,
            category === 'starlink' ? 120 : 100
          );
        }
      } catch {
        // Si devolvió texto TLE en vez de JSON
        const tleList = parseThreeLineElementText(text, 'CelesTrak', category);
        if (tleList.length > 0) return tleList.slice(0, 120);
      }
    }

    // Fallback a formato TLE clásico en CelesTrak
    const tleUrl = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${category}&FORMAT=tle`;
    const tleRes = await fetchWithRetry(tleUrl, this.limiter, {}, 1, 9000);
    if (!tleRes.ok) {
      throw new Error(`CelesTrak respondió HTTP ${tleRes.status}`);
    }
    const rawTle = await tleRes.text();
    const list = parseThreeLineElementText(rawTle, 'CelesTrak', category);
    if (list.length === 0) {
      throw new Error('Catálogo vacío desde CelesTrak');
    }
    return list.slice(0, 120);
  }

  public async getOrbitalData(noradId: number): Promise<OrbitalElements | null> {
    const jsonUrl = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=json`;
    const res = await fetchWithRetry(jsonUrl, this.limiter, {}, 1, 8000);
    if (res.ok) {
      const data = (await res.json()) as OMMRecord[];
      if (Array.isArray(data) && data.length > 0) {
        const mapped = this.mapOmmArrayToElements(data, 'CelesTrak', undefined, 1);
        return mapped[0] ?? null;
      }
    }

    const tleUrl = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=tle`;
    const tleRes = await fetchWithRetry(tleUrl, this.limiter, {}, 1, 8000);
    if (tleRes.ok) {
      const rawTle = await tleRes.text();
      const parsed = parseThreeLineElementText(rawTle, 'CelesTrak');
      return parsed[0] ?? null;
    }

    return null;
  }
}
