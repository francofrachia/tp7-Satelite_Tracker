import type {
  ConstellationCategory,
  ObserverLocation,
  OrbitalElements,
} from '../../types/satellite';
import { loadCredentials } from '../credentialsStore';
import { RateLimiter, fetchWithRetry } from '../rateLimiter';
import {
  type DataProvider,
  type RemoteValidationPosition,
  parseTleEpochToIso,
} from './types';

/**
 * Proveedor N2YO REST API (Sección 4.2 del TP7):
 * - Uso principal: validación cruzada de cualquier satélite (posiciones con az/el) y fallback de TLE.
 * - Límite de uso: 1.000 transacciones/hora (TLE y posiciones).
 */
export class N2yoProvider implements DataProvider {
  public readonly name = 'N2YO';
  public readonly limiter = new RateLimiter('N2YO', 30, 900);

  public async getCatalog(_category: ConstellationCategory): Promise<OrbitalElements[]> {
    // N2YO no expone catálogos masivos sin coordenadas, se usa para objetos puntuales y validación
    throw new Error('N2YO se utiliza para consulta puntual por NORAD ID y validación cruzada');
  }

  public async getOrbitalData(noradId: number): Promise<OrbitalElements | null> {
    const creds = await loadCredentials();
    if (!creds.n2yoApiKey) {
      return null;
    }

    const url = `https://api.n2yo.com/rest/v1/satellite/tle/${noradId}&apiKey=${encodeURIComponent(
      creds.n2yoApiKey
    )}`;
    const res = await fetchWithRetry(url, this.limiter, {}, 1, 8000);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || !data.tle || typeof data.tle !== 'string') {
      return null;
    }

    const lines = data.tle
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);
    if (lines.length < 2) return null;

    return {
      noradId,
      name: data.info?.satname || `SAT-${noradId}`,
      line1: lines[0],
      line2: lines[1],
      epochIso: parseTleEpochToIso(lines[0]),
      source: 'N2YO',
      fetchedAt: Date.now(),
    };
  }

  public async getValidationPosition(
    noradId: number,
    observer: ObserverLocation = {
      latitude: -32.4845,
      longitude: -58.2321,
      altitudeMeters: 25,
      source: 'manual',
    }
  ): Promise<RemoteValidationPosition | null> {
    const creds = await loadCredentials();
    if (!creds.n2yoApiKey) {
      throw new Error(
        'Falta configurar la API Key gratuita de N2YO en la sección de Configuración de APIs.'
      );
    }

    const altMeters = Math.round(observer.altitudeMeters);
    const url = `https://api.n2yo.com/rest/v1/satellite/positions/${noradId}/${observer.latitude.toFixed(
      4
    )}/${observer.longitude.toFixed(4)}/${altMeters}/1/&apiKey=${encodeURIComponent(
      creds.n2yoApiKey
    )}`;

    const res = await fetchWithRetry(url, this.limiter, {}, 1, 9000);
    if (!res.ok) {
      throw new Error(`N2YO devolvió HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data?.error) {
      throw new Error(`N2YO Error: ${data.error}`);
    }

    const pos = data?.positions?.[0];
    if (!pos) {
      return null;
    }

    return {
      latitude: Number(pos.satlatitude),
      longitude: Number(pos.satlongitude),
      altitudeKm: Number(pos.sataltitude),
      azimuthDeg: Number(pos.azimuth),
      elevationDeg: Number(pos.elevation),
      timestamp: Number(pos.timestamp) * 1000,
    };
  }
}
