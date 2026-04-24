import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { authFetch } from '../../src/utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLang } from '../../src/context/LangContext';
import { useTheme } from '../../src/context/ThemeContext';

const BLURHASH = 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4';
const THUMB_TRANSITION = 150;

interface Recipe {
  id: string;
  name: string;
  platform: string;
  thumbnail_url: string;
  transcription_status?: string;
  created_at: string;
  is_favorite?: boolean;
}

/** Memoised horizontal "what to cook today" card */
const RandomCard = memo(function RandomCard({ r, onPress, st }: { r: Recipe; onPress: () => void; st: any }) {
  const dateStr = useMemo(
    () => (r.created_at ? new Date(r.created_at).toLocaleDateString(undefined) : ''),
    [r.created_at]
  );
  return (
    <TouchableOpacity style={st.randomCard} onPress={onPress} testID={`random-recipe-${r.id}`}>
      {r.thumbnail_url ? (
        <Image
          source={r.thumbnail_url}
          style={st.randomThumb}
          contentFit="cover"
          transition={THUMB_TRANSITION}
          placeholder={BLURHASH}
          cachePolicy="memory-disk"
          recyclingKey={r.id}
        />
      ) : (
        <View style={st.randomPlaceholder}>
          <Ionicons name="restaurant" size={28} color="#FF6B35" />
        </View>
      )}
      <Text style={st.randomName} numberOfLines={2}>{r.name}</Text>
      <View style={st.randomPlatform}>
        <Ionicons
          name={r.platform === 'instagram' ? 'logo-instagram' : 'logo-facebook'}
          size={12}
          color={r.platform === 'instagram' ? '#E4405F' : '#1877F2'}
        />
        <Text style={st.randomDate}>{dateStr}</Text>
      </View>
    </TouchableOpacity>
  );
});

/** Memoised main list card (the expensive repeater) */
const RecipeCard = memo(function RecipeCard({
  recipe, onPress, onDelete, labelNoDescription, st,
}: {
  recipe: Recipe;
  onPress: () => void;
  onDelete: () => void;
  labelNoDescription: string;
  st: any;
}) {
  const dateStr = useMemo(
    () => (recipe.created_at ? new Date(recipe.created_at).toLocaleDateString(undefined) : ''),
    [recipe.created_at]
  );
  const iconName = recipe.platform === 'instagram' ? 'logo-instagram' : 'logo-facebook';
  const iconColor = recipe.platform === 'instagram' ? '#E4405F' : '#1877F2';
  return (
    <TouchableOpacity
      style={st.recipeCard}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`recipe-card-${recipe.id}`}
    >
      {recipe.thumbnail_url ? (
        <Image
          source={recipe.thumbnail_url}
          style={st.thumb}
          contentFit="cover"
          transition={THUMB_TRANSITION}
          placeholder={BLURHASH}
          cachePolicy="memory-disk"
          recyclingKey={recipe.id}
        />
      ) : (
        <View style={st.thumbPlaceholder}>
          <Ionicons name="videocam" size={28} color="#666" />
        </View>
      )}
      <View style={st.recipeInfo}>
        <View style={st.recipeHeader}>
          <Ionicons name={iconName} size={14} color={iconColor} />
          <Text style={st.recipeName} numberOfLines={1}>{recipe.name}</Text>
          {recipe.is_favorite ? <Ionicons name="star" size={14} color="#FFD700" /> : null}
        </View>
        <Text style={st.recipeCaption} numberOfLines={2}>{labelNoDescription}</Text>
        <View style={st.recipeFooter}>
          <Text style={st.recipeDate}>{dateStr}</Text>
          {recipe.transcription_status === 'done' ? (
            <View style={st.aiBadge}>
              <Ionicons name="sparkles" size={11} color="#FFD700" />
              <Text style={st.aiBadgeText}>AI</Text>
            </View>
          ) : null}
        </View>
      </View>
      <TouchableOpacity style={st.deleteBtn} onPress={onDelete}>
        <Ionicons name="trash-outline" size={18} color="#FF4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { T } = useLang();
  const { colors } = useTheme();
  const st = useMemo(() => makeStyles(colors), [colors]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [randomRecipes, setRandomRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRecipes = async (query?: string) => {
    try {
      // Light projection on list views: 10x smaller JSON, 2-3x faster on Android
      let path = '/api/recipes?light=true';
      if (query && query.trim()) {
        path += `&search=${encodeURIComponent(query.trim())}`;
      }
      const res = await authFetch(path);
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
      const res = await authFetch(`/api/recipes/random?count=3`);
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
      /* ignore */
    }
    // Run network calls in parallel — on Android the perceived latency drops a lot.
    if (!query) {
      await Promise.all([fetchRecipes(query), fetchRandom()]);
    } else {
      await fetchRecipes(query);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadAll(searchQuery);
      checkClipboardForRecipeLink();
    }, [])
  );

  // When the app comes back to foreground, check the clipboard for IG/FB URLs
  // and offer to save them as a new recipe. This is the pragmatic alternative
  // to reading the Android SEND intent extra text.
  const checkClipboardForRecipeLink = async () => {
    try {
      const lastHandled = await AsyncStorage.getItem('clipboard_last_handled');
      const clip = await Clipboard.getStringAsync();
      if (!clip || clip === lastHandled) return;
      const m = clip.match(/https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.watch)\/[^\s]+/i);
      if (!m) return;
      const url = m[0];
      Alert.alert(
        T('add_from_clipboard_title') || 'Link rilevato',
        `${T('add_from_clipboard_msg') || 'Vuoi salvare questo link come nuova ricetta?'}\n\n${url}`,
        [
          { text: T('cancel'), style: 'cancel', onPress: () => AsyncStorage.setItem('clipboard_last_handled', clip) },
          { text: T('add') || 'Aggiungi', onPress: async () => {
            await AsyncStorage.setItem('clipboard_last_handled', clip);
            router.push({ pathname: '/(drawer)/add', params: { prefillUrl: url } });
          }},
        ],
      );
    } catch (e) { /* ignore */ }
  };

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
    Alert.alert(T('delete_recipe'), T('are_you_sure'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await authFetch(`/api/recipes/${id}`, { method: 'DELETE' });
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

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.center}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      </SafeAreaView>
    );
  }

  const noDescLabel = T('no_description');

  const renderRecipe = ({ item }: { item: Recipe }) => (
    <RecipeCard
      recipe={item}
      onPress={() => router.push(`/recipe/${item.id}`)}
      onDelete={() => deleteRecipe(item.id)}
      labelNoDescription={noDescLabel}
      st={st}
    />
  );

  const ListHeader = (
    <View>
      {!searchQuery && randomRecipes.length > 0 ? (
        <View style={st.randomSection}>
          <View style={st.randomHeader}>
            <Ionicons name="sparkles" size={22} color="#FFD700" />
            <Text style={st.randomTitle}>{T('what_cook_today')}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.randomScroll}>
            {randomRecipes.map((r) => (
              <RandomCard key={r.id} r={r} onPress={() => router.push(`/recipe/${r.id}`)} st={st} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Text style={st.sectionLabel}>
        {searchQuery ? T('results') : T('all_recipes')}
      </Text>
    </View>
  );

  const ListEmpty = (
    <View style={st.emptyContainer}>
      <Ionicons name="restaurant-outline" size={60} color="#444" />
      <Text style={st.emptyText}>
        {searchQuery ? T('no_results') : T('no_recipes')}
      </Text>
      <Text style={st.emptySubtext}>
        {searchQuery ? T('try_other_term') : T('add_first_recipe')}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity style={st.menuBtn} onPress={openDrawer} testID="menu-btn">
          <Ionicons name="menu" size={28} color="#FF6B35" />
        </TouchableOpacity>
        <View style={st.headerText}>
          <Text style={st.title} testID="home-title">
            {T('cookbook_of')} {userName}
          </Text>
          <Text style={st.subtitle}>
            {recipes.length} {T('recipes_saved')}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={st.searchRow}>
        <View style={st.searchWrap}>
          <Ionicons name="search" size={18} color="#888" />
          <TextInput
            style={st.searchInput}
            placeholder={T('search_recipes')}
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
        <TouchableOpacity style={st.searchBtn} onPress={handleSearch} testID="search-btn">
          <Ionicons name="search" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={recipes}
        keyExtractor={(r) => r.id}
        renderItem={renderRecipe}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={st.scrollContent}
        // Performance tuning for low/mid-end Android (Samsung A-series, J-series):
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />
        }
      />

      {/* Settings FAB bottom-left */}
      <TouchableOpacity
        style={st.fabSettings}
        onPress={() => router.push('/(drawer)/settings')}
        testID="fab-settings"
        activeOpacity={0.8}
      >
        <Ionicons name="settings" size={26} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const st = makeStyles({
  bg: '#0f0f0f', card: '#1a1a1a', cardBorder: '#2a2a2a', text: '#ffffff',
  textMuted: '#aaaaaa', textSubtle: '#666666', accent: '#FF6B35',
  accentSoft: '#FF6B3520', divider: '#222222', overlay: 'rgba(0,0,0,0.85)',
  inputBg: '#252525', success: '#4CAF50', danger: '#FF4444',
});

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
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
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    gap: 6,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10 },
  searchBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    width: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  fabSettings: {
    position: 'absolute',
    left: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  randomSection: { marginBottom: 20 },
  randomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  randomTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  randomScroll: { gap: 12 },
  randomCard: {
    width: 140,
    backgroundColor: colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  randomThumb: { width: 140, height: 100 },
  randomPlaceholder: {
    width: 140,
    height: 100,
    backgroundColor: colors.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  randomName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
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
  randomDate: { fontSize: 11, color: colors.textMuted },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 10,
  },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textSubtle,
    marginTop: 6,
    textAlign: 'center',
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeInfo: { flex: 1, padding: 10, justifyContent: 'space-between' },
  recipeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recipeName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  recipeCaption: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  recipeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  recipeDate: { fontSize: 11, color: colors.textSubtle },
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
}
