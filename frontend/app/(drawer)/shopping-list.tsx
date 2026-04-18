import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Image, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { authFetch } from '../../src/utils/api';
import { useLang } from '../../src/context/LangContext';

interface Recipe {
  id: string;
  name: string;
  platform: string;
  thumbnail_url: string;
  ingredients?: string;
  ingredients_status?: string;
}

export default function ShoppingListScreen() {
  const router = useRouter();
  const { T, lang } = useLang();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [recipeNames, setRecipeNames] = useState<string[]>([]);
  const [step, setStep] = useState<'select' | 'list'>('select');

  const loadRecipes = async () => {
    try {
      const res = await authFetch('/api/recipes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setRecipes(data);
      }
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  useFocusEffect(useCallback(() => {
    setStep('select');
    setSelected(new Set());
    setItems([]);
    setChecked(new Set());
    loadRecipes();
  }, []));

  const toggleRecipe = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllWithIngredients = () => {
    const ids = recipes.filter(r => (r.ingredients || '').trim()).map(r => r.id);
    setSelected(new Set(ids));
  };

  const clearSelection = () => setSelected(new Set());

  const generate = async () => {
    if (selected.size === 0) {
      Alert.alert(T('oops') || 'Ops', T('shopping_no_selection') || 'Seleziona almeno una ricetta');
      return;
    }
    setGenerating(true);
    try {
      const res = await authFetch('/api/shopping-list/generate', {
        method: 'POST',
        body: JSON.stringify({ recipe_ids: Array.from(selected), language: lang }),
      });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
        setRecipeNames(Array.isArray(data.recipe_names) ? data.recipe_names : []);
        setChecked(new Set());
        setStep('list');
      } else {
        const data = await res.json().catch(() => ({}));
        Alert.alert(T('error'), data?.detail || T('shopping_generate_failed') || 'Impossibile generare la lista');
      }
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || T('connection_error'));
    } finally {
      setGenerating(false);
    }
  };

  const toggleCheck = (idx: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const buildShareText = () => {
    const header = `🛒 ${T('shopping_list') || 'Lista della Spesa'}`;
    const fromLine = recipeNames.length > 0
      ? `\n${T('shopping_from') || 'Da'}: ${recipeNames.join(', ')}`
      : '';
    const list = items.map(it => `• ${it}`).join('\n');
    return `${header}${fromLine}\n\n${list}`;
  };

  const shareList = async () => {
    try {
      const text = buildShareText();
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(text);
        Alert.alert(T('done') || 'Fatto', T('copied_to_clipboard') || 'Copiato negli appunti');
      } else {
        await Share.share({ message: text });
      }
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || 'Share failed');
    }
  };

  const copyList = async () => {
    try {
      await Clipboard.setStringAsync(buildShareText());
      Alert.alert(T('done') || 'Fatto', T('copied_to_clipboard') || 'Copiato negli appunti');
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || 'Copy failed');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator color="#FF6B35" size="large" /></View>
      </SafeAreaView>
    );
  }

  // ============================================================
  // STEP 1: SELECT RECIPES
  // ============================================================
  if (step === 'select') {
    const withIngredients = recipes.filter(r => (r.ingredients || '').trim());
    const withoutIngredients = recipes.filter(r => !(r.ingredients || '').trim());

    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.hBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>🛒 {T('shopping_list') || 'Lista della Spesa'}</Text>
            <Text style={s.subtitle}>
              {selected.size} / {withIngredients.length} {T('selected') || 'selezionate'}
            </Text>
          </View>
        </View>

        <View style={s.toolbar}>
          <TouchableOpacity style={s.toolBtn} onPress={selectAllWithIngredients}>
            <Ionicons name="checkbox-outline" size={18} color="#FF6B35" />
            <Text style={s.toolBtnText}>{T('select_all') || 'Seleziona tutte'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.toolBtn} onPress={clearSelection} disabled={selected.size === 0}>
            <Ionicons name="close-circle-outline" size={18} color={selected.size === 0 ? '#555' : '#aaa'} />
            <Text style={[s.toolBtnText, selected.size === 0 && { color: '#555' }]}>{T('clear') || 'Deseleziona'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {withIngredients.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="basket-outline" size={60} color="#444" />
              <Text style={s.emptyText}>
                {T('shopping_no_recipes') || 'Nessuna ricetta con ingredienti estratti'}
              </Text>
              <Text style={s.emptyHint}>
                {T('shopping_no_recipes_hint') || "Apri una ricetta e tocca 'Analizza ingredienti' per estrarre gli ingredienti con l'AI."}
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.sectionLabel}>
                {T('shopping_available') || 'Ricette con ingredienti'} ({withIngredients.length})
              </Text>
              {withIngredients.map(r => {
                const isSel = selected.has(r.id);
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[s.row, isSel && s.rowSelected]}
                    onPress={() => toggleRecipe(r.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.checkbox, isSel && s.checkboxActive]}>
                      {isSel ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                    </View>
                    {r.thumbnail_url ? (
                      <Image source={{ uri: r.thumbnail_url }} style={s.thumb} />
                    ) : (
                      <View style={[s.thumb, s.thumbPlaceholder]}>
                        <Ionicons name="restaurant" size={20} color="#FF6B35" />
                      </View>
                    )}
                    <Text style={s.rowName} numberOfLines={2}>{r.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {withoutIngredients.length > 0 ? (
            <>
              <Text style={[s.sectionLabel, { marginTop: 20 }]}>
                {T('shopping_without') || 'Senza ingredienti estratti'} ({withoutIngredients.length})
              </Text>
              {withoutIngredients.map(r => (
                <View key={r.id} style={[s.row, { opacity: 0.4 }]}>
                  <View style={[s.checkbox, { borderColor: '#333' }]} />
                  {r.thumbnail_url ? (
                    <Image source={{ uri: r.thumbnail_url }} style={s.thumb} />
                  ) : (
                    <View style={[s.thumb, s.thumbPlaceholder]}>
                      <Ionicons name="restaurant" size={20} color="#666" />
                    </View>
                  )}
                  <Text style={[s.rowName, { color: '#777' }]} numberOfLines={2}>{r.name}</Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>

        <TouchableOpacity
          style={[s.generateBtn, (selected.size === 0 || generating) && s.generateBtnDisabled]}
          onPress={generate}
          disabled={selected.size === 0 || generating}
          activeOpacity={0.85}
        >
          {generating ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={s.generateText}>{T('shopping_generating') || 'Generazione AI...'}</Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color="#fff" />
              <Text style={s.generateText}>
                {T('shopping_generate') || 'Genera lista con AI'} ({selected.size})
              </Text>
            </>
          )}
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ============================================================
  // STEP 2: SHOW AGGREGATED LIST
  // ============================================================
  const totalChecked = checked.size;
  const progress = items.length > 0 ? Math.round((totalChecked / items.length) * 100) : 0;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setStep('select')} style={s.hBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>🛒 {T('shopping_list') || 'Lista della Spesa'}</Text>
          <Text style={s.subtitle}>
            {totalChecked} / {items.length} ({progress}%)
          </Text>
        </View>
        <TouchableOpacity onPress={shareList} style={s.hBtn}>
          <Ionicons name="share-social-outline" size={22} color="#FF6B35" />
        </TouchableOpacity>
        <TouchableOpacity onPress={copyList} style={s.hBtn}>
          <Ionicons name="copy-outline" size={22} color="#FF6B35" />
        </TouchableOpacity>
      </View>

      {recipeNames.length > 0 ? (
        <View style={s.fromBox}>
          <Ionicons name="restaurant" size={14} color="#FF6B35" />
          <Text style={s.fromText} numberOfLines={2}>
            {T('shopping_from') || 'Da'}: {recipeNames.join(' • ')}
          </Text>
        </View>
      ) : null}

      {items.length > 0 ? (
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress}%` }]} />
        </View>
      ) : null}

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {items.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="basket-outline" size={60} color="#444" />
            <Text style={s.emptyText}>{T('shopping_empty') || 'Lista vuota'}</Text>
          </View>
        ) : (
          items.map((it, idx) => {
            const isChecked = checked.has(idx);
            return (
              <TouchableOpacity
                key={idx}
                style={[s.listRow, isChecked && s.listRowChecked]}
                onPress={() => toggleCheck(idx)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, isChecked && s.checkboxActive]}>
                  {isChecked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </View>
                <Text style={[s.listText, isChecked && s.listTextChecked]}>{it}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, gap: 6,
  },
  hBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  toolbar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8,
  },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1a1a1a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  toolBtnText: { color: '#aaa', fontSize: 13, fontWeight: '500' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },
  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: '#888',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  rowSelected: { borderColor: '#FF6B35', backgroundColor: '#2a1a10' },
  thumb: { width: 50, height: 50, borderRadius: 8 },
  thumbPlaceholder: {
    backgroundColor: '#252525', justifyContent: 'center', alignItems: 'center',
  },
  rowName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: '#555',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'transparent',
  },
  checkboxActive: { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  emptyBox: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyText: {
    fontSize: 16, fontWeight: '600', color: '#888',
    marginTop: 16, textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13, color: '#666',
    marginTop: 8, textAlign: 'center', lineHeight: 19,
  },
  generateBtn: {
    position: 'absolute', bottom: 20, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FF6B35', paddingVertical: 16, borderRadius: 14, gap: 8,
    shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  generateBtnDisabled: { backgroundColor: '#444', shadowOpacity: 0 },
  generateText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  fromBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#1a1a1a', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  fromText: { flex: 1, color: '#aaa', fontSize: 12, lineHeight: 17 },
  progressBar: {
    height: 4, backgroundColor: '#222',
    marginHorizontal: 16, marginBottom: 8, borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#FF6B35' },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, marginBottom: 6,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  listRowChecked: { opacity: 0.55, borderColor: '#FF6B35' },
  listText: { flex: 1, color: '#fff', fontSize: 15 },
  listTextChecked: { textDecorationLine: 'line-through', color: '#888' },
});
