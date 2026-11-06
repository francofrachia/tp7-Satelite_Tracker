import type {
  ConstellationCategory,
  ObserverLocation,
  OrbitalElements,
} from '../../types/satellite';
import { RateLimiter, fetchWithRetry } from '../rateLimiter';
import {
  type DataProvider,
  type RemoteValidationPosition,
  parseTleEpochToIso,
} from './types';

/**
 * Proveedor Where the ISS at? (Sección 4.2 del TP7):
 * - Sin autenticación, límite ~1 request/s (configurado a 30/min, 600/h).
 * - Solo para la Estación Espacial Internacional (NORAD 25544): posición en tiempo real y TLE.
 */
export class WhereTheIssProvider implements DataProvider {
  public readonly name = 'Where the ISS at?';
  public readonly limiter = new RateLimiter('WhereTheISSAt', 30, 600);

  public async getCatalog(category: ConstellationCategory): Promise<OrbitalElements[]> {
    if (category !== 'stations') {
      throw new Error('Where the ISS at? solo provee datos de la ISS (25544)');
    }
    const iss = await this.getOrbitalData(25544);
    if (!iss) {
      throw new Error('No se pudo obtener TLE de la ISS');
    }
    return [iss];
  }

  public async getOrbitalData(noradId: number): Promise<OrbitalElements | null> {
    if (noradId !== 25544) return null;

    const url = 'https://api.wheretheiss.at/v1/satellites/25544/tles';
    const res = await fetchWithRetry(url, this.limiter, {}, 1, 7000);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.line1 || !data?.line2) return null;

    return {
      noradId: 25544,
      name: 'ISS (ZARYA)',
      line1: String(data.line1).trim(),
      line2: String(data.line2).trim(),
      epochIso: parseTleEpochToIso(String(data.line1)),
      source: 'WhereTheISSAt',
      fetchedAt: Date.now(),
      category: 'stations',
    };
  }

  public async getValidationPosition(
    noradId: number,
    _observer?: ObserverLocation
  ): Promise<RemoteValidationPosition | null> {
    if (noradId !== 25544) {
      throw new Error('Where the ISS at? solo soporta validar la ISS (NORAD 25544).');
    }

    const url = 'https://api.wheretheiss.at/v1/satellites/25544';
    const res = await fetchWithRetry(url, this.limiter, {}, 1, 8000);
    if (!res.ok) {
      throw new Error(`Where the ISS at? devolvió HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      altitudeKm: Number(data.altitude),
      timestamp: Number(data.timestamp) * 1000,
    };
  }
}
