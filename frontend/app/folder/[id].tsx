import { authFetch } from '../../src/utils/api';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';



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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      const folderRes = await authFetch(`/api/folders/${id}`);
      if (folderRes.ok) {
        const folderData = await folderRes.json();
        setFolder(folderData);
      }

      // Fetch subfolder if specified
      if (subfolder) {
        const subRes = await authFetch(`/api/subfolders/${subfolder}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubfolderData(subData);
        }
      }

      // Fetch recipes (light projection for faster render on Android)
      // IMPORTANT: use authFetch so X-Device-Id is sent — otherwise the backend
      // falls back to DEFAULT_LOCAL_USER and the user won't see their recipes.
      let recipesUrl = `/api/recipes?folder_id=${id}&light=true`;
      if (subfolder) {
        recipesUrl += `&subfolder_id=${subfolder}`;
      }
      const recipesRes = await authFetch(recipesUrl);
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
              await authFetch(`/api/recipes/${recipeId}`, { method: 'DELETE' });
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
          <Ionicons name="arrow-back" size={28} color={colors.text} />
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
            <Ionicons name="restaurant-outline" size={80} color={colors.textSubtle} />
            <Text style={styles.emptyText}>Nessuna ricetta</Text>
            <Text style={styles.emptySubtext}>
              Aggiungi ricette a questa cartella dalla tab &quot;Aggiungi&quot;
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
                  source={recipe.thumbnail_url}
                  style={styles.thumbnail}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  recyclingKey={recipe.id}
                />
              ) : (
                <View style={styles.placeholderThumbnail}>
                  <Ionicons name="videocam" size={40} color={colors.textSubtle} />
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
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
    borderBottomColor: colors.divider,
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
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
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
    color: colors.textSubtle,
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSubtle,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  thumbnail: {
    width: 100,
    height: 100,
  },
  placeholderThumbnail: {
    width: 100,
    height: 100,
    backgroundColor: colors.cardBorder,
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
    color: colors.text,
    flex: 1,
  },
  recipeCaption: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  recipeDate: {
    fontSize: 12,
    color: colors.textSubtle,
    marginTop: 4,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
});
}
