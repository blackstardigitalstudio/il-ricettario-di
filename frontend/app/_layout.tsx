import React, { useState, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function WelcomeScreen({ onComplete }: { onComplete: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <SafeAreaView style={ws.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={ws.content}>
          <Ionicons name="restaurant" size={80} color="#FF6B35" />
          <Text style={ws.title}>Benvenuto!</Text>
          <Text style={ws.subtitle}>Come ti chiami?</Text>
          <TextInput style={ws.input} placeholder="Il tuo nome..." placeholderTextColor="#666"
            value={name} onChangeText={setName} autoFocus testID="welcome-name-input" />
          <Text style={ws.preview}>{name ? `Il Ricettario di ${name}` : 'Il Ricettario di ...'}</Text>
          <TouchableOpacity style={[ws.button, !name.trim() && ws.disabled]} onPress={() => name.trim() && onComplete(name.trim())}
            disabled={!name.trim()} testID="welcome-continue-btn">
            <Text style={ws.buttonText}>Inizia</Text>
            <Ionicons name="arrow-forward" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ws = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#fff', marginTop: 24, marginBottom: 8 },
  subtitle: { fontSize: 18, color: '#888', marginBottom: 32 },
  input: { width: '100%', backgroundColor: '#1a1a1a', borderRadius: 16, borderWidth: 1, borderColor: '#333', color: '#fff', fontSize: 20, padding: 18, textAlign: 'center' },
  preview: { fontSize: 22, fontWeight: '700', color: '#FF6B35', marginTop: 24, marginBottom: 32 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6B35', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, gap: 8 },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});

export default function RootLayout() {
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
    return <GestureHandlerRootView style={{ flex: 1 }}><StatusBar style="light" /><WelcomeScreen onComplete={handleWelcome} /></GestureHandlerRootView>;
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
