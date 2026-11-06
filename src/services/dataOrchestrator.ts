import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ConstellationCategory,
  ObserverLocation,
  OrbitalElements,
} from '../types/satellite';
import { CelesTrakProvider } from './providers/celestrakProvider';
import { SpaceTrackProvider } from './providers/spaceTrackProvider';
import { N2yoProvider } from './providers/n2yoProvider';
import { WhereTheIssProvider } from './providers/whereTheIssProvider';
import { getSeedCatalog } from './providers/fallbackSeeds';
import type { RemoteValidationPosition } from './providers/types';

const CACHE_PREFIX = 'tp7_orbital_cache_v1_';

interface CachedCatalogPayload {
  fetchedAt: number;
  providerUsed: string;
  items: OrbitalElements[];
}

export interface CatalogFetchResult {
  items: OrbitalElements[];
  providerUsed: string;
  fromCache: boolean;
  fetchedAt: number;
  ageHours: number;
  isStale: boolean;
}

class DataOrchestrator {
  public readonly celestrak = new CelesTrakProvider();
  public readonly spaceTrack = new SpaceTrackProvider();
  public readonly n2yo = new N2yoProvider();
  public readonly whereTheIss = new WhereTheIssProvider();

  /**
   * Calcula la antigüedad en horas de un elemento orbital respecto a su época (Epoch)
   * o respecto al instante de descarga.
   */
  public getDataAgeHours(elements: OrbitalElements): number {
    const epochMs = Date.parse(elements.epochIso);
    const refMs = !Number.isNaN(epochMs) ? epochMs : elements.fetchedAt;
    return Math.max(0, (Date.now() - refMs) / (3600 * 1000));
  }

  /**
   * RF-09, RF-14, RF-16: Obtiene el catálogo de una constelación aplicando:
   * 1. Caché local si está dentro del TTL (12-24h) y no se fuerza actualización.
   * 2. Proveedor primario CelesTrak (incluyendo SupGP para Starlink).
   * 3. Fallback automático a Space-Track -> WhereTheISSAt -> Caché expirada -> Semilla Offline.
   */
  public async getCatalog(
    category: ConstellationCategory,
    ttlHours: number = 12,
    forceRefresh: boolean = false
  ): Promise<CatalogFetchResult> {
    const cacheKey = `${CACHE_PREFIX}cat_${category}`;
    let cachedPayload: CachedCatalogPayload | null = null;

    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        cachedPayload = JSON.parse(raw) as CachedCatalogPayload;
      }
    } catch {
      // Ignorar error de lectura de almacenamiento
    }

    const now = Date.now();
    const ttlMs = ttlHours * 3600 * 1000;

    if (!forceRefresh && cachedPayload && cachedPayload.items.length > 0) {
      const cacheAgeMs = now - cachedPayload.fetchedAt;
      if (cacheAgeMs <= ttlMs) {
        const ageHours = cacheAgeMs / (3600 * 1000);
        return {
          items: cachedPayload.items,
          providerUsed: `${cachedPayload.providerUsed} (Caché)`,
          fromCache: true,
          fetchedAt: cachedPayload.fetchedAt,
          ageHours,
          isStale: ageHours > 24,
        };
      }
    }

    // 1. Intentar con CelesTrak (Primario)
    try {
      const items = await this.celestrak.getCatalog(category);
      if (items.length > 0) {
        const providerLabel = category === 'starlink' ? 'CelesTrak (SupGP)' : 'CelesTrak';
        await this.saveToCache(cacheKey, items, providerLabel);
        return {
          items,
          providerUsed: providerLabel,
          fromCache: false,
          fetchedAt: Date.now(),
          ageHours: 0,
          isStale: false,
        };
      }
    } catch (err) {
      console.log(`[Fallback] CelesTrak falló para ${category}, conmutando al siguiente proveedor...`, err);
    }

    // 2. Fallback automático a Space-Track.org (si el usuario cargó credenciales)
    try {
      const items = await this.spaceTrack.getCatalog(category);
      if (items.length > 0) {
        await this.saveToCache(cacheKey, items, 'Space-Track');
        return {
          items,
          providerUsed: 'Space-Track (Fallback)',
          fromCache: false,
          fetchedAt: Date.now(),
          ageHours: 0,
          isStale: false,
        };
      }
    } catch {
      // Continuar al siguiente fallback
    }

    // 3. Fallback a Where the ISS at? si es la categoría stations
    if (category === 'stations') {
      try {
        const issItems = await this.whereTheIss.getCatalog('stations');
        const seeds = getSeedCatalog('stations').filter((s) => s.noradId !== 25544);
        const merged = [...issItems, ...seeds];
        await this.saveToCache(cacheKey, merged, 'WhereTheISSAt + Seed');
        return {
          items: merged,
          providerUsed: 'Where the ISS at? (Fallback)',
          fromCache: false,
          fetchedAt: Date.now(),
          ageHours: 0,
          isStale: false,
        };
      } catch {
        // Continuar
      }
    }

    // 4. Si hay caché previa aunque haya superado el TTL, usarla para modo offline
    if (cachedPayload && cachedPayload.items.length > 0) {
      const ageHours = (now - cachedPayload.fetchedAt) / (3600 * 1000);
      return {
        items: cachedPayload.items,
        providerUsed: `${cachedPayload.providerUsed} (Caché Offline)`,
        fromCache: true,
        fetchedAt: cachedPayload.fetchedAt,
        ageHours,
        isStale: ageHours > 24,
      };
    }

    // 5. Último recurso garantizado: Semilla local embebida
    const seedItems = getSeedCatalog(category);
    return {
      items: seedItems,
      providerUsed: 'Catálogo Local Offline',
      fromCache: true,
      fetchedAt: now,
      ageHours: this.getDataAgeHours(seedItems[0]),
      isStale: true,
    };
  }

  /**
   * Busca un satélite puntual por su NORAD ID aplicando fallback entre proveedores:
   * CelesTrak -> WhereTheISSAt (si es 25544) -> Space-Track -> N2YO -> Semilla.
   */
  public async getSatelliteByNoradId(noradId: number): Promise<OrbitalElements | null> {
    try {
      const fromCelestrak = await this.celestrak.getOrbitalData(noradId);
      if (fromCelestrak) return fromCelestrak;
    } catch {
      // Fallback
    }

    if (noradId === 25544) {
      try {
        const fromIss = await this.whereTheIss.getOrbitalData(25544);
        if (fromIss) return fromIss;
      } catch {
        // Fallback
      }
    }

    try {
      const fromSpaceTrack = await this.spaceTrack.getOrbitalData(noradId);
      if (fromSpaceTrack) return fromSpaceTrack;
    } catch {
      // Fallback
    }

    try {
      const fromN2yo = await this.n2yo.getOrbitalData(noradId);
      if (fromN2yo) return fromN2yo;
    } catch {
      // Fallback
    }

    const seed = getSeedCatalog().find((s) => s.noradId === noradId);
    return seed ?? null;
  }

  /**
   * Obtiene posición de validación externa desde Where the ISS at? o N2YO.
   */
  public async getValidationPosition(
    provider: 'Where the ISS at?' | 'N2YO',
    noradId: number,
    observer: ObserverLocation
  ): Promise<RemoteValidationPosition | null> {
    if (provider === 'Where the ISS at?') {
      return this.whereTheIss.getValidationPosition(noradId, observer);
    }
    return this.n2yo.getValidationPosition(noradId, observer);
  }

  private async saveToCache(
    key: string,
    items: OrbitalElements[],
    providerUsed: string
  ): Promise<void> {
    try {
      const payload: CachedCatalogPayload = {
        fetchedAt: Date.now(),
        providerUsed,
        items,
      };
      await AsyncStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // Ignorar si el almacenamiento está lleno
    }
  }
}

export const dataOrchestrator = new DataOrchestrator();
