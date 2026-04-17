import { authFetch } from '../../src/utils/api';
import { useLang } from '../../src/context/LangContext';
import React, { useState, useEffect } from 'react';
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

interface Recipe {
  id: string; name: string; source_url: string; platform: string;
  caption: string; thumbnail_url: string; notes: string;
  transcription: string; transcription_status: string; created_at: string;
}

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
  const [editName, setEditName] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [pollingTimer, setPollingTimer] = useState<ReturnType<typeof setInterval> | null>(null);

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

  const downloadVideo = async () => {
    if (!recipe) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const res = await authFetch(`/api/recipes/${recipe.id}/download-video`, { method: 'POST' });
      const data = await res.json();

      if (data.success && data.video_url) {
        // Direct download available!
        if (Platform.OS === 'web') {
          window.open(data.video_url, '_blank');
          Alert.alert(T('download_started'), 'Il video si sta scaricando nel browser');
        } else {
          // Download to device
          const fileUri = FileSystem.documentDirectory + `${recipe.name.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
          const callback = (dp: FileSystem.DownloadProgressData) => {
            const progress = dp.totalBytesWritten / dp.totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
          };
          const downloadResumable = FileSystem.createDownloadResumable(data.video_url, fileUri, {}, callback);
          const result = await downloadResumable.downloadAsync();
          if (result && result.uri) {
            setDownloadProgress(100);
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(result.uri, { mimeType: 'video/mp4', dialogTitle: T('downloaded') });
            } else {
              Alert.alert(T('downloaded'), 'Video salvato con successo');
            }
          }
        }
      } else if (data.fallback_links && data.fallback_links.length > 0) {
        // Fallback: open external service
        Alert.alert(
          T('download_alt'),
          T('use_external'),
          data.fallback_links.map((l: any) => ({
            text: l.name, onPress: () => Linking.openURL(l.url)
          })).concat([{ text: T('cancel'), style: 'cancel' as const }])
        );
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

  const openEditModal = () => {
    if (!recipe) return;
    setEditName(recipe.name); setEditCaption(recipe.caption); setEditNotes(recipe.notes);
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!recipe || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/recipes/${recipe.id}`, {
        method: 'PUT', body: JSON.stringify({ name: editName.trim(), caption: editCaption.trim(), notes: editNotes.trim() }),
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

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.hBtn} onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={s.hTitle} numberOfLines={1}>{recipe.name}</Text>
        <TouchableOpacity style={s.hBtn} onPress={openEditModal} testID="edit-btn">
          <Ionicons name="pencil" size={20} color="#FF6B35" />
        </TouchableOpacity>
        <TouchableOpacity style={s.hBtn} onPress={deleteRecipe} testID="delete-btn">
          <Ionicons name="trash-outline" size={20} color="#FF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
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
        <Text style={s.name}>{recipe.name}</Text>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity style={[s.actBtn, { backgroundColor: '#4CAF50' }, downloading && s.disabled]}
            onPress={downloadVideo} disabled={downloading} testID="download-btn">
            {downloading ? (
              <><ActivityIndicator size="small" color="#fff" /><Text style={s.actText}>{downloadProgress > 0 ? `${downloadProgress}%` : T('downloading')}</Text></>
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

        {/* Caption */}
        {recipe.caption ? (
          <View style={s.card}>
            <View style={s.cardH}><Ionicons name="document-text-outline" size={16} color="#FF6B35" /><Text style={s.cardT}>{T('description')}</Text></View>
            <Text style={s.cardBody}>{recipe.caption}</Text>
          </View>
        ) : null}

        {/* Notes */}
        <View style={s.card}>
          <View style={s.cardH}><Ionicons name="create-outline" size={16} color="#FF6B35" /><Text style={s.cardT}>{T('personal_notes')}</Text></View>
          {recipe.notes ? <Text style={s.cardBody}>{recipe.notes}</Text> : <Text style={s.empty}>{T('tap_pencil_to_add')}</Text>}
        </View>

        {/* AI */}
        <View style={s.card}>
          <View style={s.cardH}><Ionicons name="sparkles" size={16} color="#FFD700" /><Text style={s.cardT}>{T('ai_recipe')}</Text></View>
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
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={s.mOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.mKAV}>
            <View style={s.mContent}>
              <View style={s.mHead}><Text style={s.mTitle}>{T('edit')}</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity></View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={s.mLabel}>{T('edit_name')}</Text>
                <TextInput style={s.mInput} value={editName} onChangeText={setEditName} />
                <Text style={s.mLabel}>{T('description')}</Text>
                <TextInput style={[s.mInput, s.mArea]} value={editCaption} onChangeText={setEditCaption} multiline textAlignVertical="top" />
                <Text style={s.mLabel}>{T('personal_notes')}</Text>
                <TextInput style={[s.mInput, s.mArea]} value={editNotes} onChangeText={setEditNotes} multiline textAlignVertical="top" />
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  hBtn: { padding: 8 }, hTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#fff', marginHorizontal: 8 },
  scroll: { flex: 1 }, scrollContent: { paddingBottom: 40 },
  coverImg: { width: '100%', height: 220, backgroundColor: '#1a1a1a' },
  coverBadge: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, gap: 4 },
  coverBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  noCover: { height: 160, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  noCoverText: { color: '#FF6B35', fontSize: 15, fontWeight: '600', marginTop: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 14 },
  metaText: { fontSize: 14, color: '#888' }, metaDate: { fontSize: 12, color: '#666', marginLeft: 'auto' },
  name: { fontSize: 24, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, marginTop: 6, marginBottom: 14 },
  actions: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 14 },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 12, gap: 6 },
  actText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a' },
  cardH: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardT: { fontSize: 14, fontWeight: '600', color: '#aaa' },
  cardBody: { fontSize: 14, color: '#ddd', lineHeight: 22 },
  empty: { fontSize: 14, color: '#666', fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { fontSize: 14, color: '#FF6B35' },
  err: { fontSize: 14, color: '#FF4444', marginBottom: 8 },
  retryBtn: { backgroundColor: '#333', borderRadius: 8, padding: 10, alignItems: 'center' },
  retryText: { color: '#FF6B35', fontWeight: '600' },
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6C3DC1', borderRadius: 10, padding: 12, gap: 6 },
  aiBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  mOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  mKAV: { flex: 1, justifyContent: 'flex-end' },
  mContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', padding: 20 },
  mHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  mTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  mLabel: { fontSize: 13, fontWeight: '600', color: '#aaa', marginBottom: 6, marginTop: 12 },
  mInput: { backgroundColor: '#252525', borderRadius: 12, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#333' },
  mArea: { minHeight: 80, paddingTop: 12 },
  mSave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#28a745', borderRadius: 12, padding: 16, marginTop: 20, marginBottom: 20, gap: 8 },
  mSaveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
