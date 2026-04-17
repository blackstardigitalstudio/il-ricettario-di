import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '../src/utils/api';
import { useLang } from '../src/context/LangContext';

const REDIRECT_TARGET = 'https://ricettario.profile.success'; // any URL; we only match it as prefix

export default function GoogleLoginScreen() {
  const router = useRouter();
  const { T } = useLang();
  const [loading, setLoading] = useState(true);
  const [exchanging, setExchanging] = useState(false);
  const webRef = useRef<WebView>(null);

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
        router.back();
      }
    } catch (e) {
      Alert.alert(T('error'), T('connection_error'));
      router.back();
    } finally { setExchanging(false); }
  };

  const handleNavChange = (ev: any) => {
    const url: string = ev.url || '';
    // The emergent auth page redirects with `?session_id=...` or `#session_id=...`
    if (url.startsWith(REDIRECT_TARGET) || url.includes('session_id=')) {
      const match = url.match(/[?#&]session_id=([^&]+)/);
      if (match && match[1] && !exchanging) {
        webRef.current?.stopLoading();
        exchangeSession(decodeURIComponent(match[1]));
      }
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.hBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.hTitle}>{T('login_with_google')}</Text>
      </View>

      {Platform.OS === 'web' ? (
        <View style={s.center}>
          <Text style={s.hint}>{T('web_login_hint')}</Text>
          <TouchableOpacity style={s.openBtn} onPress={() => Linking.openURL(authUrl)}>
            <Ionicons name="open-outline" size={20} color="#fff" />
            <Text style={s.openBtnText}>{T('open_in_browser')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
            source={{ uri: authUrl }}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={handleNavChange}
            originWhitelist={['*']}
            style={{ flex: 1, backgroundColor: '#fff' }}
          />
          {(loading || exchanging) ? (
            <View style={s.overlay}>
              <ActivityIndicator size="large" color="#FF6B35" />
              {exchanging ? <Text style={s.overlayText}>{T('completing_login')}</Text> : null}
            </View>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, backgroundColor: '#1a1a1a' },
  hBtn: { padding: 8 },
  hTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#fff', textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  hint: { color: '#aaa', textAlign: 'center', marginBottom: 20 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FF6B35', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12 },
  openBtnText: { color: '#fff', fontWeight: '600' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,15,15,0.8)', justifyContent: 'center', alignItems: 'center', gap: 14 },
  overlayText: { color: '#FF6B35', fontSize: 15, fontWeight: '600' },
});
