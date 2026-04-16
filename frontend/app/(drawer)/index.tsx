import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Image, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Recipe {
  id: string;
  name: string;
  platform: string;
  caption: string;
  thumbnail_url: string;
  notes: string;
  transcription_status: string;
  created_at: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [randomRecipes, setRandomRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRecipes = async (query?: string) => {
    try {
      let url = `${API_URL}/api/recipes`;
      if (query && query.trim()) {
        url += `?search=${encodeURIComponent(query.trim())}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRecipes(data);
        }
      }
    } catch (e) {
      console.log('Error fetching recipes:', e);
    }
  };

  const fetchRandom = async () => {
    try {
      const res = await fetch(`${API_URL}/api/recipes/random?count=3`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRandomRecipes(data);
        }
      }
    } catch (e) {
      console.log('Error fetching random:', e);
    }
  };

  const loadAll = async (query?: string) => {
    try {
      const name = await AsyncStorage.getItem('user_name');
      setUserName(name || '');
    } catch (e) {
      console.log('Error loading name:', e);
    }
    await fetchRecipes(query);
    if (!query) {
      await fetchRandom();
    }
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadAll(searchQuery);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadAll(searchQuery);
  };

  const handleSearch = () => {
    loadAll(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery('');
    loadAll('');
  };

  const deleteRecipe = (id: string) => {
    Alert.alert('Elimina Ricetta', 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/api/recipes/${id}`, { method: 'DELETE' });
            loadAll(searchQuery);
          } catch (e) {
            console.log('Delete error:', e);
          }
        },
      },
    ]);
  };

  const openDrawer = () => {
    try {
      navigation.dispatch(DrawerActions.openDrawer());
    } catch (e) {
      console.log('Drawer error:', e);
    }
  };

  const getPlatformIcon = (p: string): any => {
    return p === 'instagram' ? 'logo-instagram' : 'logo-facebook';
  };

  const getPlatformColor = (p: string) => {
    return p === 'instagram' ? '#E4405F' : '#1877F2';
  };

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.center}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity
          style={st.menuBtn}
          onPress={openDrawer}
          testID="menu-btn"
        >
          <Ionicons name="menu" size={28} color="#FF6B35" />
        </TouchableOpacity>
        <View style={st.headerText}>
          <Text style={st.title} testID="home-title">
            Il Ricettario di {userName}
          </Text>
          <Text style={st.subtitle}>
            {recipes.length} ricette salvate
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={st.searchRow}>
        <View style={st.searchWrap}>
          <Ionicons name="search" size={18} color="#888" />
          <TextInput
            style={st.searchInput}
            placeholder="Cerca ricette..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            testID="search-input"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={clearSearch}>
              <Ionicons name="close-circle" size={18} color="#888" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={st.searchBtn}
          onPress={handleSearch}
          testID="search-btn"
        >
          <Ionicons name="search" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF6B35"
          />
        }
      >
        {/* Random section */}
        {!searchQuery && randomRecipes.length > 0 ? (
          <View style={st.randomSection}>
            <View style={st.randomHeader}>
              <Ionicons name="sparkles" size={22} color="#FFD700" />
              <Text style={st.randomTitle}>Cosa cuciniamo oggi?</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.randomScroll}
            >
              {randomRecipes.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={st.randomCard}
                  onPress={() => router.push(`/recipe/${r.id}`)}
                  testID={`random-recipe-${r.id}`}
                >
                  {r.thumbnail_url ? (
                    <Image
                      source={{ uri: r.thumbnail_url }}
                      style={st.randomThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={st.randomPlaceholder}>
                      <Ionicons name="restaurant" size={28} color="#FF6B35" />
                    </View>
                  )}
                  <Text style={st.randomName} numberOfLines={2}>
                    {r.name}
                  </Text>
                  <View style={st.randomPlatform}>
                    <Ionicons
                      name={getPlatformIcon(r.platform)}
                      size={12}
                      color={getPlatformColor(r.platform)}
                    />
                    <Text style={st.randomDate}>
                      {new Date(r.created_at).toLocaleDateString('it-IT')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* All Recipes */}
        <Text style={st.sectionLabel}>
          {searchQuery ? 'Risultati' : 'Tutte le ricette'}
        </Text>

        {recipes.length === 0 ? (
          <View style={st.emptyContainer}>
            <Ionicons name="restaurant-outline" size={60} color="#444" />
            <Text style={st.emptyText}>
              {searchQuery ? 'Nessun risultato' : 'Nessuna ricetta'}
            </Text>
            <Text style={st.emptySubtext}>
              {searchQuery
                ? 'Prova un altro termine'
                : 'Aggiungi la tua prima ricetta!'}
            </Text>
          </View>
        ) : (
          recipes.map((recipe) => (
            <TouchableOpacity
              key={recipe.id}
              style={st.recipeCard}
              onPress={() => router.push(`/recipe/${recipe.id}`)}
              activeOpacity={0.7}
              testID={`recipe-card-${recipe.id}`}
            >
              {recipe.thumbnail_url ? (
                <Image
                  source={{ uri: recipe.thumbnail_url }}
                  style={st.thumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={st.thumbPlaceholder}>
                  <Ionicons name="videocam" size={28} color="#666" />
                </View>
              )}
              <View style={st.recipeInfo}>
                <View style={st.recipeHeader}>
                  <Ionicons
                    name={getPlatformIcon(recipe.platform)}
                    size={14}
                    color={getPlatformColor(recipe.platform)}
                  />
                  <Text style={st.recipeName} numberOfLines={1}>
                    {recipe.name}
                  </Text>
                </View>
                <Text style={st.recipeCaption} numberOfLines={2}>
                  {recipe.caption || 'Nessuna descrizione'}
                </Text>
                <View style={st.recipeFooter}>
                  <Text style={st.recipeDate}>
                    {new Date(recipe.created_at).toLocaleDateString('it-IT')}
                  </Text>
                  {recipe.transcription_status === 'done' ? (
                    <View style={st.aiBadge}>
                      <Ionicons name="sparkles" size={11} color="#FFD700" />
                      <Text style={st.aiBadgeText}>AI</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity
                style={st.deleteBtn}
                onPress={() => deleteRecipe(recipe.id)}
              >
                <Ionicons name="trash-outline" size={18} color="#FF4444" />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  menuBtn: {
    padding: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    gap: 6,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 10 },
  searchBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    width: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  randomSection: { marginBottom: 20 },
  randomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  randomTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  randomScroll: { gap: 12 },
  randomCard: {
    width: 140,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  randomThumb: { width: 140, height: 100 },
  randomPlaceholder: {
    width: 140,
    height: 100,
    backgroundColor: '#252525',
    justifyContent: 'center',
    alignItems: 'center',
  },
  randomName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    padding: 10,
    paddingBottom: 4,
  },
  randomPlatform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  randomDate: { fontSize: 11, color: '#888' },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#aaa',
    marginBottom: 10,
  },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#555',
    marginTop: 6,
    textAlign: 'center',
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeInfo: { flex: 1, padding: 10, justifyContent: 'space-between' },
  recipeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recipeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  recipeCaption: { fontSize: 12, color: '#888', marginTop: 2 },
  recipeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  recipeDate: { fontSize: 11, color: '#666' },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#332900',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  aiBadgeText: { fontSize: 10, color: '#FFD700', fontWeight: '600' },
  deleteBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
});
