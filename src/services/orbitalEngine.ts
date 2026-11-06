import {
  twoline2satrec,
  json2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  eciToEcf,
  ecfToLookAngles,
  degreesLat,
  degreesLong,
  degreesToRadians,
  radiansToDegrees,
  type SatRec,
  type OMMJsonObject,
} from 'satellite.js';
import type {
  OrbitalElements,
  SubsatellitePosition,
  TopocentricPosition,
  ObserverLocation,
  GroundTrackPoint,
} from '../types/satellite';

const EARTH_RADIUS_KM = 6371.0;

// Caché en memoria de objetos SatRec ya inicializados para evitar re-parsear en cada frame
const satrecCache = new Map<string, SatRec>();

function getCacheKey(elements: OrbitalElements): string {
  return `${elements.noradId}_${elements.epochIso}`;
}

/**
 * Inicializa (o recupera de memoria) el registro SGP4/SDP4 (SatRec)
 * Soportando tanto el formato moderno OMM/JSON (recomendado por CelesTrak para 6 dígitos)
 * como el formato clásico TLE de 2 líneas.
 */
export function getSatRec(elements: OrbitalElements): SatRec | null {
  const key = getCacheKey(elements);
  const cached = satrecCache.get(key);
  if (cached) {
    return cached;
  }

  try {
    let satrec: SatRec;
    if (elements.omm) {
      const ommObj: OMMJsonObject = {
        OBJECT_NAME: elements.omm.OBJECT_NAME,
        OBJECT_ID: elements.omm.OBJECT_ID,
        EPOCH: elements.omm.EPOCH,
        MEAN_MOTION: elements.omm.MEAN_MOTION,
        ECCENTRICITY: elements.omm.ECCENTRICITY,
        INCLINATION: elements.omm.INCLINATION,
        RA_OF_ASC_NODE: elements.omm.RA_OF_ASC_NODE,
        ARG_OF_PERICENTER: elements.omm.ARG_OF_PERICENTER,
        MEAN_ANOMALY: elements.omm.MEAN_ANOMALY,
        NORAD_CAT_ID: elements.omm.NORAD_CAT_ID,
        ELEMENT_SET_NO: elements.omm.ELEMENT_SET_NO ?? 999,
        BSTAR: elements.omm.BSTAR,
        MEAN_MOTION_DOT: elements.omm.MEAN_MOTION_DOT ?? 0,
        MEAN_MOTION_DDOT: elements.omm.MEAN_MOTION_DDOT ?? 0,
      };
      satrec = json2satrec(ommObj);
    } else if (elements.line1 && elements.line2) {
      satrec = twoline2satrec(elements.line1, elements.line2);
    } else {
      return null;
    }

    satrecCache.set(key, satrec);
    return satrec;
  } catch (error) {
    console.warn(`Error inicializando SatRec para ${elements.name}:`, error);
    return null;
  }
}

/**
 * RF-02: Calcula la posición actual (latitud, longitud, altitud y velocidad)
 * del satélite en un instante dado mediante propagación local SGP4/SDP4.
 */
export function calculateSubsatellitePosition(
  elements: OrbitalElements,
  date: Date = new Date()
): SubsatellitePosition | null {
  const satrec = getSatRec(elements);
  if (!satrec) return null;

  const pv = propagate(satrec, date);
  if (!pv || !pv.position || !pv.velocity) {
    return null;
  }

  const gmst = gstime(date);
  const geodetic = eciToGeodetic(pv.position, gmst);

  const latitude = degreesLat(geodetic.latitude);
  const longitude = degreesLong(geodetic.longitude);
  const altitudeKm = geodetic.height;

  const { x: vx, y: vy, z: vz } = pv.velocity;
  const velocityKmS = Math.sqrt(vx * vx + vy * vy + vz * vz);

  if (Number.isNaN(latitude) || Number.isNaN(longitude) || Number.isNaN(altitudeKm)) {
    return null;
  }

  return {
    latitude,
    longitude,
    altitudeKm,
    velocityKmS,
    timestamp: date.getTime(),
  };
}

/**
 * RF-03: Calcula azimut, elevación y distancia oblicua (range) del satélite
 * respecto de la ubicación GPS del usuario (coordenadas topocéntricas).
 */
export function calculateTopocentricPosition(
  elements: OrbitalElements,
  observer: ObserverLocation,
  date: Date = new Date(),
  minElevationDeg: number = 10
): TopocentricPosition | null {
  const satrec = getSatRec(elements);
  if (!satrec) return null;

  const pv = propagate(satrec, date);
  if (!pv || !pv.position) {
    return null;
  }

  const gmst = gstime(date);
  const positionEcf = eciToEcf(pv.position, gmst);

  const observerGd = {
    longitude: degreesToRadians(observer.longitude),
    latitude: degreesToRadians(observer.latitude),
    height: observer.altitudeMeters / 1000.0, // metros a km
  };

  const lookAngles = ecfToLookAngles(observerGd, positionEcf);
  let azimuthDeg = radiansToDegrees(lookAngles.azimuth);
  if (azimuthDeg < 0) azimuthDeg += 360;

  const elevationDeg = radiansToDegrees(lookAngles.elevation);
  const rangeKm = lookAngles.rangeSat;

  return {
    azimuthDeg,
    elevationDeg,
    rangeKm,
    isVisible: elevationDeg >= minElevationDeg,
  };
}

/**
 * Estima el período orbital en minutos a partir del movimiento medio (rev/día)
 * o de la altitud mediante la tercera ley de Kepler.
 */
export function getOrbitalPeriodMinutes(elements: OrbitalElements, altitudeKm: number = 550): number {
  if (elements.omm?.MEAN_MOTION && elements.omm.MEAN_MOTION > 0) {
    return 1440.0 / Number(elements.omm.MEAN_MOTION);
  }
  if (elements.line2 && elements.line2.length >= 63) {
    const meanMotion = parseFloat(elements.line2.substring(52, 63));
    if (!Number.isNaN(meanMotion) && meanMotion > 0) {
      return 1440.0 / meanMotion;
    }
  }
  // Aproximación kepleriana si no está el mean motion explícito
  const semiMajorAxis = EARTH_RADIUS_KM + altitudeKm;
  const mu = 398600.4418; // km^3/s^2
  const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu);
  return periodSeconds / 60.0;
}

/**
 * RF-11: Calcula el Ground Track (trayectoria pasada y futura de al menos una órbita completa)
 * y divide la polilínea en segmentos cuando cruza el antimeridiano (salto > 180° en longitud)
 * para evitar líneas horizontales que crucen todo el mapa.
 */
export function calculateGroundTrackSegments(
  elements: OrbitalElements,
  centerDate: Date = new Date(),
  stepSeconds: number = 45
): {
  pastSegments: { latitude: number; longitude: number }[][];
  futureSegments: { latitude: number; longitude: number }[][];
} {
  const periodMin = Math.min(Math.max(getOrbitalPeriodMinutes(elements), 85), 1440);
  // Media órbita hacia atrás y una órbita completa hacia adelante
  const pastDurationMs = (periodMin * 0.5) * 60 * 1000;
  const futureDurationMs = (periodMin * 1.0) * 60 * 1000;
  const stepMs = stepSeconds * 1000;

  const rawPoints: GroundTrackPoint[] = [];
  const centerMs = centerDate.getTime();

  for (let t = centerMs - pastDurationMs; t <= centerMs + futureDurationMs; t += stepMs) {
    const pos = calculateSubsatellitePosition(elements, new Date(t));
    if (pos) {
      rawPoints.push({
        latitude: pos.latitude,
        longitude: pos.longitude,
        timestamp: t,
        isPast: t <= centerMs,
      });
    }
  }

  const splitAntimeridian = (pts: GroundTrackPoint[]) => {
    const segments: { latitude: number; longitude: number }[][] = [];
    let currentSegment: { latitude: number; longitude: number }[] = [];

    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      if (i > 0) {
        const prev = pts[i - 1];
        const lonJump = Math.abs(pt.longitude - prev.longitude);
        // Si la longitud salta más de 180°, cortamos el segmento en el antimeridiano
        if (lonJump > 180) {
          if (currentSegment.length > 1) {
            segments.push(currentSegment);
          }
          currentSegment = [];
        }
      }
      currentSegment.push({ latitude: pt.latitude, longitude: pt.longitude });
    }

    if (currentSegment.length > 1) {
      segments.push(currentSegment);
    }
    return segments;
  };

  const pastPts = rawPoints.filter((p) => p.isPast);
  const futurePts = rawPoints.filter((p) => !p.isPast);
  if (pastPts.length > 0 && futurePts.length > 0) {
    futurePts.unshift(pastPts[pastPts.length - 1]);
  }

  return {
    pastSegments: splitAntimeridian(pastPts),
    futureSegments: splitAntimeridian(futurePts),
  };
}

/**
 * RF-12: Calcula el radio del Footprint (área de cobertura terrestre en metros)
 * según la altitud del satélite y un ángulo de elevación mínima configurable.
 */
export function calculateFootprintRadiusMeters(
  altitudeKm: number,
  minElevationDeg: number = 0
): number {
  if (altitudeKm <= 0) return 0;

  // Limitamos la elevación usada en el cálculo del footprint a >= 0°
  const elRad = degreesToRadians(Math.max(0, Math.min(85, minElevationDeg)));
  const ratio = (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm)) * Math.cos(elRad);
  const clampedRatio = Math.min(1, Math.max(-1, ratio));

  const nadirAngleRad = Math.asin(clampedRatio);
  const centralAngleRad = Math.PI / 2 - elRad - nadirAngleRad;

  if (centralAngleRad <= 0) return 50000;

  // Limitamos el radio visual en react-native-maps para órbitas GEO para evitar artefactos de proyección Mercator
  const surfaceRadiusMeters = EARTH_RADIUS_KM * centralAngleRad * 1000;
  return Math.min(surfaceRadiusMeters, 4800000);
}

/**
 * RF-13: Propaga en lote una lista de satélites (ej. subconjunto de Starlink)
 * respetando un límite máximo de objetos para no degradar el hilo de UI.
 */
export function propagateConstellationBatch(
  catalog: OrbitalElements[],
  limit: number = 60,
  date: Date = new Date()
): { elements: OrbitalElements; position: SubsatellitePosition }[] {
  const results: { elements: OrbitalElements; position: SubsatellitePosition }[] = [];
  const slice = catalog.slice(0, limit);

  for (const item of slice) {
    const pos = calculateSubsatellitePosition(item, date);
    if (pos) {
      results.push({ elements: item, position: pos });
    }
  }

  return results;
}
