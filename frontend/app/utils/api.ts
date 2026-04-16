import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await AsyncStorage.getItem('session_token');
  const headers: any = {
    ...options.headers,
  };
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
