import type {
  OrbitalElements,
  ObserverLocation,
  SatellitePass,
  SkyChartPoint,
} from '../types/satellite';
import { calculateTopocentricPosition } from './orbitalEngine';

/**
 * Refina por bisección el instante exacto en que la elevación cruza el umbral (AOS o LOS).
 */
function refineCrossingTime(
  elements: OrbitalElements,
  observer: ObserverLocation,
  t1Ms: number,
  t2Ms: number,
  thresholdDeg: number,
  iterations: number = 6
): { timeMs: number; azimuthDeg: number; elevationDeg: number } {
  let low = t1Ms;
  let high = t2Ms;
  const posLow = calculateTopocentricPosition(elements, observer, new Date(low), thresholdDeg);
  const rising = posLow ? posLow.elevationDeg < thresholdDeg : true;

  let mid = (low + high) / 2;
  let lastAz = posLow?.azimuthDeg ?? 0;
  let lastEl = posLow?.elevationDeg ?? thresholdDeg;

  for (let i = 0; i < iterations; i++) {
    mid = (low + high) / 2;
    const posMid = calculateTopocentricPosition(elements, observer, new Date(mid), thresholdDeg);
    if (!posMid) break;

    lastAz = posMid.azimuthDeg;
    lastEl = posMid.elevationDeg;

    if (rising) {
      if (posMid.elevationDeg < thresholdDeg) {
        low = mid;
      } else {
        high = mid;
      }
    } else {
      if (posMid.elevationDeg >= thresholdDeg) {
        low = mid;
      } else {
        high = mid;
      }
    }
  }

  return { timeMs: Math.round(mid), azimuthDeg: lastAz, elevationDeg: lastEl };
}

/**
 * RF-04 y RF-05: Predice las próximas ventanas de visibilidad (AOS, Max Elevation, LOS)
 * utilizando un algoritmo de refinamiento (búsqueda gruesa cada 60 s -> refinamiento fino cada 10 s y bisección)
 * para mantener la UI fluida en el hilo de JS.
 */
export function predictUpcomingPasses(
  elements: OrbitalElements,
  observer: ObserverLocation,
  minElevationDeg: number = 10,
  hoursAhead: number = 24,
  maxPasses: number = 8
): SatellitePass[] {
  const passes: SatellitePass[] = [];
  const nowMs = Date.now();
  const endMs = nowMs + hoursAhead * 3600 * 1000;
  const coarseStepMs = 60 * 1000; // 60 segundos paso grueso

  let inPass = false;
  let passStartCoarseMs = nowMs;

  const initialTopo = calculateTopocentricPosition(
    elements,
    observer,
    new Date(nowMs),
    minElevationDeg
  );
  if (initialTopo && initialTopo.elevationDeg >= minElevationDeg) {
    inPass = true;
    passStartCoarseMs = nowMs;
  }

  for (let t = nowMs + coarseStepMs; t <= endMs; t += coarseStepMs) {
    const topo = calculateTopocentricPosition(elements, observer, new Date(t), minElevationDeg);
    if (!topo) continue;

    if (!inPass && topo.elevationDeg >= minElevationDeg) {
      // Cruzó hacia arriba del umbral -> encontramos AOS entre (t - coarseStepMs) y t
      inPass = true;
      passStartCoarseMs = t - coarseStepMs;
    } else if (inPass && topo.elevationDeg < minElevationDeg) {
      // Cruzó hacia abajo del umbral -> encontramos LOS entre (t - coarseStepMs) y t
      inPass = false;
      const passEndCoarseMs = t;

      // Refinar AOS y LOS
      const aos =
        passStartCoarseMs === nowMs
          ? {
              timeMs: nowMs,
              azimuthDeg: initialTopo?.azimuthDeg ?? 0,
              elevationDeg: initialTopo?.elevationDeg ?? minElevationDeg,
            }
          : refineCrossingTime(
              elements,
              observer,
              passStartCoarseMs,
              passStartCoarseMs + coarseStepMs,
              minElevationDeg
            );

      const los = refineCrossingTime(
        elements,
        observer,
        passEndCoarseMs - coarseStepMs,
        passEndCoarseMs,
        minElevationDeg
      );

      // Muestrear de forma fina (cada 12 s) entre AOS y LOS para construir el Sky Chart y hallar Max Elevation
      const trajectory: SkyChartPoint[] = [];
      let maxElevationDeg = -90;
      let maxElTime = aos.timeMs;
      let maxElAzimuthDeg = aos.azimuthDeg;

      const durationMs = Math.max(1000, los.timeMs - aos.timeMs);
      const sampleCount = Math.min(45, Math.max(12, Math.floor(durationMs / 12000)));
      const fineStepMs = durationMs / sampleCount;

      for (let i = 0; i <= sampleCount; i++) {
        const sampleTime = Math.round(aos.timeMs + i * fineStepMs);
        const sampleTopo = calculateTopocentricPosition(
          elements,
          observer,
          new Date(sampleTime),
          0
        );
        if (sampleTopo) {
          trajectory.push({
            timestamp: sampleTime,
            azimuthDeg: sampleTopo.azimuthDeg,
            elevationDeg: Math.max(0, sampleTopo.elevationDeg),
          });
          if (sampleTopo.elevationDeg > maxElevationDeg) {
            maxElevationDeg = sampleTopo.elevationDeg;
            maxElTime = sampleTime;
            maxElAzimuthDeg = sampleTopo.azimuthDeg;
          }
        }
      }

      if (maxElevationDeg >= minElevationDeg && los.timeMs > aos.timeMs + 15000) {
        passes.push({
          id: `${elements.noradId}_${aos.timeMs}`,
          noradId: elements.noradId,
          satName: elements.name,
          aosTime: aos.timeMs,
          aosAzimuthDeg: aos.azimuthDeg,
          maxElTime,
          maxElevationDeg,
          maxElAzimuthDeg,
          losTime: los.timeMs,
          losAzimuthDeg: los.azimuthDeg,
          durationSeconds: Math.round((los.timeMs - aos.timeMs) / 1000),
          trajectory,
        });

        if (passes.length >= maxPasses) {
          break;
        }
      }
    }
  }

  return passes;
}
