import React, { useState, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LangProvider, useLang, LANGUAGES } from '../src/context/LangContext';
import { ThemeProvider } from '../src/context/ThemeContext';

function WelcomeScreen({ onComplete }: { onComplete: (name: string) => void }) {
  const { T, lang, setLang } = useLang();
  const [name, setName] = useState('');
  const [showLang, setShowLang] = useState(false);
  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <SafeAreaView style={ws.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Language switcher top-right */}
        <View style={ws.langRow}>
          <TouchableOpacity style={ws.langBtn} onPress={() => setShowLang(true)} testID="lang-btn-welcome">
            <Text style={ws.langFlag}>{currentLang.flag}</Text>
            <Text style={ws.langName}>{currentLang.name}</Text>
            <Ionicons name="chevron-down" size={16} color="#888" />
          </TouchableOpacity>
        </View>

        <View style={ws.content}>
          <Ionicons name="restaurant" size={80} color="#FF6B35" />
          <Text style={ws.title}>{T('welcome')}</Text>
          <Text style={ws.subtitle}>{T('whats_your_name')}</Text>
          <TextInput style={ws.input} placeholder={T('enter_name')} placeholderTextColor="#666"
            value={name} onChangeText={setName} autoFocus testID="welcome-name-input" />
          <Text style={ws.preview}>{name ? `${T('cookbook_of')} ${name}` : `${T('cookbook_of')} ...`}</Text>
          <TouchableOpacity style={[ws.button, !name.trim() && ws.disabled]} onPress={() => name.trim() && onComplete(name.trim())}
            disabled={!name.trim()} testID="welcome-continue-btn">
            <Text style={ws.buttonText}>{T('start')}</Text>
            <Ionicons name="arrow-forward" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Language picker modal */}
        <Modal visible={showLang} transparent animationType="fade" onRequestClose={() => setShowLang(false)}>
          <TouchableOpacity style={ws.modalOverlay} activeOpacity={1} onPress={() => setShowLang(false)}>
            <View style={ws.modalContent}>
              <Text style={ws.modalTitle}>{T('language')}</Text>
              <ScrollView style={{ maxHeight: 400 }}>
                {LANGUAGES.map((l) => (
                  <TouchableOpacity
                    key={l.code}
                    style={[ws.langItem, lang === l.code && ws.langItemActive]}
                    onPress={() => { setLang(l.code); setShowLang(false); }}
                    testID={`lang-opt-${l.code}`}
                  >
                    <Text style={ws.langItemFlag}>{l.flag}</Text>
                    <Text style={[ws.langItemName, lang === l.code && ws.langItemNameActive]}>{l.name}</Text>
                    {lang === l.code ? <Ionicons name="checkmark" size={22} color="#FF6B35" /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ws = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  langRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 10 },
  langBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6, borderWidth: 1, borderColor: '#333' },
  langFlag: { fontSize: 18 },
  langName: { color: '#ddd', fontSize: 14, fontWeight: '500' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#fff', marginTop: 24, marginBottom: 8 },
  subtitle: { fontSize: 18, color: '#888', marginBottom: 32 },
  input: { width: '100%', backgroundColor: '#1a1a1a', borderRadius: 16, borderWidth: 1, borderColor: '#333', color: '#fff', fontSize: 20, padding: 18, textAlign: 'center' },
  preview: { fontSize: 22, fontWeight: '700', color: '#FF6B35', marginTop: 24, marginBottom: 32, textAlign: 'center' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6B35', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, gap: 8 },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 400, backgroundColor: '#1a1a1a', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 16, textAlign: 'center' },
  langItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, gap: 12 },
  langItemActive: { backgroundColor: '#FF6B3520' },
  langItemFlag: { fontSize: 22 },
  langItemName: { flex: 1, color: '#ddd', fontSize: 16 },
  langItemNameActive: { color: '#FF6B35', fontWeight: '600' },
});

function AppRoot() {
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const name = await AsyncStorage.getItem('user_name');
      if (name) setUserName(name);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleWelcome = async (name: string) => {
    await AsyncStorage.setItem('user_name', name);
    setUserName(name);
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#0f0f0f', justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#FF6B35" /></View>;
  }

  if (!userName) {
    return <><StatusBar style="light" /><WelcomeScreen onComplete={handleWelcome} /></>;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f0f0f' } }}>
        <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="folder/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="google-login" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="web-downloader" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LangProvider>
        <ThemeProvider>
          <AppRoot />
        </ThemeProvider>
      </LangProvider>
    </GestureHandlerRootView>
  );
}
