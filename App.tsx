import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar as RNStatusBar,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import type {
  AppSettings,
  ConstellationCategory,
  ObserverLocation,
  OrbitalElements,
  SubsatellitePosition,
  TopocentricPosition,
} from './src/types/satellite';
import { getSeedCatalog } from './src/services/providers/fallbackSeeds';
import { dataOrchestrator } from './src/services/dataOrchestrator';
import {
  calculateSubsatellitePosition,
  calculateTopocentricPosition,
  propagateConstellationBatch,
} from './src/services/orbitalEngine';
import { MapScreen } from './src/screens/MapScreen';
import { CatalogScreen } from './src/screens/CatalogScreen';
import { PassesScreen } from './src/screens/PassesScreen';
import { CompassScreen } from './src/screens/CompassScreen';
import { ValidationScreen } from './src/screens/ValidationScreen';

type TabKey = 'map' | 'catalog' | 'passes' | 'compass' | 'validation';

// Ubicación por defecto: FCyT UADER - Sede Concepción del Uruguay, Entre Ríos
const DEFAULT_OBSERVER: ObserverLocation = {
  latitude: -32.4845,
  longitude: -58.2321,
  altitudeMeters: 25,
  source: 'manual',
  label: 'Concepción del Uruguay (FCyT)',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('map');

  // Configuración global de la app
  const [settings, setSettings] = useState<AppSettings>({
    minElevationDeg: 10,
    notifyMinutesBefore: 10,
    cacheTtlHours: 12,
    constellationLimit: 50,
    refreshIntervalSec: 2,
  });

  // Posición del observador (GPS o por defecto)
  const [observer, setObserver] = useState<ObserverLocation>(DEFAULT_OBSERVER);

  // Catálogo actual y satélite seleccionado (por defecto ISS #25544)
  const initialSeeds = getSeedCatalog('stations');
  const [activeCategory, setActiveCategory] = useState<ConstellationCategory>('stations');
  const [catalog, setCatalog] = useState<OrbitalElements[]>(initialSeeds);
  const [selectedSat, setSelectedSat] = useState<OrbitalElements>(initialSeeds[0]);
  const [providerUsed, setProviderUsed] = useState<string>('CelesTrak');
  const [cacheAgeHours, setCacheAgeHours] = useState<number>(0);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);

  // Capa de constelación Starlink (RF-13)
  const [showConstellation, setShowConstellation] = useState<boolean>(false);
  const [starlinkCatalog, setStarlinkCatalog] = useState<OrbitalElements[]>(() =>
    getSeedCatalog('starlink')
  );
  const [constellationPositions, setConstellationPositions] = useState<
    { elements: OrbitalElements; position: SubsatellitePosition }[]
  >([]);

  // Estado orbital en tiempo real del satélite seleccionado
  const [satPosition, setSatPosition] = useState<SubsatellitePosition | null>(() =>
    calculateSubsatellitePosition(initialSeeds[0], new Date())
  );
  const [satTopo, setSatTopo] = useState<TopocentricPosition | null>(() =>
    calculateTopocentricPosition(initialSeeds[0], DEFAULT_OBSERVER, new Date(), 10)
  );

  // 1. Obtener ubicación GPS real del usuario al iniciar
  useEffect(() => {
    let mounted = true;
    async function initLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (mounted && loc?.coords) {
          setObserver({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            altitudeMeters: loc.coords.altitude ?? 25,
            source: 'gps',
            label: 'GPS Dispositivo',
          });
        }
      } catch {
        // Mantiene ubicación por defecto si el GPS está apagado
      }
    }
    initLocation();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Cargar catálogo de la categoría activa (con caché TTL y fallback automático)
  const fetchCategoryCatalog = useCallback(
    async (category: ConstellationCategory, forceRefresh: boolean = false) => {
      setLoadingCatalog(true);
      try {
        const res = await dataOrchestrator.getCatalog(
          category,
          settings.cacheTtlHours,
          forceRefresh
        );
        setCatalog(res.items);
        setProviderUsed(res.providerUsed);
        setCacheAgeHours(res.ageHours);

        // Si el satélite seleccionado está en este catálogo, actualizar sus elementos orbitales
        const updatedSelected = res.items.find(
          (i) => i.noradId === selectedSat.noradId
        );
        if (updatedSelected) {
          setSelectedSat(updatedSelected);
        }

        if (category === 'starlink') {
          setStarlinkCatalog(res.items);
        }
      } finally {
        setLoadingCatalog(false);
      }
    },
    [settings.cacheTtlHours, selectedSat.noradId]
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      await fetchCategoryCatalog(activeCategory, false);
    });
    return () => {
      active = false;
    };
  }, [activeCategory, fetchCategoryCatalog]);

  // Pre-cargar constelación Starlink cuando el usuario activa la capa en el mapa
  const handleToggleConstellation = async () => {
    const nextState = !showConstellation;
    setShowConstellation(nextState);
    if (nextState && starlinkCatalog.length <= 15) {
      const res = await dataOrchestrator.getCatalog(
        'starlink',
        settings.cacheTtlHours,
        false
      );
      setStarlinkCatalog(res.items);
    }
  };

  // 3. Ciclo de propagación SGP4 en tiempo real (RF-02, RF-03, RF-10, RF-13)
  useEffect(() => {
    const updatePositions = () => {
      const now = new Date();
      const pos = calculateSubsatellitePosition(selectedSat, now);
      const topo = calculateTopocentricPosition(
        selectedSat,
        observer,
        now,
        settings.minElevationDeg
      );
      setSatPosition(pos);
      setSatTopo(topo);

      if (showConstellation) {
        const batch = propagateConstellationBatch(
          starlinkCatalog,
          settings.constellationLimit,
          now
        );
        setConstellationPositions(batch);
      }
    };

    updatePositions();
    const timer = setInterval(updatePositions, settings.refreshIntervalSec * 1000);
    return () => clearInterval(timer);
  }, [
    selectedSat,
    observer,
    settings.minElevationDeg,
    settings.refreshIntervalSec,
    settings.constellationLimit,
    showConstellation,
    starlinkCatalog,
  ]);

  const handleSelectSatellite = (sat: OrbitalElements) => {
    setSelectedSat(sat);
    setActiveTab('map');
  };

  const handleUpdateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const selectedSatAgeHours = dataOrchestrator.getDataAgeHours(selectedSat);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Encabezado de la aplicación */}
      <View style={styles.appHeader}>
        <View>
          <Text style={styles.appTitle}>TP7 • Satellite Tracker SGP4</Text>
          <Text style={styles.appSub}>
            FCyT UADER • Obs: {observer.latitude.toFixed(2)}°,{' '}
            {observer.longitude.toFixed(2)}° ({observer.source.toUpperCase()})
          </Text>
        </View>
        <TouchableOpacity
          style={styles.quickSatPill}
          onPress={() => setActiveTab('catalog')}
        >
          <Text style={styles.quickSatText} numberOfLines={1}>
            {selectedSat.name} ▾
          </Text>
        </TouchableOpacity>
      </View>

      {/* Contenido de la pestaña activa */}
      <View style={styles.mainContent}>
        {activeTab === 'map' && (
          <MapScreen
            selectedSat={selectedSat}
            satPosition={satPosition}
            satTopo={satTopo}
            observer={observer}
            settings={settings}
            dataAgeHours={selectedSatAgeHours}
            providerLabel={selectedSat.source}
            showConstellation={showConstellation}
            onToggleConstellation={handleToggleConstellation}
            constellationPositions={constellationPositions}
            onSelectConstellationSat={handleSelectSatellite}
          />
        )}

        {activeTab === 'catalog' && (
          <CatalogScreen
            catalog={catalog}
            selectedSat={selectedSat}
            activeCategory={activeCategory}
            providerUsed={providerUsed}
            cacheAgeHours={cacheAgeHours}
            loading={loadingCatalog}
            onChangeCategory={(cat) => setActiveCategory(cat)}
            onRefreshCatalog={() => fetchCategoryCatalog(activeCategory, true)}
            onSelectSatellite={handleSelectSatellite}
          />
        )}

        {activeTab === 'passes' && (
          <PassesScreen
            selectedSat={selectedSat}
            observer={observer}
            currentTopo={satTopo}
            settings={settings}
          />
        )}

        {activeTab === 'compass' && (
          <CompassScreen
            selectedSat={selectedSat}
            observer={observer}
            currentTopo={satTopo}
            settings={settings}
          />
        )}

        {activeTab === 'validation' && (
          <ValidationScreen
            selectedSat={selectedSat}
            observer={observer}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </View>

      {/* Barra de navegación inferior */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'map' && styles.tabItemActive]}
          onPress={() => setActiveTab('map')}
        >
          <Text style={styles.tabIcon}>🗺️</Text>
          <Text
            style={[styles.tabLabel, activeTab === 'map' && styles.tabLabelActive]}
          >
            Mapa
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'catalog' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('catalog')}
        >
          <Text style={styles.tabIcon}>🛰️</Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'catalog' && styles.tabLabelActive,
            ]}
          >
            Catálogo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'passes' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('passes')}
        >
          <Text style={styles.tabIcon}>📡</Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'passes' && styles.tabLabelActive,
            ]}
          >
            Pases/Sky
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'compass' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('compass')}
        >
          <Text style={styles.tabIcon}>🧭</Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'compass' && styles.tabLabelActive,
            ]}
          >
            Brújula
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'validation' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('validation')}
        >
          <Text style={styles.tabIcon}>🔬</Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'validation' && styles.tabLabelActive,
            ]}
          >
            Validar/API
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  appTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  appSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },
  quickSatPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#38BDF8',
    maxWidth: 150,
  },
  quickSatText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  mainContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingVertical: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 8,
  },
  tabIcon: {
    fontSize: 16,
  },
  tabLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
});
