import type {
  ConstellationCategory,
  OMMRecord,
  OrbitalElements,
} from '../../types/satellite';
import { loadCredentials } from '../credentialsStore';
import { RateLimiter, fetchWithRetry } from '../rateLimiter';
import type { DataProvider } from './types';

/**
 * Proveedor oficial Space-Track.org (Sección 4.2 del TP7):
 * - Límites estrictos: menos de 30 requests/min y 300/hora (configurado a 25/min y 250/h por margen).
 * - Requiere cuenta (identity/password) guardada en almacenamiento seguro.
 */
export class SpaceTrackProvider implements DataProvider {
  public readonly name = 'Space-Track';
  public readonly limiter = new RateLimiter('Space-Track', 25, 250);

  private mapCategoryFilter(category: ConstellationCategory): string {
    switch (category) {
      case 'stations':
        return 'NORAD_CAT_ID/25544,48274,20580';
      case 'starlink':
        return 'OBJECT_NAME/STARLINK~~/LIMIT/80';
      case 'gps-ops':
        return 'OBJECT_NAME/NAVSTAR~~/LIMIT/40';
      case 'weather':
        return 'OBJECT_NAME/NOAA~~,GOES~~,METOP~~/LIMIT/40';
      case 'geo':
        return 'PERIOD/>1400/ECCENTRICITY/<0.01/LIMIT/40';
    }
  }

  public async getCatalog(category: ConstellationCategory): Promise<OrbitalElements[]> {
    const creds = await loadCredentials();
    if (!creds.spaceTrackUser || !creds.spaceTrackPassword) {
      throw new Error('Credenciales de Space-Track no configuradas');
    }

    const filter = this.mapCategoryFilter(category);
    const query = `https://www.space-track.org/basicspacedata/query/class/gp/${filter}/orderby/NORAD_CAT_ID%20asc/format/json`;

    const body = `identity=${encodeURIComponent(creds.spaceTrackUser)}&password=${encodeURIComponent(
      creds.spaceTrackPassword
    )}&query=${encodeURIComponent(query)}`;

    const res = await fetchWithRetry(
      'https://www.space-track.org/ajaxauth/login',
      this.limiter,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      1,
      10000
    );

    if (!res.ok) {
      throw new Error(`Space-Track respondió HTTP ${res.status}`);
    }

    const data = (await res.json()) as OMMRecord[];
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Sin resultados desde Space-Track');
    }

    const now = Date.now();
    return data.map((r) => ({
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
      source: 'Space-Track',
      fetchedAt: now,
      category,
    }));
  }

  public async getOrbitalData(noradId: number): Promise<OrbitalElements | null> {
    const creds = await loadCredentials();
    if (!creds.spaceTrackUser || !creds.spaceTrackPassword) {
      return null;
    }

    const query = `https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/${noradId}/orderby/EPOCH%20desc/limit/1/format/json`;
    const body = `identity=${encodeURIComponent(creds.spaceTrackUser)}&password=${encodeURIComponent(
      creds.spaceTrackPassword
    )}&query=${encodeURIComponent(query)}`;

    const res = await fetchWithRetry(
      'https://www.space-track.org/ajaxauth/login',
      this.limiter,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      1,
      9000
    );

    if (!res.ok) return null;
    const data = (await res.json()) as OMMRecord[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const r = data[0];
    return {
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
      source: 'Space-Track',
      fetchedAt: Date.now(),
    };
  }
}
