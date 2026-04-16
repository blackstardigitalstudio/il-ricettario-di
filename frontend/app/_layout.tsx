import React, { useState, useEffect, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export type UserData = {
  user_id: string;
  email: string;
  name: string;
  picture: string;
  session_token: string;
};

// Auth context - simple global state
let globalUser: UserData | null = null;
let globalToken: string | null = null;
let globalSetUser: ((u: UserData | null) => void) | null = null;

export function getAuthToken() { return globalToken; }
export function getUser() { return globalUser; }
export function setGlobalUser(u: UserData | null) {
  globalUser = u;
  globalToken = u?.session_token || null;
  if (globalSetUser) globalSetUser(u);
}

function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      let redirectUrl: string;
      if (Platform.OS === 'web') {
        redirectUrl = window.location.origin + '/';
      } else {
        redirectUrl = Linking.createURL('/');
      }
      
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      
      if (Platform.OS === 'web') {
        window.location.href = authUrl;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        if (result.type === 'success' && result.url) {
          const hash = result.url.split('#')[1];
          if (hash) {
            const params = new URLSearchParams(hash);
            const sessionId = params.get('session_id');
            if (sessionId) {
              await exchangeSession(sessionId);
            }
          }
        }
      }
    } catch (e) {
      console.log('Login error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={ls.container}>
      <View style={ls.content}>
        <Ionicons name="restaurant" size={90} color="#FF6B35" />
        <Text style={ls.appName}>Il Ricettario</Text>
        <Text style={ls.subtitle}>Salva e organizza le tue ricette preferite</Text>
        
        <TouchableOpacity
          style={[ls.googleBtn, loading && ls.disabled]}
          onPress={handleGoogleLogin}
          disabled={loading}
          testID="google-login-btn"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-google" size={22} color="#fff" />
              <Text style={ls.googleBtnText}>Accedi con Google</Text>
            </>
          )}
        </TouchableOpacity>
        
        <Text style={ls.footerText}>I tuoi dati sono al sicuro</Text>
      </View>
    </SafeAreaView>
  );
}

const ls = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  appName: { fontSize: 38, fontWeight: 'bold', color: '#fff', marginTop: 24 },
  subtitle: { fontSize: 16, color: '#888', marginTop: 8, textAlign: 'center', marginBottom: 48 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#4285F4', borderRadius: 14, paddingVertical: 16,
    paddingHorizontal: 32, gap: 12, width: '100%',
  },
  disabled: { opacity: 0.5 },
  googleBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  footerText: { color: '#666', fontSize: 13, marginTop: 24 },
});

async function exchangeSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (res.ok) {
      const data: UserData = await res.json();
      await AsyncStorage.setItem('session_token', data.session_token);
      await AsyncStorage.setItem('user_data', JSON.stringify(data));
      setGlobalUser(data);
      return true;
    }
  } catch (e) {
    console.log('Exchange error:', e);
  }
  return false;
}

export default function RootLayout() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  globalSetUser = setUser;

  useEffect(() => {
    checkAuth();
    if (Platform.OS === 'web') {
      handleWebCallback();
    }
  }, []);

  const handleWebCallback = async () => {
    if (Platform.OS !== 'web') return;
    const hash = window.location.hash;
    if (hash && hash.includes('session_id=')) {
      const params = new URLSearchParams(hash.substring(1));
      const sessionId = params.get('session_id');
      if (sessionId) {
        await exchangeSession(sessionId);
        // Clean URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  };

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const userData = await res.json();
          const fullUser: UserData = {
            ...userData,
            session_token: token,
          };
          setGlobalUser(fullUser);
          setUser(fullUser);
          setLoading(false);
          return;
        }
      }
      // Try stored user data
      const stored = await AsyncStorage.getItem('user_data');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.session_token) {
          const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${parsed.session_token}` },
          });
          if (res.ok) {
            setGlobalUser(parsed);
            setUser(parsed);
            setLoading(false);
            return;
          }
        }
      }
    } catch (e) {
      console.log('Auth check error:', e);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f0f0f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (!user) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <LoginScreen />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f0f0f' } }}>
        <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="folder/[id]" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
