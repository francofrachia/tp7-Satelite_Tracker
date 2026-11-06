import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import type {
  AppSettings,
  ObserverLocation,
  OrbitalElements,
  SubsatellitePosition,
  TopocentricPosition,
} from '../types/satellite';
import {
  calculateFootprintRadiusMeters,
  calculateGroundTrackSegments,
} from '../services/orbitalEngine';

interface MapScreenProps {
  selectedSat: OrbitalElements;
  satPosition: SubsatellitePosition | null;
  satTopo: TopocentricPosition | null;
  observer: ObserverLocation;
  settings: AppSettings;
  dataAgeHours: number;
  providerLabel: string;
  showConstellation: boolean;
  onToggleConstellation: () => void;
  constellationPositions: {
    elements: OrbitalElements;
    position: SubsatellitePosition;
  }[];
  onSelectConstellationSat: (sat: OrbitalElements) => void;
}

export const MapScreen: React.FC<MapScreenProps> = ({
  selectedSat,
  satPosition,
  satTopo,
  observer,
  settings,
  dataAgeHours,
  providerLabel,
  showConstellation,
  onToggleConstellation,
  constellationPositions,
  onSelectConstellationSat,
}) => {
  const mapRef = useRef<MapView | null>(null);
  const [showGroundTrack, setShowGroundTrack] = useState(true);
  const [showFootprint, setShowFootprint] = useState(true);
  const [followSat, setFollowSat] = useState(false);

  // RF-11: Ground track pasado y futuro con corte en el antimeridiano (recalculado cada 30 s)
  const currentTimestamp = satPosition?.timestamp ?? 0;
  const groundTrackWindowKey = Math.floor(currentTimestamp / 30000);
  const { pastSegments, futureSegments } = useMemo(() => {
    const centerDate = groundTrackWindowKey > 0 ? new Date(groundTrackWindowKey * 30000) : new Date(0);
    return calculateGroundTrackSegments(selectedSat, centerDate, 45);
  }, [selectedSat, groundTrackWindowKey]);

  // RF-12: Radio del footprint según altitud actual y elevación mínima configurada
  const footprintRadiusMeters = useMemo(() => {
    if (!satPosition) return 0;
    return calculateFootprintRadiusMeters(
      satPosition.altitudeKm,
      settings.minElevationDeg
    );
  }, [satPosition, settings.minElevationDeg]);

  const centerOnSatellite = () => {
    if (satPosition && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: satPosition.latitude,
          longitude: satPosition.longitude,
          latitudeDelta: 45,
          longitudeDelta: 45,
        },
        600
      );
    }
  };

  const centerOnObserver = () => {
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: observer.latitude,
          longitude: observer.longitude,
          latitudeDelta: 25,
          longitudeDelta: 25,
        },
        600
      );
    }
  };

  // Si está activo el seguimiento automático, centrar suavemente
  React.useEffect(() => {
    if (followSat && satPosition && mapRef.current) {
      mapRef.current.animateCamera({
        center: {
          latitude: satPosition.latitude,
          longitude: satPosition.longitude,
        },
      });
    }
  }, [followSat, satPosition]);

  const isStale = dataAgeHours > 24;

  return (
    <View style={styles.container}>
      {/* Banner superior con datos del satélite y antigüedad de TLE/OMM (RF-16) */}
      <View style={styles.topHud}>
        <View style={styles.satHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.satTitle} numberOfLines={1}>
              🛰️ {selectedSat.name}{' '}
              <Text style={styles.noradBadge}>#{selectedSat.noradId}</Text>
            </Text>
            <Text style={styles.providerSub}>
              Fuente: {providerLabel} • Antigüedad TLE: {dataAgeHours.toFixed(1)} h
            </Text>
          </View>
          <View
            style={[
              styles.visibilityPill,
              satTopo?.isVisible ? styles.visActive : styles.visInactive,
            ]}
          >
            <Text style={styles.visibilityText}>
              {satTopo?.isVisible
                ? `VISIBLE (${satTopo.elevationDeg.toFixed(1)}°)`
                : satTopo && satTopo.elevationDeg > 0
                ? `BAJO UMBRAL (${satTopo.elevationDeg.toFixed(1)}°)`
                : 'BAJO HORIZONTE'}
            </Text>
          </View>
        </View>

        {isStale && (
          <View style={styles.staleWarning}>
            <Text style={styles.staleWarningText}>
              ⚠️ Datos orbitales con más de 24 h de antigüedad. Se recomienda actualizar el catálogo.
            </Text>
          </View>
        )}
      </View>

      {/* Mapa Mundial (RF-10, RF-11, RF-12, RF-13) */}
      <View style={styles.mapWrapper}>
        {Platform.OS === 'web' ? (
          <View style={styles.webFallback}>
            <Text style={styles.webFallbackTitle}>
              Vista de Mapa Nativa (iOS / Android)
            </Text>
            <Text style={styles.webFallbackSub}>
              Abre el proyecto en Expo Go en tu iPhone o Android para ver el mapa interactivo con
              Ground Track, Footprint y Constelación Starlink.
            </Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: satPosition?.latitude ?? observer.latitude,
              longitude: satPosition?.longitude ?? observer.longitude,
              latitudeDelta: 65,
              longitudeDelta: 65,
            }}
            mapType="hybrid"
            rotateEnabled={false}
          >
            {/* Marcador de la posición GPS del usuario */}
            <Marker
              coordinate={{
                latitude: observer.latitude,
                longitude: observer.longitude,
              }}
              title="Tu Ubicación (Observador)"
              description={`Lat ${observer.latitude.toFixed(4)}°, Lon ${observer.longitude.toFixed(4)}°`}
              pinColor="#22C55E"
            />

            {/* RF-11: Ground Track Pasado (línea punteada gris/celeste) */}
            {showGroundTrack &&
              pastSegments.map((seg, idx) => (
                <Polyline
                  key={`past_${idx}`}
                  coordinates={seg}
                  strokeColor="rgba(148, 163, 184, 0.75)"
                  strokeWidth={2}
                  lineDashPattern={[6, 4]}
                />
              ))}

            {/* RF-11: Ground Track Futuro (órbita completa con corte en antimeridiano) */}
            {showGroundTrack &&
              futureSegments.map((seg, idx) => (
                <Polyline
                  key={`future_${idx}`}
                  coordinates={seg}
                  strokeColor="#38BDF8"
                  strokeWidth={2.5}
                />
              ))}

            {/* RF-12: Footprint (Área de cobertura según altitud y elevación mínima) */}
            {showFootprint && satPosition && footprintRadiusMeters > 0 && (
              <Circle
                center={{
                  latitude: satPosition.latitude,
                  longitude: satPosition.longitude,
                }}
                radius={footprintRadiusMeters}
                strokeColor="rgba(56, 189, 248, 0.85)"
                fillColor="rgba(56, 189, 248, 0.16)"
                strokeWidth={1.5}
              />
            )}

            {/* RF-13: Capa de Constelación Starlink (múltiples satélites simultáneos optimizados) */}
            {showConstellation &&
              constellationPositions.map((item) => {
                if (item.elements.noradId === selectedSat.noradId) return null;
                return (
                  <Marker
                    key={`const_${item.elements.noradId}`}
                    coordinate={{
                      latitude: item.position.latitude,
                      longitude: item.position.longitude,
                    }}
                    title={item.elements.name}
                    description={`Alt: ${item.position.altitudeKm.toFixed(0)} km • Toca para seguir`}
                    onCalloutPress={() => onSelectConstellationSat(item.elements)}
                    tracksViewChanges={false}
                  >
                    <View style={styles.starlinkDot} />
                  </Marker>
                );
              })}

            {/* RF-10: Marcador en tiempo real del satélite seleccionado */}
            {satPosition && (
              <Marker
                coordinate={{
                  latitude: satPosition.latitude,
                  longitude: satPosition.longitude,
                }}
                title={`${selectedSat.name} (#${selectedSat.noradId})`}
                description={`Alt: ${satPosition.altitudeKm.toFixed(1)} km | Vel: ${satPosition.velocityKmS.toFixed(2)} km/s`}
              >
                <View style={styles.satMarkerContainer}>
                  <View style={styles.satMarkerPulse} />
                  <View style={styles.satMarkerCore}>
                    <Text style={styles.satMarkerEmoji}>🛰️</Text>
                  </View>
                </View>
              </Marker>
            )}
          </MapView>
        )}

        {/* Controles flotantes de capas del mapa */}
        <View style={styles.floatingControls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, showGroundTrack && styles.ctrlBtnActive]}
            onPress={() => setShowGroundTrack((v) => !v)}
          >
            <Text style={styles.ctrlBtnText}>Órbita</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, showFootprint && styles.ctrlBtnActive]}
            onPress={() => setShowFootprint((v) => !v)}
          >
            <Text style={styles.ctrlBtnText}>Footprint</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, showConstellation && styles.ctrlBtnStarlink]}
            onPress={onToggleConstellation}
          >
            <Text style={styles.ctrlBtnText}>
              {showConstellation
                ? `Starlink (${constellationPositions.length})`
                : 'Capa Starlink'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, followSat && styles.ctrlBtnActive]}
            onPress={() => {
              setFollowSat((v) => !v);
              centerOnSatellite();
            }}
          >
            <Text style={styles.ctrlBtnText}>Centrar Sat</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.ctrlBtn} onPress={centerOnObserver}>
            <Text style={styles.ctrlBtnText}>Mi GPS</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Panel inferior de telemetría SGP4 en tiempo real (RF-02 y RF-03) */}
      <View style={styles.telemetryPanel}>
        <View style={styles.telemetryGrid}>
          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>LATITUD</Text>
            <Text style={styles.telemetryValue}>
              {satPosition ? `${satPosition.latitude.toFixed(4)}°` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>LONGITUD</Text>
            <Text style={styles.telemetryValue}>
              {satPosition ? `${satPosition.longitude.toFixed(4)}°` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>ALTITUD</Text>
            <Text style={styles.telemetryValue}>
              {satPosition ? `${satPosition.altitudeKm.toFixed(1)} km` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>VELOCIDAD</Text>
            <Text style={styles.telemetryValue}>
              {satPosition ? `${satPosition.velocityKmS.toFixed(2)} km/s` : '--'}
            </Text>
          </View>
        </View>

        <View style={[styles.telemetryGrid, { marginTop: 6 }]}>
          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>AZIMUT (OBS)</Text>
            <Text style={styles.telemetryValueAccent}>
              {satTopo ? `${satTopo.azimuthDeg.toFixed(1)}°` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>ELEVACIÓN</Text>
            <Text style={styles.telemetryValueAccent}>
              {satTopo ? `${satTopo.elevationDeg.toFixed(1)}°` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>DISTANCIA</Text>
            <Text style={styles.telemetryValue}>
              {satTopo ? `${satTopo.rangeKm.toFixed(0)} km` : '--'}
            </Text>
          </View>
          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>RADIO FOOTPRINT</Text>
            <Text style={styles.telemetryValue}>
              {footprintRadiusMeters > 0
                ? `${(footprintRadiusMeters / 1000).toFixed(0)} km`
                : '--'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topHud: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  satHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  satTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  noradBadge: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  providerSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  visibilityPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  visActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  visInactive: {
    backgroundColor: 'rgba(100, 116, 139, 0.25)',
    borderWidth: 1,
    borderColor: '#475569',
  },
  visibilityText: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '700',
  },
  staleWarning: {
    marginTop: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  staleWarningText: {
    color: '#FCD34D',
    fontSize: 11,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  webFallbackTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  webFallbackSub: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },
  floatingControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    gap: 6,
  },
  ctrlBtn: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
  },
  ctrlBtnActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.85)',
    borderColor: '#38BDF8',
  },
  ctrlBtnStarlink: {
    backgroundColor: 'rgba(168, 85, 247, 0.88)',
    borderColor: '#C084FC',
  },
  ctrlBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  satMarkerContainer: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  satMarkerPulse: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  satMarkerCore: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  satMarkerEmoji: {
    fontSize: 13,
  },
  starlinkDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#C084FC',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  telemetryPanel: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  telemetryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  telemetryCell: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
  },
  telemetryValue: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  telemetryValueAccent: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
});
