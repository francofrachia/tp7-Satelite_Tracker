import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import type {
  AppSettings,
  ObserverLocation,
  OrbitalElements,
  SatellitePass,
  TopocentricPosition,
} from '../types/satellite';
import { predictUpcomingPasses } from '../services/predictionService';
import { SkyChart } from '../components/SkyChart';
import {
  schedulePassReminder,
  triggerDemoPassNotification,
} from '../services/notificationService';

interface PassesScreenProps {
  selectedSat: OrbitalElements;
  observer: ObserverLocation;
  currentTopo: TopocentricPosition | null;
  settings: AppSettings;
}

function formatDateTimeShort(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatTimeOnly(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const PassesScreen: React.FC<PassesScreenProps> = ({
  selectedSat,
  observer,
  currentTopo,
  settings,
}) => {
  const [hoursAhead, setHoursAhead] = useState<number>(24);
  const [selectedPassId, setSelectedPassId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // RF-04: Calcular próximas ventanas de visibilidad (búsqueda gruesa -> fina)
  const passes = useMemo(() => {
    return predictUpcomingPasses(
      selectedSat,
      observer,
      settings.minElevationDeg,
      hoursAhead,
      10
    );
  }, [selectedSat, observer, settings.minElevationDeg, hoursAhead]);

  const activePass: SatellitePass | null = useMemo(() => {
    if (passes.length === 0) return null;
    if (selectedPassId) {
      const found = passes.find((p) => p.id === selectedPassId);
      if (found) return found;
    }
    return passes[0];
  }, [passes, selectedPassId]);

  const handleScheduleNotification = async (pass: SatellitePass) => {
    const res = await schedulePassReminder(pass, settings.notifyMinutesBefore);
    setStatusMessage(res.message);
    if (Alert.alert) {
      Alert.alert(
        res.scheduled ? 'Notificación Programada' : 'Aviso',
        res.message
      );
    }
  };

  const handleDemoNotification = async () => {
    const ok = await triggerDemoPassNotification(
      selectedSat.name,
      activePass?.maxElevationDeg ?? 62.4,
      activePass?.aosAzimuthDeg ?? 210
    );
    const msg = ok
      ? 'Notificación de prueba disparada (llegará en 3 segundos).'
      : 'Habilita los permisos de notificación en tu dispositivo.';
    setStatusMessage(msg);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Cabecera de observador y umbral */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              Predictor AOS/LOS y Sky Chart Polar
            </Text>
            <Text style={styles.subtitle}>
              Satélite: {selectedSat.name} (#{selectedSat.noradId}) • Elev. mín:{' '}
              {settings.minElevationDeg}°
            </Text>
            <Text style={styles.subtitle}>
              Observador: Lat {observer.latitude.toFixed(3)}°, Lon{' '}
              {observer.longitude.toFixed(3)}° ({observer.source.toUpperCase()})
            </Text>
          </View>
          <TouchableOpacity
            style={styles.demoNotifyBtn}
            onPress={handleDemoNotification}
          >
            <Text style={styles.demoNotifyBtnText}>🔔 Test Alerta (3s)</Text>
          </TouchableOpacity>
        </View>

        {statusMessage && (
          <View style={styles.statusBanner}>
            <Text style={styles.statusBannerText}>{statusMessage}</Text>
          </View>
        )}
      </View>

      {/* RF-05: Gráfico Polar SVG (Sky Chart) */}
      <View style={styles.skyChartCard}>
        <Text style={styles.sectionTitle}>
          {activePass
            ? `Trayectoria Polar del Pase (${formatDateTimeShort(activePass.aosTime)})`
            : 'Domo Celeste Local (Sky Chart)'}
        </Text>
        <Text style={styles.legendText}>
          🟢 AOS (Inicio) • 🟡 MAX (Máx. Elevación) • 🔴 LOS (Fin) • 🔵 Posición Actual
        </Text>

        <SkyChart
          size={270}
          pass={activePass}
          currentTopo={currentTopo}
          minElevationDeg={settings.minElevationDeg}
        />

        {activePass && (
          <View style={styles.activePassSummary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>AOS (Inicio)</Text>
              <Text style={styles.summaryVal}>
                {formatTimeOnly(activePass.aosTime)}
              </Text>
              <Text style={styles.summarySub}>
                Az: {activePass.aosAzimuthDeg.toFixed(0)}°
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>MÁX. ELEVACIÓN</Text>
              <Text style={[styles.summaryVal, { color: '#FACC15' }]}>
                {activePass.maxElevationDeg.toFixed(1)}°
              </Text>
              <Text style={styles.summarySub}>
                Az: {activePass.maxElAzimuthDeg.toFixed(0)}°
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>LOS (Pérdida)</Text>
              <Text style={styles.summaryVal}>
                {formatTimeOnly(activePass.losTime)}
              </Text>
              <Text style={styles.summarySub}>
                Az: {activePass.losAzimuthDeg.toFixed(0)}°
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>DURACIÓN</Text>
              <Text style={styles.summaryVal}>
                {Math.floor(activePass.durationSeconds / 60)}m{' '}
                {activePass.durationSeconds % 60}s
              </Text>
              <Text style={styles.summarySub}>Ventana útil</Text>
            </View>
          </View>
        )}
      </View>

      {/* Selector de ventana de búsqueda */}
      <View style={styles.listHeaderRow}>
        <Text style={styles.sectionTitle}>
          Próximos Pases ({passes.length})
        </Text>
        <View style={styles.windowBtns}>
          {[24, 48].map((hrs) => (
            <TouchableOpacity
              key={hrs}
              style={[
                styles.windowBtn,
                hoursAhead === hrs && styles.windowBtnActive,
              ]}
              onPress={() => setHoursAhead(hrs)}
            >
              <Text style={styles.windowBtnText}>{hrs} h</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* RF-04 y RF-06: Listado de ventanas de visibilidad con botón de recordatorio */}
      {passes.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            Sin pases sobre {settings.minElevationDeg}° en las próximas {hoursAhead} h
          </Text>
          <Text style={styles.emptySub}>
            Nota: Si el satélite es geoestacionario (GEO), permanece fijo respecto al observador.
            Puedes ampliar la ventana a 48 h o reducir el umbral de elevación mínima en Ajustes.
          </Text>
        </View>
      ) : (
        passes.map((pass) => {
          const isSelected = activePass?.id === pass.id;
          return (
            <TouchableOpacity
              key={pass.id}
              style={[styles.passCard, isSelected && styles.passCardSelected]}
              onPress={() => setSelectedPassId(pass.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.passDate}>
                  📅 {formatDateTimeShort(pass.aosTime)}
                </Text>
                <Text style={styles.passDetails}>
                  AOS Az {pass.aosAzimuthDeg.toFixed(0)}° →{' '}
                  <Text style={styles.passMaxHighlight}>
                    Máx {pass.maxElevationDeg.toFixed(1)}°
                  </Text>{' '}
                  → LOS Az {pass.losAzimuthDeg.toFixed(0)}° ({Math.round(pass.durationSeconds / 60)}{' '}
                  min)
                </Text>
              </View>
              <TouchableOpacity
                style={styles.notifyBtn}
                onPress={() => handleScheduleNotification(pass)}
              >
                <Text style={styles.notifyBtnText}>
                  🔔 -{settings.notifyMinutesBefore}m
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 12,
    paddingBottom: 28,
  },
  headerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  demoNotifyBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  demoNotifyBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBanner: {
    marginTop: 8,
    backgroundColor: 'rgba(14, 165, 233, 0.18)',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  statusBannerText: {
    color: '#E0F2FE',
    fontSize: 11,
  },
  skyChartCard: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  legendText: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 4,
    marginBottom: 8,
    textAlign: 'center',
  },
  activePassSummary: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
  },
  summaryVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  summarySub: {
    color: '#64748B',
    fontSize: 10,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  windowBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  windowBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  windowBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  windowBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  passCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  passCardSelected: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(14, 165, 233, 0.14)',
  },
  passDate: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  passDetails: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 3,
  },
  passMaxHighlight: {
    color: '#FACC15',
    fontWeight: '700',
  },
  notifyBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  notifyBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    color: '#94A3B8',
    fontSize: 12,
  },
});
