import { authFetch } from '../../src/utils/api';
import { useLang } from '../../src/context/LangContext';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, TextInput, KeyboardAvoidingView, Platform, Modal, Image, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Recipe {
  id: string; name: string; source_url: string; platform: string;
  caption: string; thumbnail_url: string; notes: string;
  transcription: string; transcription_status: string; created_at: string;
  ingredients?: string;
  tags?: string[]; difficulty?: string; prep_time?: number; cook_time?: number;
  is_favorite?: boolean;
}

type Difficulty = 'easy' | 'medium' | 'hard' | '';
type EditFocus = 'all' | 'name' | 'caption' | 'notes' | 'ingredients' | 'transcription';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { T } = useLang();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcribing, setTranscribing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFocus, setEditFocus] = useState<EditFocus>('all');

  // Edit state
  const [editName, setEditName] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editIngredients, setEditIngredients] = useState('');
  const [editTranscription, setEditTranscription] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [editDifficulty, setEditDifficulty] = useState<Difficulty>('');
  const [editPrep, setEditPrep] = useState('');
  const [editCook, setEditCook] = useState('');
  const [saving, setSaving] = useState(false);
  const [pollingTimer, setPollingTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { fetchRecipe(); return () => { if (pollingTimer) clearInterval(pollingTimer); }; }, [id]);

  const fetchRecipe = async () => {
    try {
      const res = await authFetch(`/api/recipes/${id}`);
      if (res.ok) { setRecipe(await res.json()); } else { router.back(); }
    } catch (e) { console.log(e); }
    finally { setLoading(false); }
  };

  const startPolling = () => {
    if (pollingTimer) clearInterval(pollingTimer);
    const timer = setInterval(async () => {
      try {
        const res = await authFetch(`/api/recipes/${id}`);
        if (res.ok) {
          const data = await res.json();
          setRecipe(data);
          if (data.transcription_status !== 'pending') { clearInterval(timer); setTranscribing(false); }
        }
      } catch (e) { /* */ }
    }, 3000);
    setPollingTimer(timer);
  };

  const generateRecipeAI = async () => {
    if (!recipe) return;
    setTranscribing(true);
    try {
      const res = await authFetch(`/api/recipes/${recipe.id}/generate-recipe`, { method: 'POST' });
      if (res.ok) { startPolling(); } else { setTranscribing(false); }
    } catch (e) { setTranscribing(false); }
  };

  const toggleFavorite = async () => {
    if (!recipe) return;
    const newVal = !recipe.is_favorite;
    setRecipe({ ...recipe, is_favorite: newVal });
    try {
      await authFetch(`/api/recipes/${recipe.id}`, {
        method: 'PUT', body: JSON.stringify({ is_favorite: newVal }),
      });
    } catch (e) {
      setRecipe({ ...recipe, is_favorite: !newVal });
    }
  };

  const downloadVideo = async () => {
    if (!recipe) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const res = await authFetch(`/api/recipes/${recipe.id}/download-video`, { method: 'POST' });
      const data = await res.json();

      if (data.success && data.video_url) {
        // Build full URL if it's an internal path
        const fullUrl = data.video_url.startsWith('http') ? data.video_url : `${BACKEND_URL}${data.video_url}`;

        if (Platform.OS === 'web') {
          window.open(fullUrl, '_blank');
          Alert.alert(T('download_started'), T('download_started'));
        } else {
          const fileUri = FileSystem.documentDirectory + `${recipe.name.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
          const callback = (dp: FileSystem.DownloadProgressData) => {
            const progress = dp.totalBytesWritten / (dp.totalBytesExpectedToWrite || 1);
            setDownloadProgress(Math.round(progress * 100));
          };
          const downloadResumable = FileSystem.createDownloadResumable(fullUrl, fileUri, {}, callback);
          const result = await downloadResumable.downloadAsync();
          if (result && result.uri) {
            setDownloadProgress(100);
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(result.uri, { mimeType: 'video/mp4', dialogTitle: T('downloaded') });
            } else {
              Alert.alert(T('downloaded'), T('downloaded'));
            }
          }
        }
      } else if (data.fallback_links && data.fallback_links.length > 0) {
        // Open in-app WebView downloader (tries SSSInstagram/FDownloader)
        router.push({
          pathname: '/web-downloader',
          params: { url: recipe.source_url, platform: recipe.platform },
        });
      } else {
        Linking.openURL(recipe.source_url);
      }
    } catch (e) {
      console.log('Download error:', e);
      Alert.alert(T('error'), T('connection_error'));
    }
    finally { setDownloading(false); setDownloadProgress(0); }
  };

  const shareOnWhatsApp = async () => {
    if (!recipe) return;
    let message = `🍽️ *${recipe.name}*\n\n`;
    if (recipe.caption) message += `📝 ${recipe.caption}\n\n`;
    if (recipe.ingredients) message += `📋 ${T('ingredients')}:\n${recipe.ingredients}\n\n`;
    if (recipe.transcription && recipe.transcription_status === 'done') {
      message += `${recipe.transcription}\n\n`;
    }
    message += `📱 Video: ${recipe.source_url}\n\n`;
    message += `✨ ${T('discover_app')}\n`;
    message += `👉 ${T('download_app')}: https://play.google.com/store/apps/details?id=app.emergent.foodorganizer241c92aba2`;

    try {
      if (Platform.OS === 'web') {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
      } else {
        await Share.share({ message, title: recipe.name });
      }
    } catch (e) { console.log('Share error:', e); }
  };

  const pickCoverImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permesso', 'Serve accesso alla galleria.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.6, base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        setUploadingThumb(true);
        const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const res = await authFetch(`/api/recipes/${recipe!.id}/generate-thumbnail`, {
          method: 'POST', body: JSON.stringify({ image_base64: b64 }),
        });
        if (res.ok) { const d = await res.json(); if (d.success) setRecipe({ ...recipe!, thumbnail_url: d.thumbnail_url }); }
        setUploadingThumb(false);
      }
    } catch (e) { setUploadingThumb(false); }
  };

  const openEditModal = (focus: EditFocus = 'all') => {
    if (!recipe) return;
    setEditFocus(focus);
    setEditName(recipe.name);
    setEditCaption(recipe.caption);
    setEditNotes(recipe.notes);
    setEditIngredients(recipe.ingredients || '');
    setEditTranscription(recipe.transcription || '');
    setEditTags(recipe.tags || []);
    setNewTagInput('');
    setEditDifficulty((recipe.difficulty as Difficulty) || '');
    setEditPrep(recipe.prep_time ? String(recipe.prep_time) : '');
    setEditCook(recipe.cook_time ? String(recipe.cook_time) : '');
    setShowEditModal(true);
  };

  const addTag = () => {
    const tag = newTagInput.trim();
    if (!tag) return;
    if (editTags.includes(tag)) { setNewTagInput(''); return; }
    setEditTags([...editTags, tag]);
    setNewTagInput('');
  };

  const removeTag = (tag: string) => setEditTags(editTags.filter(t => t !== tag));

  const saveEdit = async () => {
    if (!recipe || !editName.trim()) return;
    setSaving(true);
    try {
      const body: any = {
        name: editName.trim(),
        caption: editCaption.trim(),
        notes: editNotes.trim(),
        ingredients: editIngredients.trim(),
        transcription: editTranscription.trim(),
        tags: editTags,
        difficulty: editDifficulty,
        prep_time: parseInt(editPrep, 10) || 0,
        cook_time: parseInt(editCook, 10) || 0,
      };
      const res = await authFetch(`/api/recipes/${recipe.id}`, {
        method: 'PUT', body: JSON.stringify(body),
      });
      if (res.ok) { setRecipe(await res.json()); setShowEditModal(false); }
    } catch (e) { /* */ }
    finally { setSaving(false); }
  };

  const deleteRecipe = () => {
    Alert.alert(T('delete'), T('are_you_sure'), [
      { text: T('cancel'), style: 'cancel' },
      { text: T('delete'), style: 'destructive', onPress: async () => {
        await authFetch(`/api/recipes/${id}`, { method: 'DELETE' }); router.back();
      }},
    ]);
  };

  if (loading || !recipe) {
    return <SafeAreaView style={s.container}><View style={s.center}><ActivityIndicator size="large" color="#FF6B35" /></View></SafeAreaView>;
  }

  const difficultyColor = (d?: string) => d === 'easy' ? '#4CAF50' : d === 'medium' ? '#FFC107' : d === 'hard' ? '#FF4444' : '#777';
  const difficultyLabel = (d?: string) => d === 'easy' ? T('easy') : d === 'medium' ? T('medium') : d === 'hard' ? T('hard') : '';
  const hasMeta = !!recipe.difficulty || (recipe.prep_time ?? 0) > 0 || (recipe.cook_time ?? 0) > 0;

  // Small pencil icon component for each editable card
  const EditIcon = ({ focus }: { focus: EditFocus }) => (
    <TouchableOpacity style={s.editIcon} onPress={() => openEditModal(focus)} hitSlop={10}>
      <Ionicons name="pencil" size={15} color="#FF6B35" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.hBtn} onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={s.hTitle} numberOfLines={1}>{recipe.name}</Text>
        <TouchableOpacity style={s.hBtn} onPress={toggleFavorite} testID="fav-btn">
          <Ionicons name={recipe.is_favorite ? 'star' : 'star-outline'} size={22} color={recipe.is_favorite ? '#FFD700' : '#aaa'} />
        </TouchableOpacity>
        <TouchableOpacity style={s.hBtn} onPress={() => openEditModal('all')} testID="edit-btn">
          <Ionicons name="pencil" size={20} color="#FF6B35" />
        </TouchableOpacity>
        <TouchableOpacity style={s.hBtn} onPress={deleteRecipe} testID="delete-btn">
          <Ionicons name="trash-outline" size={20} color="#FF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Cover */}
        <TouchableOpacity onPress={pickCoverImage} activeOpacity={0.8}>
          {recipe.thumbnail_url ? (
            <View><Image source={{ uri: recipe.thumbnail_url }} style={s.coverImg} resizeMode="cover" />
              <View style={s.coverBadge}><Ionicons name="camera" size={14} color="#fff" /><Text style={s.coverBadgeText}>{T('change_cover')}</Text></View></View>
          ) : (
            <View style={s.noCover}>{uploadingThumb ? <ActivityIndicator size="large" color="#FF6B35" /> : (
              <><Ionicons name="image" size={48} color="#FF6B35" /><Text style={s.noCoverText}>{T('add_cover')}</Text></>
            )}</View>
          )}
        </TouchableOpacity>

        {/* Meta */}
        <View style={s.meta}>
          <Ionicons name={recipe.platform === 'instagram' ? 'logo-instagram' : 'logo-facebook'} size={18}
            color={recipe.platform === 'instagram' ? '#E4405F' : '#1877F2'} />
          <Text style={s.metaText}>{recipe.platform === 'instagram' ? 'Instagram' : 'Facebook'}</Text>
          <Text style={s.metaDate}>{new Date(recipe.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        </View>
        <TouchableOpacity activeOpacity={0.7} onPress={() => openEditModal('name')}>
          <Text style={s.name}>{recipe.name}</Text>
        </TouchableOpacity>

        {/* Difficulty + Time row */}
        {hasMeta ? (
          <View style={s.metaRow}>
            {recipe.difficulty ? (
              <View style={[s.chip, { borderColor: difficultyColor(recipe.difficulty) }]}>
                <Ionicons name="flame" size={14} color={difficultyColor(recipe.difficulty)} />
                <Text style={[s.chipText, { color: difficultyColor(recipe.difficulty) }]}>{difficultyLabel(recipe.difficulty)}</Text>
              </View>
            ) : null}
            {(recipe.prep_time ?? 0) > 0 ? (
              <View style={s.chip}>
                <Ionicons name="time-outline" size={14} color="#aaa" />
                <Text style={s.chipText}>{T('prep_time')}: {recipe.prep_time} {T('minutes_short')}</Text>
              </View>
            ) : null}
            {(recipe.cook_time ?? 0) > 0 ? (
              <View style={s.chip}>
                <Ionicons name="flame-outline" size={14} color="#aaa" />
                <Text style={s.chipText}>{T('cook_time')}: {recipe.cook_time} {T('minutes_short')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 ? (
          <View style={s.tagRow}>
            {recipe.tags.map((t) => (
              <View key={t} style={s.tag}><Text style={s.tagText}>#{t}</Text></View>
            ))}
          </View>
        ) : null}

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity style={[s.actBtn, { backgroundColor: '#4CAF50' }, downloading && s.disabled]}
            onPress={downloadVideo} disabled={downloading} testID="download-btn">
            {downloading ? (
              <><ActivityIndicator size="small" color="#fff" /><Text style={s.actText}>{downloadProgress > 0 ? `${downloadProgress}%` : T('preparing_download')}</Text></>
            ) : (
              <><Ionicons name="download" size={18} color="#fff" /><Text style={s.actText}>{T('download')}</Text></>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[s.actBtn, { backgroundColor: '#25D366' }]} onPress={shareOnWhatsApp} testID="share-wa-btn">
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <Text style={s.actText}>{T('share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actBtn, { backgroundColor: '#FF6B35' }]} onPress={() => Linking.openURL(recipe.source_url)} testID="open-btn">
            <Ionicons name="play-circle" size={18} color="#fff" />
            <Text style={s.actText}>{T('watch')}</Text>
          </TouchableOpacity>
        </View>

        {/* Caption (editable) */}
        <View style={s.card}>
          <View style={s.cardH}>
            <Ionicons name="document-text-outline" size={16} color="#FF6B35" />
            <Text style={s.cardT}>{T('description')}</Text>
            <EditIcon focus="caption" />
          </View>
          {recipe.caption ? <Text style={s.cardBody}>{recipe.caption}</Text> : <Text style={s.empty}>{T('tap_pencil_to_add')}</Text>}
        </View>

        {/* Ingredients (editable) */}
        <View style={s.card}>
          <View style={s.cardH}>
            <Ionicons name="list" size={16} color="#4CAF50" />
            <Text style={s.cardT}>🍅 {T('ingredients')}</Text>
            <EditIcon focus="ingredients" />
          </View>
          {recipe.ingredients ? <Text style={s.cardBody}>{recipe.ingredients}</Text> : <Text style={s.empty}>{T('tap_pencil_to_add')}</Text>}
        </View>

        {/* Notes (editable) */}
        <View style={s.card}>
          <View style={s.cardH}>
            <Ionicons name="create-outline" size={16} color="#FF6B35" />
            <Text style={s.cardT}>{T('personal_notes')}</Text>
            <EditIcon focus="notes" />
          </View>
          {recipe.notes ? <Text style={s.cardBody}>{recipe.notes}</Text> : <Text style={s.empty}>{T('tap_pencil_to_add')}</Text>}
        </View>

        {/* AI / Procedure */}
        <View style={s.card}>
          <View style={s.cardH}>
            <Ionicons name="sparkles" size={16} color="#FFD700" />
            <Text style={s.cardT}>👨‍🍳 {T('procedure')}</Text>
            {recipe.transcription_status === 'done' ? <EditIcon focus="transcription" /> : null}
          </View>
          {recipe.transcription_status === 'done' ? <Text style={s.cardBody}>{recipe.transcription}</Text>
          : recipe.transcription_status === 'pending' || transcribing ? (
            <View style={s.row}><ActivityIndicator size="small" color="#FF6B35" /><Text style={s.rowText}>{T('generating')}</Text></View>
          ) : recipe.transcription_status === 'error' ? (
            <View><Text style={s.err}>{recipe.transcription}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={generateRecipeAI}><Text style={s.retryText}>{T('retry')}</Text></TouchableOpacity></View>
          ) : (
            <TouchableOpacity style={s.aiBtn} onPress={generateRecipeAI} testID="ai-btn">
              <Ionicons name="sparkles" size={18} color="#fff" /><Text style={s.aiBtnText}>{T('generate_ai_recipe')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={s.mOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mKAV}>
            <View style={s.mContent}>
              <View style={s.mHead}>
                <Text style={s.mTitle}>{T('edit_recipe')}</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {(editFocus === 'all' || editFocus === 'name') ? (<>
                  <Text style={s.mLabel}>{T('edit_name')}</Text>
                  <TextInput style={s.mInput} value={editName} onChangeText={setEditName} />
                </>) : null}

                {(editFocus === 'all' || editFocus === 'caption') ? (<>
                  <Text style={s.mLabel}>{T('description')}</Text>
                  <TextInput style={[s.mInput, s.mArea]} value={editCaption} onChangeText={setEditCaption} multiline textAlignVertical="top" />
                </>) : null}

                {(editFocus === 'all' || editFocus === 'ingredients') ? (<>
                  <Text style={s.mLabel}>🍅 {T('ingredients')}</Text>
                  <TextInput style={[s.mInput, s.mAreaBig]} value={editIngredients} onChangeText={setEditIngredients}
                    multiline textAlignVertical="top" placeholder={T('ingredients_placeholder')} placeholderTextColor="#666" />
                </>) : null}

                {(editFocus === 'all' || editFocus === 'notes') ? (<>
                  <Text style={s.mLabel}>{T('personal_notes')}</Text>
                  <TextInput style={[s.mInput, s.mArea]} value={editNotes} onChangeText={setEditNotes} multiline textAlignVertical="top" />
                </>) : null}

                {editFocus === 'all' ? (<>
                  <Text style={s.mLabel}>{T('difficulty')}</Text>
                  <View style={s.diffRow}>
                    {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                      <TouchableOpacity key={d} style={[s.diffChip, editDifficulty === d && { borderColor: difficultyColor(d), backgroundColor: difficultyColor(d) + '22' }]} onPress={() => setEditDifficulty(editDifficulty === d ? '' : d)}>
                        <Text style={[s.diffText, editDifficulty === d && { color: difficultyColor(d), fontWeight: '700' }]}>{difficultyLabel(d)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={s.timeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.mLabel}>{T('prep_time')} ({T('minutes_short')})</Text>
                      <TextInput style={s.mInput} value={editPrep} onChangeText={setEditPrep} keyboardType="number-pad" placeholder="0" placeholderTextColor="#666" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.mLabel}>{T('cook_time')} ({T('minutes_short')})</Text>
                      <TextInput style={s.mInput} value={editCook} onChangeText={setEditCook} keyboardType="number-pad" placeholder="0" placeholderTextColor="#666" />
                    </View>
                  </View>

                  <Text style={s.mLabel}>{T('tags')}</Text>
                  <View style={s.tagEditRow}>
                    <TextInput style={[s.mInput, { flex: 1 }]} value={newTagInput} onChangeText={setNewTagInput}
                      placeholder={T('add_tag')} placeholderTextColor="#666" onSubmitEditing={addTag} returnKeyType="done" />
                    <TouchableOpacity style={s.addTagBtn} onPress={addTag}>
                      <Ionicons name="add" size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  {editTags.length > 0 ? (
                    <View style={s.tagRow}>
                      {editTags.map((t) => (
                        <TouchableOpacity key={t} style={s.tagEdit} onPress={() => removeTag(t)}>
                          <Text style={s.tagText}>#{t}</Text>
                          <Ionicons name="close" size={14} color="#FF6B35" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </>) : null}

                {(editFocus === 'all' || editFocus === 'transcription') ? (<>
                  <Text style={s.mLabel}>👨‍🍳 {T('procedure')}</Text>
                  <TextInput style={[s.mInput, s.mAreaBig]} value={editTranscription} onChangeText={setEditTranscription}
                    multiline textAlignVertical="top" placeholder={T('ai_recipe_text_placeholder')} placeholderTextColor="#666" />
                </>) : null}

                <TouchableOpacity style={[s.mSave, saving && s.disabled]} onPress={saveEdit} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark" size={22} color="#fff" /><Text style={s.mSaveText}>{T('save')}</Text></>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  hBtn: { padding: 8 }, hTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#fff', marginHorizontal: 4 },
  scroll: { flex: 1 }, scrollContent: { paddingBottom: 40 },
  coverImg: { width: '100%', height: 220, backgroundColor: '#1a1a1a' },
  coverBadge: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, gap: 4 },
  coverBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  noCover: { height: 160, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  noCoverText: { color: '#FF6B35', fontSize: 15, fontWeight: '600', marginTop: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 14 },
  metaText: { fontSize: 14, color: '#888' }, metaDate: { fontSize: 12, color: '#666', marginLeft: 'auto' },
  name: { fontSize: 24, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, marginTop: 6, marginBottom: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 8, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a' },
  chipText: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, marginBottom: 10 },
  tag: { backgroundColor: '#FF6B3520', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  tagText: { color: '#FF6B35', fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 14 },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 12, gap: 6 },
  actText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a' },
  cardH: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardT: { fontSize: 14, fontWeight: '600', color: '#aaa', flex: 1 },
  cardBody: { fontSize: 14, color: '#ddd', lineHeight: 22 },
  empty: { fontSize: 14, color: '#666', fontStyle: 'italic' },
  editIcon: { padding: 4, backgroundColor: '#FF6B3520', borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { fontSize: 14, color: '#FF6B35' },
  err: { fontSize: 14, color: '#FF4444', marginBottom: 8 },
  retryBtn: { backgroundColor: '#333', borderRadius: 8, padding: 10, alignItems: 'center' },
  retryText: { color: '#FF6B35', fontWeight: '600' },
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6C3DC1', borderRadius: 10, padding: 12, gap: 6 },
  aiBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  mOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  mKAV: { flex: 1, justifyContent: 'flex-end' },
  mContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', padding: 20 },
  mHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  mTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  mLabel: { fontSize: 13, fontWeight: '600', color: '#aaa', marginBottom: 6, marginTop: 12 },
  mInput: { backgroundColor: '#252525', borderRadius: 12, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#333' },
  mArea: { minHeight: 80, paddingTop: 12 },
  mAreaBig: { minHeight: 180, paddingTop: 12 },
  diffRow: { flexDirection: 'row', gap: 8 },
  diffChip: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#333', backgroundColor: '#252525' },
  diffText: { color: '#ccc', fontSize: 14 },
  timeRow: { flexDirection: 'row', gap: 10 },
  tagEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addTagBtn: { backgroundColor: '#FF6B35', borderRadius: 10, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  tagEdit: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF6B3520', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  mSave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#28a745', borderRadius: 12, padding: 16, marginTop: 20, marginBottom: 20, gap: 8 },
  mSaveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
