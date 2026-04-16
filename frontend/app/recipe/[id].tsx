import { authFetch } from '../../src/utils/api';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, TextInput, KeyboardAvoidingView, Platform, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

interface Recipe {
  id: string; name: string; source_url: string; platform: string;
  caption: string; thumbnail_url: string; notes: string;
  transcription: string; transcription_status: string; created_at: string;
}

interface DownloadLink {
  name: string; url: string; icon: string;
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcribing, setTranscribing] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadLinks, setDownloadLinks] = useState<DownloadLink[]>([]);
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
      if (res.ok) { setRecipe(await res.json()); }
      else { router.back(); }
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

  const openDownloadOptions = async () => {
    if (!recipe) return;
    try {
      const res = await authFetch(`/api/recipes/${recipe.id}/download-video`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setDownloadLinks(data.download_links || []);
        setShowDownloadModal(true);
      }
    } catch (e) {
      Linking.openURL(recipe.source_url);
    }
  };

  const pickCoverImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permesso necessario', 'Serve accesso alla galleria.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true, aspect: [16, 9], quality: 0.6, base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        setUploadingThumb(true);
        const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const res = await authFetch(`/api/recipes/${recipe!.id}/generate-thumbnail`, {
          method: 'POST', body: JSON.stringify({ image_base64: b64 }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) { setRecipe({ ...recipe!, thumbnail_url: data.thumbnail_url }); }
        }
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
    Alert.alert('Elimina', 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: async () => {
        await authFetch(`/api/recipes/${id}`, { method: 'DELETE' }); router.back();
      }},
    ]);
  };

  if (loading || !recipe) {
    return <SafeAreaView style={s.container}><View style={s.center}><ActivityIndicator size="large" color="#FF6B35" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
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
        {/* Cover Image / Thumbnail */}
        <TouchableOpacity onPress={pickCoverImage} activeOpacity={0.8} testID="cover-image-btn">
          {recipe.thumbnail_url ? (
            <View style={s.coverWrap}>
              <Image source={{ uri: recipe.thumbnail_url }} style={s.coverImage} resizeMode="cover" />
              <View style={s.coverOverlay}>
                <Ionicons name="camera" size={16} color="#fff" />
                <Text style={s.coverOverlayText}>Cambia copertina</Text>
              </View>
            </View>
          ) : (
            <View style={s.noCover}>
              {uploadingThumb ? <ActivityIndicator size="large" color="#FF6B35" /> : (
                <>
                  <Ionicons name="image" size={48} color="#FF6B35" />
                  <Text style={s.noCoverTitle}>Aggiungi copertina</Text>
                  <Text style={s.noCoverSub}>Fai screenshot del video e caricalo qui</Text>
                </>
              )}
            </View>
          )}
        </TouchableOpacity>

        {/* Platform + Date */}
        <View style={s.metaRow}>
          <Ionicons name={recipe.platform === 'instagram' ? 'logo-instagram' : 'logo-facebook'} size={18}
            color={recipe.platform === 'instagram' ? '#E4405F' : '#1877F2'} />
          <Text style={s.metaPlatform}>{recipe.platform === 'instagram' ? 'Instagram' : 'Facebook'}</Text>
          <Text style={s.metaDate}>
            {new Date(recipe.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>

        <Text style={s.recipeName}>{recipe.name}</Text>

        {/* Action Buttons */}
        <View style={s.actions}>
          <TouchableOpacity style={[s.actBtn, { backgroundColor: '#4CAF50' }]} onPress={openDownloadOptions} testID="download-btn">
            <Ionicons name="download" size={20} color="#fff" />
            <Text style={s.actText}>Scarica Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actBtn, { backgroundColor: '#FF6B35' }]} onPress={() => Linking.openURL(recipe.source_url)} testID="open-btn">
            <Ionicons name="play-circle" size={20} color="#fff" />
            <Text style={s.actText}>Guarda</Text>
          </TouchableOpacity>
        </View>

        {/* Caption */}
        {recipe.caption ? (
          <View style={s.card}>
            <View style={s.cardH}><Ionicons name="document-text-outline" size={16} color="#FF6B35" /><Text style={s.cardTitle}>Descrizione</Text></View>
            <Text style={s.cardText}>{recipe.caption}</Text>
          </View>
        ) : null}

        {/* Notes */}
        <View style={s.card}>
          <View style={s.cardH}><Ionicons name="create-outline" size={16} color="#FF6B35" /><Text style={s.cardTitle}>Note Personali</Text></View>
          {recipe.notes ? <Text style={s.cardText}>{recipe.notes}</Text> : <Text style={s.emptyText}>Tocca ✏️ per aggiungere note</Text>}
        </View>

        {/* AI Recipe */}
        <View style={s.card}>
          <View style={s.cardH}><Ionicons name="sparkles" size={16} color="#FFD700" /><Text style={s.cardTitle}>Ricetta AI</Text></View>
          {recipe.transcription_status === 'done' ? <Text style={s.cardText}>{recipe.transcription}</Text>
          : recipe.transcription_status === 'pending' || transcribing ? (
            <View style={s.loadRow}><ActivityIndicator size="small" color="#FF6B35" /><Text style={s.loadText}>Generazione...</Text></View>
          ) : recipe.transcription_status === 'error' ? (
            <View><Text style={s.errText}>{recipe.transcription}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={generateRecipeAI}><Text style={s.retryText}>Riprova</Text></TouchableOpacity></View>
          ) : (
            <TouchableOpacity style={s.aiBtn} onPress={generateRecipeAI} testID="ai-btn">
              <Ionicons name="sparkles" size={18} color="#fff" /><Text style={s.aiBtnText}>Genera Ricetta con AI</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Download Modal */}
      <Modal visible={showDownloadModal} transparent animationType="slide">
        <View style={s.dlOverlay}>
          <View style={s.dlContent}>
            <View style={s.dlHeader}>
              <Text style={s.dlTitle}>Scarica Video</Text>
              <TouchableOpacity onPress={() => setShowDownloadModal(false)}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity>
            </View>
            <Text style={s.dlSubtitle}>Scegli un servizio per scaricare il video:</Text>
            {downloadLinks.map((link, i) => (
              <TouchableOpacity key={i} style={s.dlItem} onPress={() => { setShowDownloadModal(false); Linking.openURL(link.url); }}
                testID={`download-link-${i}`}>
                <View style={s.dlIcon}><Ionicons name={link.icon as any} size={22} color="#FF6B35" /></View>
                <Text style={s.dlName}>{link.name}</Text>
                <Ionicons name="chevron-forward" size={18} color="#666" />
              </TouchableOpacity>
            ))}
            <Text style={s.dlHint}>Apri il servizio, incolla il link e scarica il video sul tuo dispositivo</Text>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={s.edOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.edKAV}>
            <View style={s.edContent}>
              <View style={s.edHeader}><Text style={s.edTitle}>Modifica</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity></View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={s.edLabel}>Nome *</Text>
                <TextInput style={s.edInput} value={editName} onChangeText={setEditName} testID="edit-name" />
                <Text style={s.edLabel}>Descrizione</Text>
                <TextInput style={[s.edInput, s.edArea]} value={editCaption} onChangeText={setEditCaption} multiline textAlignVertical="top" />
                <Text style={s.edLabel}>Note</Text>
                <TextInput style={[s.edInput, s.edArea]} value={editNotes} onChangeText={setEditNotes} multiline textAlignVertical="top" />
                <TouchableOpacity style={[s.edSave, saving && s.disabled]} onPress={saveEdit} disabled={saving} testID="save-edit">
                  {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark" size={22} color="#fff" /><Text style={s.edSaveText}>Salva</Text></>}
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
  // Cover
  coverWrap: { position: 'relative' },
  coverImage: { width: '100%', height: 240, backgroundColor: '#1a1a1a' },
  coverOverlay: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, gap: 6 },
  coverOverlayText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  noCover: { height: 180, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  noCoverTitle: { color: '#FF6B35', fontSize: 16, fontWeight: '600', marginTop: 12 },
  noCoverSub: { color: '#666', fontSize: 13, marginTop: 4 },
  // Meta
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 16 },
  metaPlatform: { fontSize: 14, color: '#888', fontWeight: '500' },
  metaDate: { fontSize: 12, color: '#666', marginLeft: 'auto' },
  recipeName: { fontSize: 24, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, marginTop: 8, marginBottom: 14 },
  // Actions
  actions: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14, gap: 8 },
  actText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  // Cards
  card: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginHorizontal: 20, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  cardH: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#aaa' },
  cardText: { fontSize: 14, color: '#ddd', lineHeight: 22 },
  emptyText: { fontSize: 14, color: '#666', fontStyle: 'italic' },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadText: { fontSize: 14, color: '#FF6B35' },
  errText: { fontSize: 14, color: '#FF4444', marginBottom: 10 },
  retryBtn: { backgroundColor: '#333', borderRadius: 8, padding: 10, alignItems: 'center' },
  retryText: { color: '#FF6B35', fontWeight: '600' },
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6C3DC1', borderRadius: 12, padding: 14, gap: 8 },
  aiBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  // Download Modal
  dlOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  dlContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  dlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dlTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  dlSubtitle: { fontSize: 14, color: '#888', marginBottom: 16 },
  dlItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#252525', borderRadius: 12, padding: 16, marginBottom: 10, gap: 14 },
  dlIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#FF6B3515', justifyContent: 'center', alignItems: 'center' },
  dlName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#fff' },
  dlHint: { fontSize: 12, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 10 },
  // Edit Modal
  edOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  edKAV: { flex: 1, justifyContent: 'flex-end' },
  edContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', padding: 20 },
  edHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  edTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  edLabel: { fontSize: 13, fontWeight: '600', color: '#aaa', marginBottom: 6, marginTop: 12 },
  edInput: { backgroundColor: '#252525', borderRadius: 12, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#333' },
  edArea: { minHeight: 80, paddingTop: 12 },
  edSave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#28a745', borderRadius: 12, padding: 16, marginTop: 20, marginBottom: 20, gap: 8 },
  edSaveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
