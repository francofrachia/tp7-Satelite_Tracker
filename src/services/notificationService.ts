import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { SatellitePass } from '../types/satellite';

// Configura cómo se muestran las notificaciones cuando la app está en primer plano
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Ignorar en entornos sin soporte nativo de notificaciones (ej. web)
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * RF-06: Programa una notificación local N minutos antes del inicio (AOS) de un pase visible.
 * Si faltan menos de N minutos para el pase, dispara la alerta a los pocos segundos.
 */
export async function schedulePassReminder(
  pass: SatellitePass,
  minutesBefore: number = 10
): Promise<{ scheduled: boolean; message: string }> {
  const hasPerm = await requestNotificationPermissions();
  if (!hasPerm) {
    return {
      scheduled: false,
      message: 'Permiso de notificaciones no otorgado en el dispositivo.',
    };
  }

  const triggerTimeMs = pass.aosTime - minutesBefore * 60 * 1000;
  const nowMs = Date.now();
  const secondsUntilTrigger = Math.max(3, Math.round((triggerTimeMs - nowMs) / 1000));

  const aosDateStr = new Date(pass.aosTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🛰️ Pase próximo: ${pass.satName}`,
      body: `AOS a las ${aosDateStr} (Az: ${pass.aosAzimuthDeg.toFixed(0)}°) • Elev. máx: ${pass.maxElevationDeg.toFixed(1)}°`,
      data: { passId: pass.id, noradId: pass.noradId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntilTrigger,
      repeats: false,
    },
  });

  if (triggerTimeMs <= nowMs) {
    return {
      scheduled: true,
      message: `El pase está muy próximo; recibirás la alerta en 3 segundos.`,
    };
  }

  const minutesWait = Math.round(secondsUntilTrigger / 60);
  return {
    scheduled: true,
    message: `Recordatorio programado (${minutesBefore} min antes del AOS, en ~${minutesWait} min).`,
  };
}

/**
 * Dispara una notificación de demostración en 3 segundos (útil para el video demo entregable de la Sección 6).
 */
export async function triggerDemoPassNotification(
  satName: string,
  maxElevationDeg: number = 64.5,
  azimuthDeg: number = 215
): Promise<boolean> {
  const hasPerm = await requestNotificationPermissions();
  if (!hasPerm) return false;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🛰️ [Alerta de Pase] ${satName}`,
      body: `Pase visible en 10 min • Apuntar al Azimut ${azimuthDeg.toFixed(0)}° (Elevación máx: ${maxElevationDeg.toFixed(1)}°)`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3,
      repeats: false,
    },
  });

  return true;
}
