import { authFetch } from '../../src/utils/api';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, TextInput, KeyboardAvoidingView, Platform, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Recipe {
  id: string; name: string; folder_id: string | null; subfolder_id: string | null;
  source_url: string; platform: string; caption: string; video_url: string;
  thumbnail_url: string; notes: string; transcription: string;
  transcription_status: string; created_at: string;
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcribing, setTranscribing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatingThumb, setGeneratingThumb] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [pollingTimer, setPollingTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchRecipe();
    return () => { if (pollingTimer) clearInterval(pollingTimer); };
  }, [id]);

  const fetchRecipe = async () => {
    try {
      const res = await authFetch(`/api/recipes/${id}`);
      if (res.ok) {
        setRecipe(await res.json());
      } else {
        Alert.alert('Errore', 'Ricetta non trovata');
        router.back();
      }
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
      } catch (e) { /* ignore */ }
    }, 3000);
    setPollingTimer(timer);
  };

  const generateRecipeAI = async () => {
    if (!recipe) return;
    setTranscribing(true);
    try {
      const res = await authFetch(`/api/recipes/${recipe.id}/generate-recipe`, { method: 'POST' });
      if (res.ok) {
        Alert.alert('Ricetta AI', 'Generazione in corso...');
        startPolling();
      } else { setTranscribing(false); }
    } catch (e) { setTranscribing(false); }
  };

  const downloadVideo = async () => {
    if (!recipe) return;
    setDownloading(true);
    try {
      // First ask backend to prepare the video
      const res = await authFetch(`/api/recipes/${recipe.id}/download-video`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success && data.download_path) {
        if (Platform.OS === 'web') {
          // On web, open the download link
          window.open(`${API_URL}${data.download_path}`, '_blank');
          Alert.alert('Download', 'Il video si sta scaricando...');
        } else {
          // On mobile, download to device
          const fileUri = FileSystem.documentDirectory + `${recipe.id}.mp4`;
          const download = await FileSystem.downloadAsync(`${API_URL}${data.download_path}`, fileUri);
          if (download.status === 200) {
            // Share/save the file
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(download.uri, { mimeType: 'video/mp4', dialogTitle: 'Salva video' });
            } else {
              Alert.alert('Scaricato!', 'Video salvato sul dispositivo');
            }
          }
        }
      } else {
        // Fallback: open original link
        Alert.alert(
          'Download non disponibile',
          'Il video richiede autenticazione. Vuoi aprire il link originale?',
          [
            { text: 'Annulla', style: 'cancel' },
            { text: 'Apri', onPress: () => Linking.openURL(recipe.source_url) },
          ]
        );
      }
    } catch (e) {
      console.log('Download error:', e);
      Linking.openURL(recipe.source_url);
    }
    finally { setDownloading(false); }
  };

  const generateThumbnail = async () => {
    if (!recipe) return;
    setGeneratingThumb(true);
    try {
      const res = await authFetch(`/api/recipes/${recipe.id}/generate-thumbnail`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setRecipe({ ...recipe, thumbnail_url: data.thumbnail_url });
        Alert.alert('Fatto!', 'Screenshot del video generato!');
      } else {
        Alert.alert('Errore', data.error || 'Impossibile generare lo screenshot');
      }
    } catch (e) {
      Alert.alert('Errore', 'Errore di connessione');
    }
    finally { setGeneratingThumb(false); }
  };

  const openEditModal = () => {
    if (!recipe) return;
    setEditName(recipe.name);
    setEditCaption(recipe.caption);
    setEditNotes(recipe.notes);
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!recipe || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/recipes/${recipe.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName.trim(), caption: editCaption.trim(), notes: editNotes.trim() }),
      });
      if (res.ok) { setRecipe(await res.json()); setShowEditModal(false); }
    } catch (e) { Alert.alert('Errore', 'Errore di connessione'); }
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
    return <SafeAreaView style={st.container}><View style={st.center}><ActivityIndicator size="large" color="#FF6B35" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity style={st.headerBtn} onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>{recipe.name}</Text>
        <TouchableOpacity style={st.headerBtn} onPress={openEditModal} testID="edit-btn">
          <Ionicons name="pencil" size={20} color="#FF6B35" />
        </TouchableOpacity>
        <TouchableOpacity style={st.headerBtn} onPress={deleteRecipe} testID="delete-recipe-btn">
          <Ionicons name="trash-outline" size={20} color="#FF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent}>
        {/* Thumbnail / Screenshot */}
        <View style={st.thumbSection}>
          {recipe.thumbnail_url ? (
            <Image source={{ uri: recipe.thumbnail_url }} style={st.thumbImage} resizeMode="cover" />
          ) : (
            <View style={st.thumbPlaceholder}>
              <Ionicons name="image-outline" size={50} color="#555" />
              <Text style={st.thumbPlaceholderText}>Nessuno screenshot</Text>
            </View>
          )}
          <TouchableOpacity
            style={[st.thumbBtn, generatingThumb && st.disabled]}
            onPress={generateThumbnail}
            disabled={generatingThumb}
            testID="generate-thumb-btn"
          >
            {generatingThumb ? <ActivityIndicator size="small" color="#fff" /> : (
              <><Ionicons name="camera" size={16} color="#fff" /><Text style={st.thumbBtnText}>{recipe.thumbnail_url ? 'Rigenera' : 'Genera Screenshot'}</Text></>
            )}
          </TouchableOpacity>
        </View>

        {/* Platform + Date */}
        <View style={st.platformRow}>
          <Ionicons name={recipe.platform === 'instagram' ? 'logo-instagram' : 'logo-facebook'} size={20}
            color={recipe.platform === 'instagram' ? '#E4405F' : '#1877F2'} />
          <Text style={st.platformText}>{recipe.platform === 'instagram' ? 'Instagram' : 'Facebook'}</Text>
          <Text style={st.dateText}>
            {new Date(recipe.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>

        <Text style={st.recipeName}>{recipe.name}</Text>

        {/* Action Buttons */}
        <View style={st.actionRow}>
          <TouchableOpacity style={[st.actionBtn, st.downloadBtn, downloading && st.disabled]}
            onPress={downloadVideo} disabled={downloading} testID="download-video-btn">
            {downloading ? <ActivityIndicator size="small" color="#fff" /> : (
              <><Ionicons name="download" size={18} color="#fff" /><Text style={st.actionBtnText}>Scarica Video</Text></>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={st.actionBtn} onPress={() => Linking.openURL(recipe.source_url)} testID="open-link-btn">
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={st.actionBtnText}>Apri Link</Text>
          </TouchableOpacity>
        </View>

        {/* Caption */}
        {recipe.caption ? (
          <View style={st.sectionCard}>
            <View style={st.sectionHeader}>
              <Ionicons name="document-text-outline" size={18} color="#FF6B35" />
              <Text style={st.sectionTitle}>Descrizione</Text>
            </View>
            <Text style={st.sectionText}>{recipe.caption}</Text>
          </View>
        ) : null}

        {/* Notes */}
        <View style={st.sectionCard}>
          <View style={st.sectionHeader}>
            <Ionicons name="create-outline" size={18} color="#FF6B35" />
            <Text style={st.sectionTitle}>Note Personali</Text>
          </View>
          {recipe.notes ? (
            <Text style={st.sectionText}>{recipe.notes}</Text>
          ) : (
            <Text style={st.emptyNote}>Tocca la matita per aggiungere note.</Text>
          )}
        </View>

        {/* AI Recipe */}
        <View style={st.sectionCard}>
          <View style={st.sectionHeader}>
            <Ionicons name="sparkles" size={18} color="#FFD700" />
            <Text style={st.sectionTitle}>Ricetta AI</Text>
          </View>
          {recipe.transcription_status === 'done' ? (
            <Text style={st.sectionText}>{recipe.transcription}</Text>
          ) : recipe.transcription_status === 'pending' || transcribing ? (
            <View style={st.loadingRow}>
              <ActivityIndicator size="small" color="#FF6B35" />
              <Text style={st.loadingText}>Generazione in corso...</Text>
            </View>
          ) : recipe.transcription_status === 'error' ? (
            <View>
              <Text style={st.errorText}>{recipe.transcription || 'Errore'}</Text>
              <TouchableOpacity style={st.retryBtn} onPress={generateRecipeAI}>
                <Text style={st.retryBtnText}>Riprova</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={st.aiBtn} onPress={generateRecipeAI} testID="transcribe-btn">
              <Ionicons name="sparkles" size={20} color="#fff" />
              <Text style={st.aiBtnText}>Genera Ricetta con AI</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.modalKAV}>
            <View style={st.modalContent}>
              <View style={st.modalHeader}>
                <Text style={st.modalTitle}>Modifica Ricetta</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={st.modalLabel}>Nome *</Text>
                <TextInput style={st.modalInput} value={editName} onChangeText={setEditName} testID="edit-name-input" />
                <Text style={st.modalLabel}>Descrizione</Text>
                <TextInput style={[st.modalInput, st.modalTextArea]} value={editCaption} onChangeText={setEditCaption}
                  multiline numberOfLines={4} textAlignVertical="top" />
                <Text style={st.modalLabel}>Note</Text>
                <TextInput style={[st.modalInput, st.modalTextArea]} value={editNotes} onChangeText={setEditNotes}
                  multiline numberOfLines={4} textAlignVertical="top" />
                <TouchableOpacity style={[st.modalSaveBtn, saving && st.disabled]} onPress={saveEdit} disabled={saving} testID="save-edit-btn">
                  {saving ? <ActivityIndicator color="#fff" /> : (
                    <><Ionicons name="checkmark" size={22} color="#fff" /><Text style={st.modalSaveBtnText}>Salva</Text></>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  headerBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#fff', marginHorizontal: 8 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  // Thumbnail
  thumbSection: { position: 'relative' },
  thumbImage: { width: '100%', height: 250, backgroundColor: '#1a1a1a' },
  thumbPlaceholder: { width: '100%', height: 200, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  thumbPlaceholderText: { color: '#555', fontSize: 14, marginTop: 8 },
  thumbBtn: {
    position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, gap: 6,
  },
  thumbBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  // Platform
  platformRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 16 },
  platformText: { fontSize: 14, color: '#888', fontWeight: '500' },
  dateText: { fontSize: 12, color: '#666', marginLeft: 'auto' },
  recipeName: { fontSize: 26, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, marginTop: 8, marginBottom: 16 },
  // Actions
  actionRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6B35', borderRadius: 10, paddingVertical: 12, gap: 6 },
  downloadBtn: { backgroundColor: '#4CAF50' },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  // Sections
  sectionCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginHorizontal: 20, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#aaa' },
  sectionText: { fontSize: 14, color: '#ddd', lineHeight: 22 },
  emptyNote: { fontSize: 14, color: '#666', fontStyle: 'italic' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { fontSize: 14, color: '#FF6B35' },
  errorText: { fontSize: 14, color: '#FF4444', marginBottom: 10 },
  retryBtn: { backgroundColor: '#333', borderRadius: 8, padding: 10, alignItems: 'center' },
  retryBtnText: { color: '#FF6B35', fontWeight: '600' },
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6C3DC1', borderRadius: 10, padding: 14, gap: 8 },
  aiBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalKAV: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#aaa', marginBottom: 6, marginTop: 12 },
  modalInput: { backgroundColor: '#252525', borderRadius: 12, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#333' },
  modalTextArea: { minHeight: 80, paddingTop: 12 },
  modalSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#28a745', borderRadius: 12, padding: 16, marginTop: 20, marginBottom: 20, gap: 8 },
  modalSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
