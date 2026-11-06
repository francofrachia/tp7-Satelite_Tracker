import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY_N2YO_API = 'tp7_n2yo_api_key';
const KEY_SPACETRACK_USER = 'tp7_spacetrack_user';
const KEY_SPACETRACK_PASS = 'tp7_spacetrack_pass';

export interface ProviderCredentials {
  n2yoApiKey: string;
  spaceTrackUser: string;
  spaceTrackPassword: string;
}

async function setItemSecure(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function getItemSecure(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

export async function loadCredentials(): Promise<ProviderCredentials> {
  const [n2yo, stUser, stPass] = await Promise.all([
    getItemSecure(KEY_N2YO_API),
    getItemSecure(KEY_SPACETRACK_USER),
    getItemSecure(KEY_SPACETRACK_PASS),
  ]);

  return {
    n2yoApiKey: n2yo || process.env.EXPO_PUBLIC_N2YO_API_KEY || '',
    spaceTrackUser: stUser || process.env.EXPO_PUBLIC_SPACETRACK_USER || '',
    spaceTrackPassword: stPass || process.env.EXPO_PUBLIC_SPACETRACK_PASSWORD || '',
  };
}

export async function saveCredentials(creds: Partial<ProviderCredentials>): Promise<void> {
  if (creds.n2yoApiKey !== undefined) {
    await setItemSecure(KEY_N2YO_API, creds.n2yoApiKey.trim());
  }
  if (creds.spaceTrackUser !== undefined) {
    await setItemSecure(KEY_SPACETRACK_USER, creds.spaceTrackUser.trim());
  }
  if (creds.spaceTrackPassword !== undefined) {
    await setItemSecure(KEY_SPACETRACK_PASS, creds.spaceTrackPassword);
  }
}
