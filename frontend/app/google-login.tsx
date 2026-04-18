import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '../src/utils/api';
import { useLang } from '../src/context/LangContext';

// IMPORTANT:
// We keep the historical https redirect target so the Emergent auth backend accepts it.
// With WebBrowser.openAuthSessionAsync, the system browser (Chrome Custom Tabs on
// Android / ASWebAuthenticationSession on iOS) will close and return control to our
// app as soon as it is about to navigate to a URL that starts with this prefix.
const REDIRECT_TARGET = 'https://ricettario.profile.success';

WebBrowser.maybeCompleteAuthSession();

export default function GoogleLoginScreen() {
  const router = useRouter();
  const { T } = useLang();
  const [loading, setLoading] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const startedRef = useRef(false);

  const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(REDIRECT_TARGET)}`;

  const exchangeSession = async (sessionId: string) => {
    setExchanging(true);
    try {
      const res = await authFetch('/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        await AsyncStorage.setItem('session_token', data.session_token);
        await AsyncStorage.setItem('user_data', JSON.stringify({
          user_id: data.user_id, email: data.email, name: data.name, picture: data.picture,
        }));
        if (data.name) await AsyncStorage.setItem('user_name', data.name);
        const m = data.migrated;
        const migratedMsg = m && (m.recipes || m.folders || m.subfolders)
          ? `\n\n📦 ${T('data_migrated')}: ${m.recipes} ${T('recipes_label')}, ${m.folders} ${T('folders_label')}, ${m.subfolders} ${T('subfolders_label')}`
          : '';
        Alert.alert(T('login_success'), `${T('welcome_back')} ${data.name}${migratedMsg}`, [
          { text: 'OK', onPress: () => router.replace('/(drawer)/settings') },
        ]);
      } else {
        Alert.alert(T('error'), T('login_failed'));
      }
    } catch (e) {
      Alert.alert(T('error'), T('connection_error'));
    } finally {
      setExchanging(false);
    }
  };

  const startLogin = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setLoading(true);
    try {
      // Opens Chrome Custom Tabs on Android and ASWebAuthenticationSession on iOS.
      // Google trusts these flows (no more disallowed_useragent).
      const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_TARGET, {
        showInRecents: true,
        preferEphemeralSession: false,
      });

      if (result.type === 'success' && result.url) {
        const match = result.url.match(/[?#&]session_id=([^&]+)/);
        if (match && match[1]) {
          await exchangeSession(decodeURIComponent(match[1]));
          return;
        }
        Alert.alert(T('error'), T('login_failed'));
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User cancelled – just return back
        router.back();
      } else {
        Alert.alert(T('error'), T('login_failed'));
      }
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || T('connection_error'));
    } finally {
      setLoading(false);
      startedRef.current = false;
    }
  };

  // Auto start on mount (native platforms)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      startLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.hBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.hTitle}>{T('login_with_google')}</Text>
      </View>

      <View style={s.center}>
        {exchanging ? (
          <>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={s.overlayText}>{T('completing_login')}</Text>
          </>
        ) : loading ? (
          <>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={s.hint}>{T('opening_browser') || 'Apertura browser sicuro...'}</Text>
          </>
        ) : (
          <>
            <Ionicons name="logo-google" size={56} color="#FF6B35" style={{ marginBottom: 16 }} />
            <Text style={s.title}>{T('login_with_google')}</Text>
            <Text style={s.hint}>
              {T('secure_browser_hint') || "Verrai reindirizzato al browser sicuro di sistema per accedere con Google."}
            </Text>
            <TouchableOpacity style={s.openBtn} onPress={Platform.OS === 'web' ? () => Linking.openURL(authUrl) : startLogin}>
              <Ionicons name="log-in-outline" size={20} color="#fff" />
              <Text style={s.openBtnText}>{T('login_with_google')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, backgroundColor: '#1a1a1a' },
  hBtn: { padding: 8 },
  hTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#fff', textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 14 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  hint: { color: '#aaa', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FF6B35', paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12 },
  openBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  overlayText: { color: '#FF6B35', fontSize: 15, fontWeight: '600' },
});
