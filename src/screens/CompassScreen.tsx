import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import type {
  AppSettings,
  ObserverLocation,
  OrbitalElements,
  TopocentricPosition,
} from '../types/satellite';
import { SkyChart } from '../components/SkyChart';

interface CompassScreenProps {
  selectedSat: OrbitalElements;
  observer: ObserverLocation;
  currentTopo: TopocentricPosition | null;
  settings: AppSettings;
}

export const CompassScreen: React.FC<CompassScreenProps> = ({
  selectedSat,
  currentTopo,
  settings,
}) => {
  const [deviceHeadingDeg, setDeviceHeadingDeg] = useState<number>(0);
  const [sensorSource, setSensorSource] = useState<'gps-heading' | 'magnetometer' | 'manual'>('manual');

  useEffect(() => {
    let headingSub: Location.LocationSubscription | null = null;
    let magSub: { remove: () => void } | null = null;
    let active = true;

    async function startHeadingSensors() {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.granted && active) {
          headingSub = await Location.watchHeadingAsync((headingData) => {
            if (!active) return;
            const h =
              headingData.trueHeading >= 0
                ? headingData.trueHeading
                : headingData.magHeading;
            if (h >= 0) {
              setDeviceHeadingDeg(Math.round(h));
              setSensorSource('gps-heading');
            }
          });
          return;
        }
      } catch {
        // Fallback a Magnetómetro directo de expo-sensors
      }

      try {
        const available = await Magnetometer.isAvailableAsync();
        if (available && active) {
          Magnetometer.setUpdateInterval(200);
          magSub = Magnetometer.addListener((data) => {
            if (!active) return;
            let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
            angle = (angle + 360) % 360;
            setDeviceHeadingDeg(Math.round(angle));
            setSensorSource('magnetometer');
          });
        }
      } catch {
        // Si está en emulador sin brújula, queda en modo manual asistido
      }
    }

    startHeadingSensors();

    return () => {
      active = false;
      if (headingSub) headingSub.remove();
      if (magSub) magSub.remove();
    };
  }, []);

  const targetAzimuth = currentTopo?.azimuthDeg ?? 0;
  const targetElevation = currentTopo?.elevationDeg ?? 0;

  // Diferencia angular más corta [-180°, +180°]
  let deltaAz = ((targetAzimuth - deviceHeadingDeg + 540) % 360) - 180;
  const isAzAligned = Math.abs(deltaAz) <= 10;

  const getTurnInstruction = (): string => {
    if (isAzAligned) return '✅ ¡AZIMUT ALINEADO CON EL SATÉLITE!';
    if (deltaAz > 0) {
      return `↪️ Gira ${Math.abs(deltaAz).toFixed(0)}° hacia la DERECHA`;
    }
    return `↩️ Gira ${Math.abs(deltaAz).toFixed(0)}° hacia la IZQUIERDA`;
  };

  const getElevationInstruction = (): string => {
    if (targetElevation >= settings.minElevationDeg) {
      return `📐 Inclina el teléfono +${targetElevation.toFixed(1)}° sobre el horizonte (Satélite Visible)`;
    }
    if (targetElevation >= 0) {
      return `📐 Satélite a +${targetElevation.toFixed(1)}° sobre el horizonte (bajo umbral mínimo de ${settings.minElevationDeg}°)`;
    }
    return `🌐 El satélite está actualmente a ${targetElevation.toFixed(1)}° (bajo el horizonte local)`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>
          🧭 Modo Brújula y Orientación Asistida (RF-07)
        </Text>
        <Text style={styles.subtitle}>
          Apunta tu dispositivo hacia{' '}
          <Text style={{ color: '#38BDF8', fontWeight: '700' }}>
            {selectedSat.name}
          </Text>{' '}
          • Sensor:{' '}
          {sensorSource === 'gps-heading'
            ? 'Brújula Digital iOS/Android'
            : sensorSource === 'magnetometer'
            ? 'Magnetómetro'
            : 'Simulador Manual'}
        </Text>

        {/* Tarjeta de instrucción de giro en tiempo real */}
        <View
          style={[
            styles.alignmentBanner,
            isAzAligned ? styles.alignedBox : styles.notAlignedBox,
          ]}
        >
          <Text style={styles.alignmentTitle}>{getTurnInstruction()}</Text>
          <Text style={styles.elevationText}>{getElevationInstruction()}</Text>
        </View>

        {/* Indicadores numéricos comparativos */}
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>RUMBO DISPOSITIVO</Text>
            <Text style={[styles.metricValue, { color: '#A855F7' }]}>
              {deviceHeadingDeg}°
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>AZIMUT SATÉLITE</Text>
            <Text style={[styles.metricValue, { color: '#38BDF8' }]}>
              {targetAzimuth.toFixed(1)}°
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>ELEVACIÓN SAT</Text>
            <Text
              style={[
                styles.metricValue,
                { color: targetElevation >= 0 ? '#22C55E' : '#F87171' },
              ]}
            >
              {targetElevation.toFixed(1)}°
            </Text>
          </View>
        </View>

        {/* SkyChart con el rayo morado indicando hacia dónde apunta el dispositivo */}
        <View style={styles.chartContainer}>
          <SkyChart
            size={265}
            currentTopo={
              currentTopo
                ? {
                    ...currentTopo,
                    // Si está bajo el horizonte lo mostramos en el borde (0°) para orientar en azimut
                    elevationDeg: Math.max(0, currentTopo.elevationDeg),
                  }
                : null
            }
            minElevationDeg={settings.minElevationDeg}
            deviceHeadingDeg={deviceHeadingDeg}
          />
          <Text style={styles.chartCaption}>
            🟣 Línea punteada: rumbo de tu teléfono ({deviceHeadingDeg}°) • 🔵 Objetivo:{' '}
            {selectedSat.name} ({targetAzimuth.toFixed(0)}°)
          </Text>
        </View>

        {/* Controles manuales de rumbo (útiles en emulador o para calibrar) */}
        <View style={styles.manualSection}>
          <Text style={styles.manualLabel}>
            Ajuste manual de brújula (para pruebas en emulador):
          </Text>
          <View style={styles.manualBtnsRow}>
            <TouchableOpacity
              style={styles.manualBtn}
              onPress={() => {
                setSensorSource('manual');
                setDeviceHeadingDeg((h) => (h - 15 + 360) % 360);
              }}
            >
              <Text style={styles.manualBtnText}>-15° Izq</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manualBtnAccent}
              onPress={() => {
                setSensorSource('manual');
                setDeviceHeadingDeg(Math.round(targetAzimuth));
              }}
            >
              <Text style={styles.manualBtnText}>Alinear al Satélite</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manualBtn}
              onPress={() => {
                setSensorSource('manual');
                setDeviceHeadingDeg((h) => (h + 15) % 360);
              }}
            >
              <Text style={styles.manualBtnText}>+15° Der</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  alignmentBanner: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 12,
    alignItems: 'center',
  },
  alignedBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderColor: '#22C55E',
  },
  notAlignedBox: {
    backgroundColor: 'rgba(14, 165, 233, 0.14)',
    borderColor: '#38BDF8',
  },
  alignmentTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  elevationText: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 6,
  },
  chartCaption: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  manualSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  manualLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 8,
    textAlign: 'center',
  },
  manualBtnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  manualBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  manualBtnAccent: {
    flex: 1.3,
    backgroundColor: '#7C3AED',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  manualBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
});
