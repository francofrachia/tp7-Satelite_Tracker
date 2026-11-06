import type {
  ObserverLocation,
  OrbitalElements,
  ValidationComparison,
} from '../types/satellite';
import { dataOrchestrator } from './dataOrchestrator';
import {
  calculateSubsatellitePosition,
  calculateTopocentricPosition,
} from './orbitalEngine';

const EARTH_RADIUS_KM = 6371.0;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Distancia geodésica superficial (fórmula de Haversine) entre dos coordenadas (lat, lon) en km.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * RF-15: Ejecuta la comparación en vivo entre la posición calculada localmente con SGP4 (satellite.js)
 * y la fuente independiente (Where the ISS at? para la ISS, o N2YO para cualquier satélite),
 * evaluando ambos exactamente en el mismo timestamp para evitar desfase por movimiento orbital (~7.66 km/s).
 */
export async function runPositionValidation(
  elements: OrbitalElements,
  provider: 'Where the ISS at?' | 'N2YO',
  observer: ObserverLocation
): Promise<ValidationComparison> {
  const remote = await dataOrchestrator.getValidationPosition(
    provider,
    elements.noradId,
    observer
  );

  if (!remote) {
    throw new Error(`No se recibió posición desde ${provider}`);
  }

  // Propagamos nuestro modelo SGP4 en el mismo instante exacto que reportó la API externa
  const targetDate = new Date(remote.timestamp);
  const localPos = calculateSubsatellitePosition(elements, targetDate);
  if (!localPos) {
    throw new Error('Error al propagar localmente la órbita con SGP4');
  }

  const localTopo =
     calculateTopocentricPosition(elements, observer, targetDate, 0) ?? undefined;

  const surfaceErrorKm = calculateHaversineDistanceKm(
    localPos.latitude,
    localPos.longitude,
    remote.latitude,
    remote.longitude
  );
  const altitudeErrorKm = Math.abs(localPos.altitudeKm - remote.altitudeKm);
  const total3DErrorKm = Math.sqrt(
    surfaceErrorKm * surfaceErrorKm + altitudeErrorKm * altitudeErrorKm
  );

  const tleAgeHours = dataOrchestrator.getDataAgeHours(elements);

  return {
    provider,
    noradId: elements.noradId,
    satName: elements.name,
    timestamp: remote.timestamp,
    localPosition: localPos,
    localTopocentric: localTopo,
    remotePosition: {
      latitude: remote.latitude,
      longitude: remote.longitude,
      altitudeKm: remote.altitudeKm,
      azimuthDeg: remote.azimuthDeg,
      elevationDeg: remote.elevationDeg,
    },
    surfaceErrorKm,
    altitudeErrorKm,
    total3DErrorKm,
    tleAgeHours,
  };
}
