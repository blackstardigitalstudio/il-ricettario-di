import { authFetch } from '../utils/api';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, TextInput, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';



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
        const data = await res.json();
        setRecipe(data);
        if (data.transcription_status === 'pending') startPolling();
      } else {
        Alert.alert('Errore', 'Ricetta non trovata');
        router.back();
      }
    } catch (e) { console.error(e); }
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
          if (data.transcription_status !== 'pending') {
            clearInterval(timer);
            setTranscribing(false);
          }
        }
      } catch (e) { console.error(e); }
    }, 3000);
    setPollingTimer(timer);
  };

  const transcribeRecipe = async () => {
    if (!recipe) return;
    setTranscribing(true);
    try {
      const res = await authFetch(`/api/recipes/${recipe.id}/generate-recipe`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Ricetta AI', 'Generazione avviata! Attendi qualche secondo...');
        startPolling();
      } else {
        Alert.alert('Errore', data.detail || 'Errore nella generazione');
        setTranscribing(false);
      }
    } catch (e) {
      Alert.alert('Errore', 'Errore di connessione');
      setTranscribing(false);
    }
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
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), caption: editCaption.trim(), notes: editNotes.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRecipe(updated);
        setShowEditModal(false);
      }
    } catch (e) { Alert.alert('Errore', 'Errore di connessione'); }
    finally { setSaving(false); }
  };

  const deleteRecipe = () => {
    Alert.alert('Elimina Ricetta', 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina', style: 'destructive', onPress: async () => {
          try { await authFetch(`/api/recipes/${id}`, { method: 'DELETE' }); router.back(); }
          catch (e) { console.error(e); }
        },
      },
    ]);
  };

  if (loading || !recipe) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.center}><ActivityIndicator size="large" color="#FF6B35" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity style={st.headerBtn} onPress={() => router.back()} testID="back-btn">
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>{recipe.name}</Text>
        <TouchableOpacity style={st.headerBtn} onPress={openEditModal} testID="edit-btn">
          <Ionicons name="pencil" size={22} color="#FF6B35" />
        </TouchableOpacity>
        <TouchableOpacity style={st.headerBtn} onPress={deleteRecipe} testID="delete-recipe-btn">
          <Ionicons name="trash-outline" size={22} color="#FF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent}>
        {/* Platform Badge */}
        <View style={st.platformRow}>
          <Ionicons name={recipe.platform === 'instagram' ? 'logo-instagram' : 'logo-facebook'} size={20}
            color={recipe.platform === 'instagram' ? '#E4405F' : '#1877F2'} />
          <Text style={st.platformText}>{recipe.platform === 'instagram' ? 'Instagram' : 'Facebook'}</Text>
          <Text style={st.dateText}>
            {new Date(recipe.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>

        {/* Name */}
        <Text style={st.recipeName}>{recipe.name}</Text>

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
            <Text style={st.emptyNote}>Nessuna nota. Tocca la matita per aggiungere.</Text>
          )}
        </View>

        {/* Transcription / AI Recipe */}
        <View style={st.sectionCard}>
          <View style={st.sectionHeader}>
            <Ionicons name="sparkles" size={18} color="#FFD700" />
            <Text style={st.sectionTitle}>Ricetta AI</Text>
          </View>
          {recipe.transcription_status === 'done' ? (
            <Text style={st.sectionText}>{recipe.transcription}</Text>
          ) : recipe.transcription_status === 'pending' || transcribing ? (
            <View style={st.transcribingRow}>
              <ActivityIndicator size="small" color="#FF6B35" />
              <Text style={st.transcribingText}>Generazione in corso...</Text>
            </View>
          ) : recipe.transcription_status === 'error' ? (
            <View>
              <Text style={st.errorText}>{recipe.transcription || 'Errore'}</Text>
              <TouchableOpacity style={st.retryBtn} onPress={transcribeRecipe}>
                <Text style={st.retryBtnText}>Riprova</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={st.transcribeBtn} onPress={transcribeRecipe} testID="transcribe-btn">
              <Ionicons name="sparkles" size={20} color="#fff" />
              <Text style={st.transcribeBtnText}>Genera Ricetta con AI</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Open Original */}
        <TouchableOpacity style={st.openLinkBtn} onPress={() => Linking.openURL(recipe.source_url)} testID="open-link-btn">
          <Ionicons name="open-outline" size={20} color="#fff" />
          <Text style={st.openLinkText}>Apri Link Originale</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.modalKAV}>
            <View style={st.modalContent}>
              <View style={st.modalHeader}>
                <Text style={st.modalTitle}>Modifica Ricetta</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)} testID="close-edit-modal">
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView style={st.modalScroll} keyboardShouldPersistTaps="handled">
                <Text style={st.modalLabel}>Nome *</Text>
                <TextInput style={st.modalInput} value={editName} onChangeText={setEditName} testID="edit-name-input" />

                <Text style={st.modalLabel}>Descrizione</Text>
                <TextInput style={[st.modalInput, st.modalTextArea]} value={editCaption} onChangeText={setEditCaption}
                  multiline numberOfLines={4} textAlignVertical="top" testID="edit-caption-input" />

                <Text style={st.modalLabel}>Note Personali</Text>
                <TextInput style={[st.modalInput, st.modalTextArea]} value={editNotes} onChangeText={setEditNotes}
                  multiline numberOfLines={4} textAlignVertical="top" testID="edit-notes-input" />

                <TouchableOpacity style={[st.modalSaveBtn, saving && st.disabled]} onPress={saveEdit} disabled={saving} testID="save-edit-btn">
                  {saving ? <ActivityIndicator color="#fff" /> : (
                    <><Ionicons name="checkmark" size={22} color="#fff" /><Text style={st.modalSaveBtnText}>Salva Modifiche</Text></>
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
  scrollContent: { padding: 20, paddingBottom: 40 },
  platformRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  platformText: { fontSize: 14, color: '#888', fontWeight: '500' },
  dateText: { fontSize: 12, color: '#666', marginLeft: 'auto' },
  recipeName: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginTop: 12, marginBottom: 20 },
  sectionCard: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#aaa' },
  sectionText: { fontSize: 14, color: '#ddd', lineHeight: 22 },
  emptyNote: { fontSize: 14, color: '#666', fontStyle: 'italic' },
  transcribingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  transcribingText: { fontSize: 14, color: '#FF6B35' },
  errorText: { fontSize: 14, color: '#FF4444', marginBottom: 12 },
  retryBtn: { backgroundColor: '#333', borderRadius: 8, padding: 10, alignItems: 'center' },
  retryBtnText: { color: '#FF6B35', fontWeight: '600' },
  transcribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6C3DC1', borderRadius: 10, padding: 14, gap: 8 },
  transcribeBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  openLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6B35', borderRadius: 12, padding: 16, marginTop: 8, gap: 10 },
  openLinkText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalKAV: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  modalScroll: { flex: 1 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#aaa', marginBottom: 8, marginTop: 12 },
  modalInput: { backgroundColor: '#252525', borderRadius: 12, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#333' },
  modalTextArea: { minHeight: 90, paddingTop: 12 },
  modalSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#28a745', borderRadius: 12, padding: 16, marginTop: 24, marginBottom: 20, gap: 8 },
  modalSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
