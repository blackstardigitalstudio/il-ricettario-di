import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLang } from '../src/context/LangContext';

// Use a mobile-friendly UA so the websites render their mobile UI
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export default function WebDownloaderScreen() {
  const { url, platform } = useLocalSearchParams<{ url: string; platform?: string }>();
  const router = useRouter();
  const { T } = useLang();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState('');

  // Choose a downloader service based on platform; pre-fill input via query string where supported
  const target = (() => {
    const v = url || '';
    if (platform === 'facebook') return `https://fdownloader.net/es?url=${encodeURIComponent(v)}`;
    return `https://sssinstagram.com/es/video-downloader?url=${encodeURIComponent(v)}`;
  })();

  // Auto-paste the url inside the site's main input and click the submit button
  const autoFillJs = `
    (function(){
      try {
        var target = ${JSON.stringify(url || '')};
        if (!target) return true;
        setTimeout(function(){
          var inputs = document.querySelectorAll('input[type="text"], input[type="url"], input[type="search"]');
          for (var i=0;i<inputs.length;i++){
            if (!inputs[i].value){
              var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              nativeSetter.call(inputs[i], target);
              inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
              break;
            }
          }
          // Click the first visible button labeled like "Download"/"Descargar"
          var btns = document.querySelectorAll('button, input[type="submit"], a.button');
          for (var j=0;j<btns.length;j++){
            var t = (btns[j].innerText || btns[j].value || '').toLowerCase();
            if (/download|descargar|scarica/.test(t) && btns[j].offsetParent !== null){ btns[j].click(); break; }
          }
        }, 600);
      } catch(e) {}
      true;
    })();
  `;

  const onNav = (ev: WebViewNavigation) => {
    setCurrentUrl(ev.url);
    // If the webview navigated to a direct mp4, open in external browser/share
    if (/\.mp4(\?|$)/i.test(ev.url)) {
      Linking.openURL(ev.url);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.hBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.hTitle} numberOfLines={1}>Download video</Text>
        <TouchableOpacity style={s.hBtn} onPress={() => webRef.current?.reload()}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <Text style={s.hint}>💡 {T('download_hint_webview')}</Text>

      {Platform.OS === 'web' ? (
        <View style={s.center}>
          <Text style={s.webFallback}>{T('open_in_browser')}</Text>
          <TouchableOpacity style={s.openBtn} onPress={() => Linking.openURL(target)}>
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={s.openBtnText}>{T('open_in_browser')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
            source={{ uri: target }}
            userAgent={MOBILE_UA}
            injectedJavaScript={autoFillJs}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={onNav}
            startInLoadingState
            originWhitelist={['*']}
            allowsFullscreenVideo
            style={{ flex: 1, backgroundColor: '#fff' }}
          />
          {loading ? (
            <View style={s.overlay}><ActivityIndicator size="large" color="#FF6B35" /></View>
          ) : null}
        </View>
      )}

      <View style={s.footer}>
        <Text style={s.footerHint} numberOfLines={1}>{currentUrl || target}</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, backgroundColor: '#1a1a1a' },
  hBtn: { padding: 8 },
  hTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#fff', textAlign: 'center' },
  hint: { color: '#FF6B35', fontSize: 12, padding: 10, backgroundColor: '#1a1a1a', textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,15,15,0.7)', justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  webFallback: { color: '#ccc', textAlign: 'center', marginBottom: 16 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FF6B35', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  openBtnText: { color: '#fff', fontWeight: '600' },
  footer: { padding: 8, backgroundColor: '#1a1a1a', borderTopWidth: 1, borderTopColor: '#2a2a2a' },
  footerHint: { color: '#666', fontSize: 11 },
});
