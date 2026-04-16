import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Image, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Recipe {
  id: string;
  name: string;
  folder_id: string | null;
  subfolder_id: string | null;
  source_url: string;
  platform: string;
  caption: string;
  video_url: string;
  thumbnail_url: string;
  notes: string;
  transcription: string;
  transcription_status: string;
  created_at: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const fetchRecipes = async (query?: string) => {
    try {
      let url = `${API_URL}/api/recipes`;
      if (query && query.trim()) {
        url += `?search=${encodeURIComponent(query.trim())}`;
      }
      const response = await fetch(url);
      const data = await response.json();
      setRecipes(data);
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setSearching(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        const name = await AsyncStorage.getItem('user_name');
        setUserName(name || '');
        fetchRecipes(searchQuery);
      };
      load();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecipes(searchQuery);
  };

  const handleSearch = () => {
    setSearching(true);
    fetchRecipes(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery('');
    fetchRecipes('');
  };

  const deleteRecipe = (id: string) => {
    Alert.alert('Elimina Ricetta', 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina', style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/api/recipes/${id}`, { method: 'DELETE' });
            fetchRecipes(searchQuery);
          } catch (e) { console.error(e); }
        },
      },
    ]);
  };

  const getPlatformIcon = (p: string) => p === 'instagram' ? 'logo-instagram' : p === 'facebook' ? 'logo-facebook' : 'globe';
  const getPlatformColor = (p: string) => p === 'instagram' ? '#E4405F' : '#1877F2';

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} testID="home-title">
          Il Ricettario di {userName}
        </Text>
        <Text style={styles.subtitle}>{recipes.length} ricette salvate</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={20} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca ricette..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            testID="search-input"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={clearSearch} testID="search-clear-btn">
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch} testID="search-btn">
          {searching ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
      >
        {recipes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={80} color="#444" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'Nessun risultato' : 'Nessuna ricetta salvata'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Prova con un altro termine' : 'Aggiungi la tua prima ricetta dalla tab "Aggiungi"'}
            </Text>
          </View>
        ) : (
          recipes.map((recipe) => (
            <TouchableOpacity
              key={recipe.id} style={styles.recipeCard}
              onPress={() => router.push(`/recipe/${recipe.id}`)}
              activeOpacity={0.7} testID={`recipe-card-${recipe.id}`}
            >
              {recipe.thumbnail_url ? (
                <Image source={{ uri: recipe.thumbnail_url }} style={styles.thumbnail} resizeMode="cover" />
              ) : (
                <View style={styles.placeholderThumbnail}>
                  <Ionicons name="videocam" size={32} color="#666" />
                </View>
              )}
              <View style={styles.recipeInfo}>
                <View style={styles.recipeHeader}>
                  <Ionicons name={getPlatformIcon(recipe.platform)} size={16} color={getPlatformColor(recipe.platform)} />
                  <Text style={styles.recipeName} numberOfLines={1}>{recipe.name}</Text>
                </View>
                <Text style={styles.recipeCaption} numberOfLines={2}>
                  {recipe.caption || 'Nessuna descrizione'}
                </Text>
                <View style={styles.recipeFooter}>
                  <Text style={styles.recipeDate}>
                    {new Date(recipe.created_at).toLocaleDateString('it-IT')}
                  </Text>
                  {recipe.transcription_status === 'done' && (
                    <View style={styles.transcribedBadge}>
                      <Ionicons name="mic" size={12} color="#4CAF50" />
                      <Text style={styles.transcribedText}>Trascritto</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deleteRecipe(recipe.id)} testID={`delete-recipe-${recipe.id}`}>
                <Ionicons name="trash-outline" size={20} color="#FF4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#888', marginTop: 4 },
  searchContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
    borderRadius: 12, borderWidth: 1, borderColor: '#333', paddingHorizontal: 14, gap: 8,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 12 },
  searchButton: {
    backgroundColor: '#FF6B35', borderRadius: 12, width: 48, justifyContent: 'center', alignItems: 'center',
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 20 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#666', marginTop: 20 },
  emptySubtext: { fontSize: 14, color: '#555', marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
  recipeCard: {
    flexDirection: 'row', backgroundColor: '#1a1a1a', borderRadius: 14, marginBottom: 10,
    overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2a',
  },
  thumbnail: { width: 90, height: 90 },
  placeholderThumbnail: { width: 90, height: 90, backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' },
  recipeInfo: { flex: 1, padding: 10, justifyContent: 'space-between' },
  recipeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recipeName: { fontSize: 15, fontWeight: '600', color: '#fff', flex: 1 },
  recipeCaption: { fontSize: 12, color: '#888', marginTop: 4 },
  recipeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  recipeDate: { fontSize: 11, color: '#666' },
  transcribedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  transcribedText: { fontSize: 11, color: '#4CAF50' },
  deleteButton: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
});
