import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

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
  created_at: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRecipes = async () => {
    try {
      const response = await fetch(`${API_URL}/api/recipes`);
      const data = await response.json();
      setRecipes(data);
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRecipes();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecipes();
  };

  const deleteRecipe = async (id: string) => {
    Alert.alert(
      'Elimina Ricetta',
      'Sei sicuro di voler eliminare questa ricetta?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/recipes/${id}`, { method: 'DELETE' });
              fetchRecipes();
            } catch (error) {
              console.error('Error deleting recipe:', error);
            }
          },
        },
      ]
    );
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram':
        return 'logo-instagram';
      case 'facebook':
        return 'logo-facebook';
      default:
        return 'globe';
    }
  };

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
        <Text style={styles.title}>Le Mie Ricette</Text>
        <Text style={styles.subtitle}>{recipes.length} ricette salvate</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF6B35"
          />
        }
      >
        {recipes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={80} color="#444" />
            <Text style={styles.emptyText}>Nessuna ricetta salvata</Text>
            <Text style={styles.emptySubtext}>
              Aggiungi la tua prima ricetta dalla tab "Aggiungi"
            </Text>
          </View>
        ) : (
          recipes.map((recipe) => (
            <TouchableOpacity
              key={recipe.id}
              style={styles.recipeCard}
              onPress={() => router.push(`/recipe/${recipe.id}`)}
              activeOpacity={0.7}
            >
              {recipe.thumbnail_url ? (
                <Image
                  source={{ uri: recipe.thumbnail_url }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.placeholderThumbnail}>
                  <Ionicons name="videocam" size={40} color="#666" />
                </View>
              )}
              <View style={styles.recipeInfo}>
                <View style={styles.recipeHeader}>
                  <Ionicons
                    name={getPlatformIcon(recipe.platform)}
                    size={18}
                    color={recipe.platform === 'instagram' ? '#E4405F' : '#1877F2'}
                  />
                  <Text style={styles.recipeName} numberOfLines={1}>
                    {recipe.name}
                  </Text>
                </View>
                <Text style={styles.recipeCaption} numberOfLines={2}>
                  {recipe.caption || 'Nessuna descrizione'}
                </Text>
                <Text style={styles.recipeDate}>
                  {new Date(recipe.created_at).toLocaleDateString('it-IT')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => deleteRecipe(recipe.id)}
              >
                <Ionicons name="trash-outline" size={22} color="#FF4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#555',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  thumbnail: {
    width: 100,
    height: 100,
  },
  placeholderThumbnail: {
    width: 100,
    height: 100,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  recipeCaption: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  recipeDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
});
