import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  accentSoft: string;
  divider: string;
  overlay: string;
  inputBg: string;
  success: string;
  danger: string;
}

const DARK: ThemeColors = {
  bg: '#0f0f0f',
  card: '#1a1a1a',
  cardBorder: '#2a2a2a',
  text: '#ffffff',
  textMuted: '#aaaaaa',
  textSubtle: '#666666',
  accent: '#FF6B35',
  accentSoft: '#FF6B3520',
  divider: '#222222',
  overlay: 'rgba(0,0,0,0.85)',
  inputBg: '#252525',
  success: '#4CAF50',
  danger: '#FF4444',
};

const LIGHT: ThemeColors = {
  bg: '#fafafa',
  card: '#ffffff',
  cardBorder: '#e5e5e5',
  text: '#111111',
  textMuted: '#555555',
  textSubtle: '#888888',
  accent: '#E85D25',
  accentSoft: '#E85D2518',
  divider: '#eeeeee',
  overlay: 'rgba(0,0,0,0.55)',
  inputBg: '#f2f2f2',
  success: '#2E7D32',
  danger: '#D32F2F',
};

interface Ctx {
  mode: ThemeMode;
  colors: ThemeColors;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<Ctx>({ mode: 'dark', colors: DARK, toggle: () => {}, setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  useEffect(() => { (async () => {
    try {
      const saved = await AsyncStorage.getItem('theme_mode');
      if (saved === 'light' || saved === 'dark') setModeState(saved);
    } catch (e) { /* */ }
  })(); }, []);

  const setMode = async (m: ThemeMode) => {
    setModeState(m);
    try { await AsyncStorage.setItem('theme_mode', m); } catch (e) { /* */ }
  };
  const toggle = () => setMode(mode === 'dark' ? 'light' : 'dark');

  const colors = mode === 'dark' ? DARK : LIGHT;
  return <ThemeContext.Provider value={{ mode, colors, toggle, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
