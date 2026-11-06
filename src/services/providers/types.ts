import type {
  ConstellationCategory,
  ObserverLocation,
  OrbitalElements,
} from '../../types/satellite';

export interface RemoteValidationPosition {
  latitude: number;
  longitude: number;
  altitudeKm: number;
  azimuthDeg?: number;
  elevationDeg?: number;
  timestamp: number;
}

/**
 * Interfaz común DataProvider exigida por la Sección 4.3 del TP7.
 */
export interface DataProvider {
  readonly name: string;
  getCatalog(category: ConstellationCategory): Promise<OrbitalElements[]>;
  getOrbitalData(noradId: number): Promise<OrbitalElements | null>;
  getValidationPosition?(
    noradId: number,
    observer?: ObserverLocation
  ): Promise<RemoteValidationPosition | null>;
}

/**
 * Extrae la fecha ISO de la época (Epoch) codificada en la línea 1 de un TLE clásico
 * (columnas 19 a 32: YYDDD.DDDDDDDD).
 */
export function parseTleEpochToIso(line1: string): string {
  try {
    const epochStr = line1.substring(18, 32).trim();
    const year2Digit = parseInt(epochStr.substring(0, 2), 10);
    const dayOfYear = parseFloat(epochStr.substring(2));
    const fullYear = year2Digit >= 57 ? 1900 + year2Digit : 2000 + year2Digit;

    const startOfYear = Date.UTC(fullYear, 0, 1, 0, 0, 0, 0);
    const epochMs = startOfYear + (dayOfYear - 1) * 86400 * 1000;
    return new Date(epochMs).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Parsea un texto en formato 3LE (Nombre + Línea 1 + Línea 2) a una lista de OrbitalElements.
 */
export function parseThreeLineElementText(
  rawText: string,
  source: OrbitalElements['source'],
  category?: ConstellationCategory
): OrbitalElements[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: OrbitalElements[] = [];
  const fetchedAt = Date.now();

  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      const name = i > 0 && !lines[i - 1].startsWith('2 ') ? lines[i - 1] : `SAT ${i}`;
      const line1 = lines[i];
      const line2 = lines[i + 1];
      const noradId = parseInt(line1.substring(2, 7).trim(), 10);
      if (!Number.isNaN(noradId)) {
        results.push({
          noradId,
          name,
          line1,
          line2,
          epochIso: parseTleEpochToIso(line1),
          source,
          fetchedAt,
          category,
        });
      }
      i++;
    }
  }

  return results;
}
