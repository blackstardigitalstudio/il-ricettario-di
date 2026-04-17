import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceId } from './device';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  try {
    token = await AsyncStorage.getItem('session_token');
  } catch (e) {
    // No token available
  }

  // Always attach a per-installation device id so the backend can isolate data
  // even when the user is not logged in with Google.
  const deviceId = await getDeviceId();

  const headers: any = { ...options.headers, 'X-Device-Id': deviceId };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.method === 'POST' || options.method === 'PUT') {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }
  return fetch(`${API_URL}${path}`, { ...options, headers });
}
