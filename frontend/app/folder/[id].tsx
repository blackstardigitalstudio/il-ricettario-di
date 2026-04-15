import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Folder {
  id: string;
  name: string;
}

interface Subfolder {
  id: string;
  folder_id: string;
  name: string;
}

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

export default function FolderDetailScreen() {
  const { id, subfolder } = useLocalSearchParams<{ id: string; subfolder?: string }>();
  const router = useRouter();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [subfolderData, setSubfolderData] = useState<Subfolder | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [id, subfolder]);

  const fetchData = async () => {
    try {
      // Fetch folder
      const folderRes = await fetch(`${API_URL}/api/folders/${id}`);
      if (folderRes.ok) {
        const folderData = await folderRes.json();
        setFolder(folderData);
      }

      // Fetch subfolder if specified
      if (subfolder) {
        const subRes = await fetch(`${API_URL}/api/subfolders/${subfolder}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubfolderData(subData);
        }
      }

      // Fetch recipes
      let recipesUrl = `${API_URL}/api/recipes?folder_id=${id}`;
      if (subfolder) {
        recipesUrl += `&subfolder_id=${subfolder}`;
      }
      const recipesRes = await fetch(recipesUrl);
      if (recipesRes.ok) {
        const recipesData = await recipesRes.json();
        setRecipes(recipesData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteRecipe = async (recipeId: string) => {
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
              await fetch(`${API_URL}/api/recipes/${recipeId}`, { method: 'DELETE' });
              fetchData();
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {folder?.name || 'Cartella'}
          </Text>
          {subfolderData && (
            <Text style={styles.headerSubtitle}>{subfolderData.name}</Text>
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {recipes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={80} color="#444" />
            <Text style={styles.emptyText}>Nessuna ricetta</Text>
            <Text style={styles.emptySubtext}>
              Aggiungi ricette a questa cartella dalla tab "Aggiungi"
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
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
