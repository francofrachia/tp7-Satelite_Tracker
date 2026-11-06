import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import type {
  AppSettings,
  ObserverLocation,
  OrbitalElements,
  ValidationComparison,
} from '../types/satellite';
import { runPositionValidation } from '../services/validationService';
import {
  loadCredentials,
  saveCredentials,
} from '../services/credentialsStore';
import { dataOrchestrator } from '../services/dataOrchestrator';

interface ValidationScreenProps {
  selectedSat: OrbitalElements;
  observer: ObserverLocation;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
}

export const ValidationScreen: React.FC<ValidationScreenProps> = ({
  selectedSat,
  observer,
  settings,
  onUpdateSettings,
}) => {
  const [validating, setValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<ValidationComparison[]>([]);

  // Credenciales guardadas en SecureStore
  const [n2yoKey, setN2yoKey] = useState('');
  const [stUser, setStUser] = useState('');
  const [stPass, setStPass] = useState('');
  const [credsSavedMsg, setCredsSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    loadCredentials().then((creds) => {
      setN2yoKey(creds.n2yoApiKey);
      setStUser(creds.spaceTrackUser);
      setStPass(creds.spaceTrackPassword);
    });
  }, []);

  // Validar contra Where the ISS at? (obtiene automáticamente el TLE actual de la ISS si hay otro satélite seleccionado)
  const handleValidateIss = async () => {
    setValidating(true);
    setErrorMsg(null);
    try {
      let issTarget = selectedSat;
      if (selectedSat.noradId !== 25544) {
        const fetchedIss = await dataOrchestrator.getSatelliteByNoradId(25544);
        if (!fetchedIss) {
          throw new Error('No se pudo obtener el elemento orbital de la ISS (#25544)');
        }
        issTarget = fetchedIss;
      }
      const result = await runPositionValidation(
        issTarget,
        'Where the ISS at?',
        observer
      );
      setHistory((prev) => [result, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al validar contra Where the ISS at?');
    } finally {
      setValidating(false);
    }
  };

  // Validar contra N2YO (cualquier satélite seleccionado)
  const handleValidateN2yo = async () => {
    setValidating(true);
    setErrorMsg(null);
    try {
      const result = await runPositionValidation(selectedSat, 'N2YO', observer);
      setHistory((prev) => [result, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al validar contra N2YO');
    } finally {
      setValidating(false);
    }
  };

  const handleSaveCredentials = async () => {
    await saveCredentials({
      n2yoApiKey: n2yoKey,
      spaceTrackUser: stUser,
      spaceTrackPassword: stPass,
    });
    setCredsSavedMsg('Credenciales guardadas de forma segura en Keychain/Keystore (SecureStore).');
    setTimeout(() => setCredsSavedMsg(null), 4000);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* RF-15: Sección de Validación Cruzada */}
      <View style={styles.card}>
        <Text style={styles.title}>
          🔬 Modo Validación Cruzada SGP4 (RF-15)
        </Text>
        <Text style={styles.subtitle}>
          Compara en tiempo real la geoposición calculada localmente con{' '}
          <Text style={{ color: '#38BDF8', fontWeight: '700' }}>satellite.js</Text>{' '}
          frente a las APIs independientes <Text style={{ fontWeight: '700' }}>Where the ISS at?</Text>{' '}
          y <Text style={{ fontWeight: '700' }}>N2YO</Text> en el mismo instante UTC.
        </Text>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.validateBtnPrimary}
            onPress={handleValidateIss}
            disabled={validating}
          >
            <Text style={styles.validateBtnText}>
              🛰️ Validar ISS (WhereTheISSAt)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.validateBtnSecondary}
            onPress={handleValidateN2yo}
            disabled={validating}
          >
            <Text style={styles.validateBtnText}>
              🌐 Validar {selectedSat.name.slice(0, 12)} (N2YO)
            </Text>
          </TouchableOpacity>
        </View>

        {validating && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#38BDF8" />
            <Text style={styles.loadingText}>
              Consultando API externa y propagando SGP4 en el mismo timestamp...
            </Text>
          </View>
        )}

        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{errorMsg}</Text>
          </View>
        )}

        {/* Resultados en vivo */}
        {history.map((item, idx) => (
          <View key={`${item.timestamp}_${idx}`} style={styles.resultBox}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>
                {item.satName} (#{item.noradId}) vs. {item.provider}
              </Text>
              <Text style={styles.resultTime}>
                {new Date(item.timestamp).toLocaleTimeString()}
              </Text>
            </View>

            <View style={styles.comparisonTable}>
              <View style={styles.tableRowHeader}>
                <Text style={[styles.colLabel, { flex: 1.2 }]}>Parámetro</Text>
                <Text style={styles.colLabel}>SGP4 Local</Text>
                <Text style={styles.colLabel}>{item.provider}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.cellText, { flex: 1.2 }]}>Latitud</Text>
                <Text style={styles.cellValue}>
                  {item.localPosition.latitude.toFixed(4)}°
                </Text>
                <Text style={styles.cellValue}>
                  {item.remotePosition.latitude.toFixed(4)}°
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.cellText, { flex: 1.2 }]}>Longitud</Text>
                <Text style={styles.cellValue}>
                  {item.localPosition.longitude.toFixed(4)}°
                </Text>
                <Text style={styles.cellValue}>
                  {item.remotePosition.longitude.toFixed(4)}°
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.cellText, { flex: 1.2 }]}>Altitud (km)</Text>
                <Text style={styles.cellValue}>
                  {item.localPosition.altitudeKm.toFixed(2)}
                </Text>
                <Text style={styles.cellValue}>
                  {item.remotePosition.altitudeKm.toFixed(2)}
                </Text>
              </View>
              {item.remotePosition.azimuthDeg !== undefined &&
                item.localTopocentric && (
                  <View style={styles.tableRow}>
                    <Text style={[styles.cellText, { flex: 1.2 }]}>Az / El</Text>
                    <Text style={styles.cellValue}>
                      {item.localTopocentric.azimuthDeg.toFixed(1)}° /{' '}
                      {item.localTopocentric.elevationDeg.toFixed(1)}°
                    </Text>
                    <Text style={styles.cellValue}>
                      {item.remotePosition.azimuthDeg.toFixed(1)}° /{' '}
                      {item.remotePosition.elevationDeg?.toFixed(1)}°
                    </Text>
                  </View>
                )}
            </View>

            <View style={styles.errorSummaryRow}>
              <View style={styles.errorPill}>
                <Text style={styles.errorPillLabel}>ERROR SUPERFICIAL</Text>
                <Text style={styles.errorPillVal}>
                  {item.surfaceErrorKm.toFixed(2)} km
                </Text>
              </View>
              <View style={styles.errorPill}>
                <Text style={styles.errorPillLabel}>Δ ALTITUD</Text>
                <Text style={styles.errorPillVal}>
                  {item.altitudeErrorKm.toFixed(2)} km
                </Text>
              </View>
              <View style={styles.errorPill}>
                <Text style={styles.errorPillLabel}>ERROR 3D TOTAL</Text>
                <Text style={[styles.errorPillVal, { color: '#4ADE80' }]}>
                  {item.total3DErrorKm.toFixed(2)} km
                </Text>
              </View>
              <View style={styles.errorPill}>
                <Text style={styles.errorPillLabel}>EDAD TLE</Text>
                <Text style={styles.errorPillVal}>
                  {item.tleAgeHours.toFixed(1)} h
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Configuración de Parámetros Operativos (RF-06, RF-12, RF-13) */}
      <View style={styles.card}>
        <Text style={styles.title}>⚙️ Parámetros de Visibilidad y Rendimiento</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>
            Elevación mínima (AOS/LOS y Footprint): {settings.minElevationDeg}°
          </Text>
          <View style={styles.chipsRow}>
            {[5, 10, 15, 25].map((deg) => (
              <TouchableOpacity
                key={deg}
                style={[
                  styles.optionChip,
                  settings.minElevationDeg === deg && styles.optionChipActive,
                ]}
                onPress={() => onUpdateSettings({ minElevationDeg: deg })}
              >
                <Text style={styles.optionChipText}>{deg}°</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>
            Notificar antes del pase (RF-06): {settings.notifyMinutesBefore} min
          </Text>
          <View style={styles.chipsRow}>
            {[5, 10, 15, 30].map((min) => (
              <TouchableOpacity
                key={min}
                style={[
                  styles.optionChip,
                  settings.notifyMinutesBefore === min && styles.optionChipActive,
                ]}
                onPress={() => onUpdateSettings({ notifyMinutesBefore: min })}
              >
                <Text style={styles.optionChipText}>{min}m</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>
            Límite capa de constelación Starlink (RF-13): {settings.constellationLimit} sats
          </Text>
          <View style={styles.chipsRow}>
            {[25, 50, 80].map((lim) => (
              <TouchableOpacity
                key={lim}
                style={[
                  styles.optionChip,
                  settings.constellationLimit === lim && styles.optionChipActive,
                ]}
                onPress={() => onUpdateSettings({ constellationLimit: lim })}
              >
                <Text style={styles.optionChipText}>{lim}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Credenciales Seguras de APIs (Sección 4.3: SecureStore / Keychain / Keystore) */}
      <View style={styles.card}>
        <Text style={styles.title}>
          🔐 Credenciales de APIs (Almacenamiento Seguro)
        </Text>
        <Text style={styles.subtitle}>
          CelesTrak y Where the ISS at? funcionan sin API Key. Para habilitar la validación
          contra N2YO o el fallback con Space-Track, ingresa tus claves aquí (se guardan cifradas
          con expo-secure-store fuera del bundle).
        </Text>

        <Text style={styles.inputLabel}>N2YO API Key (Gratuita en n2yo.com/api):</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. ABCD12-EFGH34-IJKL56-MNOP"
          placeholderTextColor="#64748B"
          value={n2yoKey}
          onChangeText={setN2yoKey}
          autoCapitalize="none"
        />

        <Text style={styles.inputLabel}>Space-Track.org Usuario (Email):</Text>
        <TextInput
          style={styles.input}
          placeholder="usuario@ejemplo.com"
          placeholderTextColor="#64748B"
          value={stUser}
          onChangeText={setStUser}
          autoCapitalize="none"
        />

        <Text style={styles.inputLabel}>Space-Track.org Contraseña:</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••••••"
          placeholderTextColor="#64748B"
          value={stPass}
          onChangeText={setStPass}
          secureTextEntry
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCredentials}>
          <Text style={styles.saveBtnText}>Guardar en Almacenamiento Seguro</Text>
        </TouchableOpacity>

        {credsSavedMsg && (
          <Text style={styles.savedText}>{credsSavedMsg}</Text>
        )}
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
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
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
    lineHeight: 17,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  validateBtnPrimary: {
    flex: 1,
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  validateBtnSecondary: {
    flex: 1,
    backgroundColor: '#7C3AED',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  validateBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  errorBanner: {
    marginTop: 10,
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 12,
  },
  resultBox: {
    marginTop: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  resultTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  resultTime: {
    color: '#64748B',
    fontSize: 11,
  },
  comparisonTable: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 6,
  },
  tableRowHeader: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  colLabel: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  cellText: {
    flex: 1,
    color: '#CBD5E1',
    fontSize: 11,
  },
  cellValue: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  errorSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  errorPill: {
    flex: 1,
    alignItems: 'center',
  },
  errorPillLabel: {
    color: '#64748B',
    fontSize: 8,
    fontWeight: '700',
  },
  errorPillVal: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  settingRow: {
    marginTop: 10,
  },
  settingLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionChip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  optionChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  optionChipText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 12,
  },
  saveBtn: {
    marginTop: 12,
    backgroundColor: '#16A34A',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  savedText: {
    color: '#4ADE80',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
});
