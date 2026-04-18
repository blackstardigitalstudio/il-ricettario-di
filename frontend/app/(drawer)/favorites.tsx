import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { authFetch } from '../../src/utils/api';
import { useLang } from '../../src/context/LangContext';

interface Recipe {
  id: string; name: string; platform: string; caption: string;
  thumbnail_url: string; created_at: string;
  tags?: string[]; difficulty?: string;
  transcription_status: string;
}

export default function FavoritesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { T } = useLang();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await authFetch('/api/recipes?favorites=true&light=true');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setRecipes(data);
      }
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const toggleFav = async (id: string) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    try {
      await authFetch(`/api/recipes/${id}`, { method: 'PUT', body: JSON.stringify({ is_favorite: false }) });
    } catch (e) { load(); }
  };

  const openDrawer = () => {
    try { navigation.dispatch(DrawerActions.openDrawer()); } catch (e) { /* */ }
  };

  const getPlatformIcon = (p: string): any => p === 'instagram' ? 'logo-instagram' : 'logo-facebook';
  const getPlatformColor = (p: string) => p === 'instagram' ? '#E4405F' : '#1877F2';

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.center}><ActivityIndicator size="large" color="#FF6B35" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity style={st.menuBtn} onPress={openDrawer} testID="menu-btn">
          <Ionicons name="menu" size={28} color="#FF6B35" />
        </TouchableOpacity>
        <View style={st.headerText}>
          <Text style={st.title}>⭐ {T('favorites')}</Text>
          <Text style={st.subtitle}>{recipes.length} {T('recipes_saved')}</Text>
        </View>
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
      >
        {recipes.length === 0 ? (
          <View style={st.emptyContainer}>
            <Ionicons name="star-outline" size={64} color="#444" />
            <Text style={st.emptyText}>{T('no_favorites')}</Text>
            <Text style={st.emptySubtext}>{T('no_favorites_hint')}</Text>
          </View>
        ) : (
          recipes.map((recipe) => (
            <TouchableOpacity
              key={recipe.id}
              style={st.recipeCard}
              onPress={() => router.push(`/recipe/${recipe.id}`)}
              activeOpacity={0.7}
              testID={`fav-card-${recipe.id}`}
            >
              {recipe.thumbnail_url ? (
                <Image source={{ uri: recipe.thumbnail_url }} style={st.thumb} resizeMode="cover" />
              ) : (
                <View style={st.thumbPlaceholder}><Ionicons name="videocam" size={28} color="#666" /></View>
              )}
              <View style={st.recipeInfo}>
                <View style={st.recipeHeader}>
                  <Ionicons name={getPlatformIcon(recipe.platform)} size={14} color={getPlatformColor(recipe.platform)} />
                  <Text style={st.recipeName} numberOfLines={1}>{recipe.name}</Text>
                </View>
                <Text style={st.recipeCaption} numberOfLines={2}>{recipe.caption || T('no_description')}</Text>
                {recipe.tags && recipe.tags.length > 0 ? (
                  <View style={st.tagRow}>
                    {recipe.tags.slice(0, 3).map((t) => (
                      <View key={t} style={st.tag}><Text style={st.tagText}>#{t}</Text></View>
                    ))}
                  </View>
                ) : null}
              </View>
              <TouchableOpacity style={st.starBtn} onPress={() => toggleFav(recipe.id)}>
                <Ionicons name="star" size={22} color="#FFD700" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 12 },
  menuBtn: { padding: 8, backgroundColor: '#1a1a1a', borderRadius: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#666', marginTop: 16 },
  emptySubtext: { fontSize: 13, color: '#555', marginTop: 6, textAlign: 'center', paddingHorizontal: 30 },
  recipeCard: { flexDirection: 'row', backgroundColor: '#1a1a1a', borderRadius: 12, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2a' },
  thumb: { width: 80, height: 90 },
  thumbPlaceholder: { width: 80, height: 90, backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' },
  recipeInfo: { flex: 1, padding: 10, justifyContent: 'center', gap: 4 },
  recipeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recipeName: { fontSize: 14, fontWeight: '600', color: '#fff', flex: 1 },
  recipeCaption: { fontSize: 12, color: '#888' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { backgroundColor: '#FF6B3520', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { color: '#FF6B35', fontSize: 10, fontWeight: '600' },
  starBtn: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
});
