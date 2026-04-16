import { authFetch } from '../../src/utils/api';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';

interface Folder { id: string; name: string; }
interface Subfolder { id: string; folder_id: string; name: string; }

export default function AddRecipeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [url, setUrl] = useState('');
  const [manualCaption, setManualCaption] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [subfolders, setSubfolders] = useState<Subfolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showSubfolderPicker, setShowSubfolderPicker] = useState(false);

  useEffect(() => { fetchFolders(); }, []);
  useEffect(() => {
    if (selectedFolder) { fetchSubfolders(selectedFolder); setSelectedSubfolder(null); }
    else { setSubfolders([]); setSelectedSubfolder(null); }
  }, [selectedFolder]);

  const fetchFolders = async () => {
    try { const r = await authFetch('/api/folders'); setFolders(await r.json()); } catch (e) { /* */ }
  };
  const fetchSubfolders = async (id: string) => {
    try { const r = await authFetch(`/api/subfolders?folder_id=${id}`); setSubfolders(await r.json()); } catch (e) { /* */ }
  };

  const pasteFromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setUrl(text);
  };

  const isValidUrl = (text: string) => {
    const lower = text.toLowerCase();
    return lower.includes('instagram.com') || lower.includes('facebook.com') || lower.includes('fb.com') || lower.includes('fb.watch');
  };

  const saveRecipe = async () => {
    const trimmed = url.trim();
    if (!trimmed) { Alert.alert('Inserisci un link', 'Incolla il link del video da Instagram o Facebook'); return; }
    if (!isValidUrl(trimmed)) { Alert.alert('Link non valido', 'Inserisci un link di Instagram o Facebook'); return; }

    setSaving(true);
    try {
      const res = await authFetch('/api/recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          source_url: trimmed,
          folder_id: selectedFolder,
          subfolder_id: selectedSubfolder,
          manual_caption: manualCaption.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (res.ok) {
        Alert.alert(
          '✅ Ricetta salvata!',
          'Il titolo e la copertina verranno generati automaticamente dall\'AI.',
          [{ text: 'OK', onPress: () => {
            setUrl(''); setManualCaption(''); setNotes('');
            setSelectedFolder(null); setSelectedSubfolder(null);
            router.push('/(drawer)');
          }}]
        );
      } else {
        const err = await res.json();
        Alert.alert('Errore', err.detail || 'Errore durante il salvataggio');
      }
    } catch (e) {
      Alert.alert('Errore', 'Errore di connessione');
    } finally {
      setSaving(false);
    }
  };

  const getFolderName = () => folders.find(f => f.id === selectedFolder)?.name || 'Nessuna cartella';
  const getSubfolderName = () => subfolders.find(s => s.id === selectedSubfolder)?.name || 'Nessuna sottocartella';

  return (
    <SafeAreaView style={st.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={st.header}>
            <TouchableOpacity style={st.menuBtn} onPress={() => navigation.dispatch(DrawerActions.openDrawer())} testID="menu-btn-add">
              <Ionicons name="menu" size={28} color="#FF6B35" />
            </TouchableOpacity>
            <View>
              <Text style={st.title}>Aggiungi Ricetta</Text>
              <Text style={st.subtitle}>Incolla il link e salva - l'AI fa il resto!</Text>
            </View>
          </View>

          {/* URL Input */}
          <View style={st.section}>
            <Text style={st.label}>Link Video *</Text>
            <View style={st.urlRow}>
              <TextInput
                style={st.urlInput}
                placeholder="https://www.instagram.com/reel/..."
                placeholderTextColor="#555"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                testID="url-input"
              />
              <TouchableOpacity style={st.pasteBtn} onPress={pasteFromClipboard} testID="paste-btn">
                <Ionicons name="clipboard" size={20} color="#FF6B35" />
              </TouchableOpacity>
            </View>

            {/* Info box */}
            <View style={st.infoBox}>
              <Ionicons name="sparkles" size={16} color="#FFD700" />
              <Text style={st.infoText}>L'AI genererà automaticamente il titolo e la copertina della ricetta</Text>
            </View>
          </View>

          {/* Optional: Caption */}
          <View style={st.section}>
            <Text style={st.label}>Descrizione (opzionale)</Text>
            <TextInput
              style={[st.textInput, st.textArea]}
              placeholder="Se vuoi, aggiungi la descrizione..."
              placeholderTextColor="#555"
              value={manualCaption}
              onChangeText={setManualCaption}
              multiline
              textAlignVertical="top"
              testID="caption-input"
            />
          </View>

          {/* Optional: Notes */}
          <View style={st.section}>
            <Text style={st.label}>Note personali (opzionale)</Text>
            <TextInput
              style={[st.textInput, st.textArea]}
              placeholder="Le tue annotazioni..."
              placeholderTextColor="#555"
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
              testID="notes-input"
            />
          </View>

          {/* Folder Picker */}
          <View style={st.section}>
            <Text style={st.label}>Cartella (opzionale)</Text>
            <TouchableOpacity style={st.pickerBtn} onPress={() => setShowFolderPicker(!showFolderPicker)} testID="folder-picker">
              <Ionicons name="folder" size={18} color="#FF6B35" />
              <Text style={st.pickerText}>{getFolderName()}</Text>
              <Ionicons name="chevron-down" size={18} color="#888" />
            </TouchableOpacity>
            {showFolderPicker && (
              <View style={st.pickerList}>
                <TouchableOpacity style={st.pickerItem} onPress={() => { setSelectedFolder(null); setShowFolderPicker(false); }}>
                  <Text style={st.pickerItemText}>Nessuna cartella</Text>
                </TouchableOpacity>
                {folders.map(f => (
                  <TouchableOpacity key={f.id} style={[st.pickerItem, selectedFolder === f.id && st.pickerActive]}
                    onPress={() => { setSelectedFolder(f.id); setShowFolderPicker(false); }}>
                    <Text style={[st.pickerItemText, selectedFolder === f.id && st.pickerActiveText]}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedFolder && subfolders.length > 0 && (
              <>
                <Text style={[st.label, { marginTop: 14 }]}>Sottocartella</Text>
                <TouchableOpacity style={st.pickerBtn} onPress={() => setShowSubfolderPicker(!showSubfolderPicker)}>
                  <Ionicons name="folder-open" size={18} color="#FF6B35" />
                  <Text style={st.pickerText}>{getSubfolderName()}</Text>
                  <Ionicons name="chevron-down" size={18} color="#888" />
                </TouchableOpacity>
                {showSubfolderPicker && (
                  <View style={st.pickerList}>
                    <TouchableOpacity style={st.pickerItem} onPress={() => { setSelectedSubfolder(null); setShowSubfolderPicker(false); }}>
                      <Text style={st.pickerItemText}>Nessuna</Text>
                    </TouchableOpacity>
                    {subfolders.map(sf => (
                      <TouchableOpacity key={sf.id} style={[st.pickerItem, selectedSubfolder === sf.id && st.pickerActive]}
                        onPress={() => { setSelectedSubfolder(sf.id); setShowSubfolderPicker(false); }}>
                        <Text style={[st.pickerItemText, selectedSubfolder === sf.id && st.pickerActiveText]}>{sf.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Save Button */}
          <View style={st.section}>
            <TouchableOpacity
              style={[st.saveBtn, saving && st.disabled]}
              onPress={saveRecipe}
              disabled={saving}
              testID="save-recipe-btn"
            >
              {saving ? (
                <><ActivityIndicator color="#fff" /><Text style={st.saveBtnText}>Salvataggio in corso...</Text></>
              ) : (
                <><Ionicons name="checkmark-circle" size={22} color="#fff" /><Text style={st.saveBtnText}>Salva Ricetta</Text></>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  scrollContent: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 },
  menuBtn: { padding: 8, backgroundColor: '#1a1a1a', borderRadius: 12 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  section: { paddingHorizontal: 20, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#aaa', marginBottom: 8 },
  urlRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  urlInput: { flex: 1, color: '#fff', fontSize: 15, padding: 14 },
  pasteBtn: { padding: 14 },
  textInput: { backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#333', color: '#fff', fontSize: 15, padding: 14 },
  textArea: { minHeight: 70, paddingTop: 12 },
  infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a0a', borderRadius: 10, padding: 12, marginTop: 12, gap: 8, borderWidth: 1, borderColor: '#333300' },
  infoText: { flex: 1, color: '#BBB', fontSize: 13 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 14, gap: 10 },
  pickerText: { flex: 1, color: '#ccc', fontSize: 15 },
  pickerList: { backgroundColor: '#252525', borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  pickerItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  pickerActive: { backgroundColor: '#FF6B35' },
  pickerItemText: { color: '#fff', fontSize: 14 },
  pickerActiveText: { fontWeight: '600' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#28a745', borderRadius: 14, padding: 18, gap: 10, marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
