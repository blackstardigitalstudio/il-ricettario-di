/**
 * Per-installation unique Device ID.
 * Persisted in AsyncStorage so every phone gets its own user_id on the backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'device_id_v1';

function uuidv4(): string {
  // RFC4122 v4 generator that works on both native and web (no crypto required)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing && existing.length >= 16) {
      cached = existing;
      return existing;
    }
  } catch (e) { /* ignore */ }
  const fresh = uuidv4();
  try { await AsyncStorage.setItem(KEY, fresh); } catch (e) { /* ignore */ }
  cached = fresh;
  return fresh;
}
