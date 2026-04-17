import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authFetch } from '../src/utils/api';
import { useLang } from '../src/context/LangContext';

const IG_LOGIN_URL = 'https://www.instagram.com/accounts/login/';

// JS injected into WebView to check login status and extract cookies
const INJECTED_JS = `
(function() {
  function sendCookies() {
    try {
      const cookieStr = document.cookie || '';
      const path = window.location.pathname || '';
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'cookies',
        cookies: cookieStr,
        path: path,
        url: window.location.href,
      }));
    } catch (e) {}
  }
  // send cookies on load
  sendCookies();
  // also monitor periodically in case of SPA navigation
  let lastCookies = document.cookie;
  setInterval(function(){
    if (document.cookie !== lastCookies) {
      lastCookies = document.cookie;
      sendCookies();
    }
  }, 1000);
  true;
})();
`;

function parseCookieString(cookieStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  cookieStr.split(';').forEach(pair => {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (k) out[k] = v;
    }
  });
  return out;
}

export default function InstagramLoginScreen() {
  const router = useRouter();
  const { T } = useLang();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const webRef = useRef<any>(null);
  const sentRef = useRef(false);

  const handleMessage = async (event: any) => {
    if (sentRef.current) return;
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type !== 'cookies') return;
      const cookies = parseCookieString(data.cookies || '');
      if (!cookies.sessionid) return; // not logged in yet
      // Filter only useful cookies
      const useful: Record<string, string> = {};
      ['sessionid', 'ds_user_id', 'csrftoken', 'ig_did', 'mid', 'rur', 'shbid', 'shbts'].forEach(k => {
        if (cookies[k]) useful[k] = cookies[k];
      });
      sentRef.current = true;
      setSaving(true);
      const res = await authFetch('/api/instagram/session', {
        method: 'POST',
        body: JSON.stringify({ cookies: useful, username: '' }),
      });
      if (res.ok) {
        Alert.alert(T('ig_connected_title'), T('ig_connected_desc'), [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        const err = await res.json().catch(() => ({}));
        sentRef.current = false;
        Alert.alert(T('error'), err.detail || T('ig_connect_error'));
      }
    } catch (e) {
      console.log('IG login msg err', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} testID="close-ig-login">
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Ionicons name="logo-instagram" size={22} color="#E4405F" />
          <Text style={styles.headerTitle}>{T('ig_connect')}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Disclaimer Modal */}
      <Modal visible={showDisclaimer} transparent animationType="fade">
        <View style={styles.dOverlay}>
          <View style={styles.dContent}>
            <Ionicons name="shield-checkmark" size={48} color="#FF6B35" style={{ alignSelf: 'center' }} />
            <Text style={styles.dTitle}>{T('ig_disclaimer_title')}</Text>
            <ScrollView style={styles.dBody}>
              <Text style={styles.dBullet}>• {T('ig_disclaimer_1')}</Text>
              <Text style={styles.dBullet}>• {T('ig_disclaimer_2')}</Text>
              <Text style={styles.dBullet}>• {T('ig_disclaimer_3')}</Text>
              <Text style={styles.dBullet}>• {T('ig_disclaimer_4')}</Text>
              <Text style={styles.dBullet}>• {T('ig_disclaimer_5')}</Text>
              <Text style={[styles.dBullet, { color: '#FFD700', marginTop: 8 }]}>⚠️ {T('ig_disclaimer_warning')}</Text>
            </ScrollView>
            <View style={styles.dBtns}>
              <TouchableOpacity style={styles.dCancel} onPress={() => router.back()} testID="ig-disclaimer-cancel">
                <Text style={styles.dCancelText}>{T('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dAccept, accepted && { opacity: 1 }]}
                onPress={() => { setAccepted(true); setShowDisclaimer(false); }}
                testID="ig-disclaimer-accept">
                <Text style={styles.dAcceptText}>{T('i_understand_continue')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* WebView */}
      {accepted && (
        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
            source={{ uri: IG_LOGIN_URL }}
            injectedJavaScript={INJECTED_JS}
            onMessage={handleMessage}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            style={{ flex: 1, backgroundColor: '#000' }}
          />
          {loading && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#FF6B35" />
            </View>
          )}
          {saving && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#FF6B35" />
              <Text style={styles.savingText}>{T('saving')}</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#141414', borderBottomWidth: 1, borderBottomColor: '#222' },
  closeBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  savingText: { color: '#fff', marginTop: 12, fontSize: 16, fontWeight: '600' },
  // Disclaimer
  dOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dContent: { width: '100%', maxWidth: 480, backgroundColor: '#1a1a1a', borderRadius: 20, padding: 22, maxHeight: '90%' },
  dTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginVertical: 14 },
  dBody: { maxHeight: 320 },
  dBullet: { color: '#ddd', fontSize: 14, lineHeight: 22, marginBottom: 6 },
  dBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  dCancel: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' },
  dCancelText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dAccept: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#FF6B35', alignItems: 'center' },
  dAcceptText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
