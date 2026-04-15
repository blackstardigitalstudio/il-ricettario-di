import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

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

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    fetchRecipe();
  }, [id]);

  const fetchRecipe = async () => {
    try {
      const response = await fetch(`${API_URL}/api/recipes/${id}`);
      if (response.ok) {
        const data = await response.json();
        setRecipe(data);
      } else {
        Alert.alert('Errore', 'Ricetta non trovata');
        router.back();
      }
    } catch (error) {
      console.error('Error fetching recipe:', error);
      Alert.alert('Errore', 'Impossibile caricare la ricetta');
    } finally {
      setLoading(false);
    }
  };

  const openOriginalLink = () => {
    if (recipe?.source_url) {
      Linking.openURL(recipe.source_url);
    }
  };

  const deleteRecipe = () => {
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
              router.back();
            } catch (error) {
              console.error('Error deleting recipe:', error);
            }
          },
        },
      ]
    );
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

  if (!recipe) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {recipe.name}
        </Text>
        <TouchableOpacity style={styles.deleteButton} onPress={deleteRecipe}>
          <Ionicons name="trash-outline" size={24} color="#FF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Video Player */}
        <View style={styles.videoContainer}>
          {recipe.video_url && !videoError ? (
            <Video
              source={{ uri: recipe.video_url }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              onError={(error) => {
                console.log('Video error:', error);
                setVideoError(true);
              }}
            />
          ) : (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="videocam-off" size={60} color="#666" />
              <Text style={styles.videoPlaceholderText}>
                {videoError ? 'Video non disponibile' : 'Nessun video'}
              </Text>
              <TouchableOpacity style={styles.openLinkButton} onPress={openOriginalLink}>
                <Ionicons name="open-outline" size={20} color="#FF6B35" />
                <Text style={styles.openLinkText}>Apri link originale</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Platform Badge */}
        <View style={styles.platformBadge}>
          <Ionicons
            name={recipe.platform === 'instagram' ? 'logo-instagram' : 'logo-facebook'}
            size={22}
            color={recipe.platform === 'instagram' ? '#E4405F' : '#1877F2'}
          />
          <Text style={styles.platformText}>
            {recipe.platform === 'instagram' ? 'Instagram' : 'Facebook'}
          </Text>
        </View>

        {/* Recipe Info */}
        <View style={styles.infoSection}>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          <Text style={styles.recipeDate}>
            Salvata il {new Date(recipe.created_at).toLocaleDateString('it-IT', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>

        {/* Caption */}
        {recipe.caption ? (
          <View style={styles.captionSection}>
            <Text style={styles.sectionTitle}>Descrizione</Text>
            <Text style={styles.captionText}>{recipe.caption}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionButton} onPress={openOriginalLink}>
            <Ionicons name="open-outline" size={22} color="#fff" />
            <Text style={styles.actionButtonText}>Apri Originale</Text>
          </TouchableOpacity>
        </View>
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
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginHorizontal: 12,
  },
  deleteButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 500,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  videoPlaceholderText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  openLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#252525',
    borderRadius: 25,
  },
  openLinkText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '600',
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  platformText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  recipeName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
  },
  recipeDate: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  captionSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#aaa',
    marginBottom: 12,
  },
  captionText: {
    fontSize: 15,
    color: '#ddd',
    lineHeight: 24,
  },
  actionsSection: {
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
