// Tipos principales de dominio para el TP7 - Satellite Tracker

export type ConstellationCategory =
  | 'stations'    // Estaciones espaciales (ISS, Tiangong, etc.)
  | 'starlink'    // Constelación Starlink (SupGP / CelesTrak)
  | 'gps-ops'     // Navegación GPS (MEO)
  | 'weather'     // Meteorológicos (NOAA, GOES, METOP)
  | 'geo';        // Geoestacionarios (GEO)

export interface OMMRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE?: number;
  CLASSIFICATION_TYPE?: string;
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO?: number;
  REV_AT_EPOCH?: number;
  BSTAR: number;
  MEAN_MOTION_DOT?: number;
  MEAN_MOTION_DDOT?: number;
}

export interface OrbitalElements {
  noradId: number;
  name: string;
  /** Formato TLE clásico (línea 1 y línea 2) si está disponible */
  line1?: string;
  line2?: string;
  /** Objeto OMM/JSON estándar CCSDS (soporta catálogos de 6 dígitos) */
  omm?: OMMRecord;
  /** Fecha/hora de la época de los elementos orbitales (ISO string) */
  epochIso: string;
  /** Proveedor desde el que se obtuvo el dato */
  source: 'CelesTrak' | 'CelesTrak-SupGP' | 'Space-Track' | 'N2YO' | 'WhereTheISSAt' | 'Offline-Seed';
  /** Timestamp (ms) de cuándo se descargó de la API */
  fetchedAt: number;
  /** Categoría o constelación */
  category?: ConstellationCategory;
}

export interface SubsatellitePosition {
  latitude: number;      // Grados [-90, 90]
  longitude: number;     // Grados [-180, 180]
  altitudeKm: number;    // Altitud sobre el elipsoide WGS84 (km)
  velocityKmS: number;   // Velocidad orbital (km/s)
  timestamp: number;     // Epoch ms del cálculo
}

export interface TopocentricPosition {
  azimuthDeg: number;    // [0, 360) desde el Norte en sentido horario
  elevationDeg: number;  // [-90, 90] sobre el horizonte
  rangeKm: number;       // Distancia oblicua observador-satélite (km)
  isVisible: boolean;    // true si elevationDeg >= minElevationDeg
}

export interface ObserverLocation {
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  source: 'gps' | 'manual';
  label?: string;
}

export interface GroundTrackPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  isPast: boolean;
}

export interface SkyChartPoint {
  timestamp: number;
  azimuthDeg: number;
  elevationDeg: number;
}

export interface SatellitePass {
  id: string;
  noradId: number;
  satName: string;
  aosTime: number;           // Acquisition of Signal (ms)
  aosAzimuthDeg: number;
  maxElTime: number;         // Instante de máxima elevación (ms)
  maxElevationDeg: number;   // Elevación máxima alcanzada (grados)
  maxElAzimuthDeg: number;
  losTime: number;           // Loss of Signal (ms)
  losAzimuthDeg: number;
  durationSeconds: number;
  trajectory: SkyChartPoint[]; // Puntos para dibujar el sky chart polar
}

export interface ValidationComparison {
  provider: 'Where the ISS at?' | 'N2YO';
  noradId: number;
  satName: string;
  timestamp: number;
  localPosition: SubsatellitePosition;
  localTopocentric?: TopocentricPosition;
  remotePosition: {
    latitude: number;
    longitude: number;
    altitudeKm: number;
    azimuthDeg?: number;
    elevationDeg?: number;
  };
  surfaceErrorKm: number;    // Distancia geodésica superficial (Haversine) en km
  altitudeErrorKm: number;   // Diferencia absoluta de altitud en km
  total3DErrorKm: number;    // Error euclidiano 3D aproximado en km
  tleAgeHours: number;       // Antigüedad del TLE/OMM usado (horas)
}

export interface AppSettings {
  minElevationDeg: number;          // Umbral mínimo de elevación (p. ej. 10°)
  notifyMinutesBefore: number;      // Minutos antes del pase para notificar (p. ej. 10 min)
  cacheTtlHours: number;            // TTL de caché (12 a 24 h)
  constellationLimit: number;       // Máximo de satélites simultáneos en capa de constelación
  refreshIntervalSec: number;       // Intervalo de refresco en mapa (1 a 5 s)
}
