import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { useTheme } from '../src/context/ThemeContext';

// Cross-promo Blackstar: "Le altre app di Blackstar".
// Carica l'elenco app da un JSON remoto e mostra le ALTRE app (esclude questa).
// Offline-safe: se il fetch fallisce o è vuoto, non renderizza nulla.

const APPS_URL =
  'https://rawcdn.githack.com/blackstardigitalstudio/blackstardigitalstudio.github.io/main/apps.json';

// Package di QUESTA app (da escludere dall'elenco).
const SELF_PACKAGE = 'studio.blackstardigital.ilricettario';

interface BlackstarApp {
  name: string;
  package: string;
  hook?: string;
  icon?: string;
  playUrl?: string;
  kidsSafe?: boolean;
}

export default function AltreApp() {
  const { colors } = useTheme();
  const [apps, setApps] = useState<BlackstarApp[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(APPS_URL);
        if (!res.ok) return;
        const data = await res.json();
        const list: BlackstarApp[] = Array.isArray(data?.apps) ? data.apps : [];
        const others = list.filter(
          (a) => a && a.package !== SELF_PACKAGE && !!a.playUrl && !!a.name,
        );
        if (alive) setApps(others);
      } catch {
        /* offline-safe: nessun errore a schermo */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Offline-safe: niente da mostrare -> non renderizza nulla.
  if (!apps.length) return null;

  const openApp = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {
      /* ignora: link non apribile */
    });
  };

  const s = StyleSheet.create({
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 1,
      marginTop: 24,
      marginBottom: 10,
      marginLeft: 4,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      minHeight: 44,
    },
    icon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.accentSoft,
    },
    iconPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.accentSoft,
    },
    name: { color: colors.text, fontSize: 15, fontWeight: '700' },
    hook: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
    divider: { height: 1, backgroundColor: colors.divider, marginLeft: 62 },
    madeIn: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 0.5,
      marginTop: 12,
    },
  });

  return (
    <View testID="altre-app-section">
      <Text style={s.sectionTitle}>🚀 Le altre app di Blackstar</Text>
      <View style={s.card}>
        {apps.map((a, i) => (
          <View key={a.package || a.name || String(i)}>
            <TouchableOpacity
              style={s.row}
              activeOpacity={0.7}
              onPress={() => openApp(a.playUrl)}
              testID={`altre-app-${a.package || i}`}
            >
              {a.icon ? (
                <Image source={{ uri: a.icon }} style={s.icon} resizeMode="cover" />
              ) : (
                <View style={s.iconPlaceholder} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>
                  {a.name}
                </Text>
                {a.hook ? (
                  <Text style={s.hook} numberOfLines={2}>
                    {a.hook}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
            {i < apps.length - 1 ? <View style={s.divider} /> : null}
          </View>
        ))}
      </View>
      <Text style={s.madeIn}>Made in Italy 🇮🇹</Text>
    </View>
  );
}
