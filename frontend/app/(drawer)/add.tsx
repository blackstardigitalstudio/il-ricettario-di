import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Folder { id: string; name: string; }
interface Subfolder { id: string; folder_id: string; name: string; }
interface ExtractedData {
  platform: string; caption: string; video_url: string; thumbnail_url: string;
  extractionFailed?: boolean; error?: string;
}

export default function AddRecipeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [manualCaption, setManualCaption] = useState('');
  const [notes, setNotes] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [subfolders, setSubfolders] = useState<Subfolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showSubfolderPicker, setShowSubfolderPicker] = useState(false);

  useEffect(() => { fetchFolders(); }, []);

  useEffect(() => {
    if (selectedFolder) {
      fetchSubfolders(selectedFolder);
      setSelectedSubfolder(null);
    } else {
      setSubfolders([]);
      setSelectedSubfolder(null);
    }
  }, [selectedFolder]);

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${API_URL}/api/folders`);
      setFolders(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchSubfolders = async (folderId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/subfolders?folder_id=${folderId}`);
      setSubfolders(await res.json());
    } catch (e) { console.error(e); }
  };

  const pasteFromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setUrl(text);
  };

  const extractVideo = async () => {
    if (!url.trim()) { Alert.alert('Errore', 'Inserisci un URL'); return; }
    setExtracting(true);
    setExtractedData(null);
    try {
      const res = await fetch(`${API_URL}/api/extract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setExtractedData({ platform: data.platform, caption: data.caption, video_url: data.video_url, thumbnail_url: data.thumbnail_url });
      } else {
        setExtractedData({ platform: data.platform || 'unknown', caption: '', video_url: '', thumbnail_url: '', extractionFailed: true, error: data.error });
        Alert.alert('Estrazione parziale', 'Non è stato possibile estrarre il video. Puoi salvare il link e inserire la descrizione manualmente.');
      }
    } catch (e) {
      Alert.alert('Errore', 'Errore di connessione');
    } finally {
      setExtracting(false);
    }
  };

  const saveRecipe = async () => {
    if (!name.trim()) { Alert.alert('Errore', 'Inserisci un nome per la ricetta'); return; }
    if (!extractedData) { Alert.alert('Errore', 'Prima estrai il video'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/recipes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), source_url: url.trim(),
          folder_id: selectedFolder, subfolder_id: selectedSubfolder,
          manual_caption: manualCaption.trim() || extractedData.caption || null,
          notes: notes.trim() || null,
        }),
      });
      if (res.ok) {
        Alert.alert('Successo', 'Ricetta salvata!', [{
          text: 'OK', onPress: () => {
            setUrl(''); setName(''); setManualCaption(''); setNotes('');
            setExtractedData(null); setSelectedFolder(null); setSelectedSubfolder(null);
            router.push('/(drawer)');
          },
        }]);
      } else {
        const err = await res.json();
        Alert.alert('Errore', err.detail || 'Errore durante il salvataggio');
      }
    } catch (e) { Alert.alert('Errore', 'Errore di connessione'); }
    finally { setSaving(false); }
  };

  const getFolderName = () => folders.find((f) => f.id === selectedFolder)?.name || 'Seleziona cartella';
  const getSubfolderName = () => subfolders.find((s) => s.id === selectedSubfolder)?.name || 'Seleziona sottocartella';

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex}>
        <ScrollView style={s.flex} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <TouchableOpacity style={s.menuBtn} onPress={() => navigation.dispatch(DrawerActions.openDrawer())} testID="menu-btn-add">
              <Ionicons name="menu" size={28} color="#FF6B35" />
            </TouchableOpacity>
            <View>
              <Text style={s.title}>Aggiungi Ricetta</Text>
              <Text style={s.subtitle}>Incolla il link da Instagram o Facebook</Text>
            </View>
          </View>

          {/* URL Input */}
          <View style={s.section}>
            <Text style={s.label}>Link Video</Text>
            <View style={s.urlRow}>
              <TextInput style={s.urlInput} placeholder="https://www.instagram.com/reel/..." placeholderTextColor="#666"
                value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} testID="url-input" />
              <TouchableOpacity style={s.pasteBtn} onPress={pasteFromClipboard} testID="paste-btn">
                <Ionicons name="clipboard" size={20} color="#FF6B35" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[s.extractBtn, extracting && s.disabled]} onPress={extractVideo} disabled={extracting} testID="extract-btn">
              {extracting ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="download" size={20} color="#fff" /><Text style={s.extractBtnText}>Estrai Video</Text></>
              )}
            </TouchableOpacity>
          </View>

          {/* Preview */}
          {extractedData && (
            <View style={s.previewSection}>
              <View style={s.previewHeader}>
                <Ionicons name={extractedData.platform === 'instagram' ? 'logo-instagram' : 'logo-facebook'} size={24}
                  color={extractedData.platform === 'instagram' ? '#E4405F' : '#1877F2'} />
                <Text style={s.previewTitle}>{extractedData.extractionFailed ? 'Link Salvato' : 'Video Estratto'}</Text>
              </View>
              {extractedData.extractionFailed && (
                <View style={s.warningBox}>
                  <Ionicons name="warning" size={18} color="#FFA500" />
                  <Text style={s.warningText}>Estrazione non riuscita. Inserisci la descrizione manualmente.</Text>
                </View>
              )}
              {extractedData.thumbnail_url ? (
                <Image source={{ uri: extractedData.thumbnail_url }} style={s.previewThumb} resizeMode="cover" />
              ) : (
                <View style={s.previewPlaceholder}>
                  <Ionicons name="videocam" size={48} color="#666" />
                </View>
              )}
              {extractedData.caption && !extractedData.extractionFailed ? (
                <View style={s.captionWrap}>
                  <Text style={s.captionLabel}>Caption estratta:</Text>
                  <Text style={s.captionText} numberOfLines={4}>{extractedData.caption}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Recipe Details */}
          {extractedData && (
            <View style={s.section}>
              <Text style={s.label}>Nome Ricetta *</Text>
              <TextInput style={s.textInput} placeholder="Es: Pasta alla Carbonara" placeholderTextColor="#666"
                value={name} onChangeText={setName} testID="recipe-name-input" />

              <Text style={s.label}>Descrizione / Caption</Text>
              <TextInput style={[s.textInput, s.textArea]} placeholder={extractedData.caption || "Descrizione della ricetta..."}
                placeholderTextColor="#666" value={manualCaption} onChangeText={setManualCaption}
                multiline numberOfLines={3} textAlignVertical="top" testID="recipe-caption-input" />

              <Text style={s.label}>Note personali</Text>
              <TextInput style={[s.textInput, s.textArea]} placeholder="Aggiungi le tue annotazioni..."
                placeholderTextColor="#666" value={notes} onChangeText={setNotes}
                multiline numberOfLines={3} textAlignVertical="top" testID="recipe-notes-input" />

              {/* Folder Picker */}
              <Text style={s.label}>Cartella (opzionale)</Text>
              <TouchableOpacity style={s.pickerBtn} onPress={() => setShowFolderPicker(!showFolderPicker)} testID="folder-picker-btn">
                <Ionicons name="folder" size={20} color="#FF6B35" />
                <Text style={s.pickerBtnText}>{getFolderName()}</Text>
                <Ionicons name="chevron-down" size={20} color="#888" />
              </TouchableOpacity>
              {showFolderPicker && (
                <View style={s.pickerList}>
                  <TouchableOpacity style={s.pickerItem} onPress={() => { setSelectedFolder(null); setShowFolderPicker(false); }}>
                    <Text style={s.pickerItemText}>Nessuna cartella</Text>
                  </TouchableOpacity>
                  {folders.map((f) => (
                    <TouchableOpacity key={f.id} style={[s.pickerItem, selectedFolder === f.id && s.pickerItemActive]}
                      onPress={() => { setSelectedFolder(f.id); setShowFolderPicker(false); }}>
                      <Text style={[s.pickerItemText, selectedFolder === f.id && s.pickerItemTextActive]}>{f.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Subfolder Picker */}
              {selectedFolder && subfolders.length > 0 && (
                <>
                  <Text style={s.label}>Sottocartella (opzionale)</Text>
                  <TouchableOpacity style={s.pickerBtn} onPress={() => setShowSubfolderPicker(!showSubfolderPicker)} testID="subfolder-picker-btn">
                    <Ionicons name="folder-open" size={20} color="#FF6B35" />
                    <Text style={s.pickerBtnText}>{getSubfolderName()}</Text>
                    <Ionicons name="chevron-down" size={20} color="#888" />
                  </TouchableOpacity>
                  {showSubfolderPicker && (
                    <View style={s.pickerList}>
                      <TouchableOpacity style={s.pickerItem} onPress={() => { setSelectedSubfolder(null); setShowSubfolderPicker(false); }}>
                        <Text style={s.pickerItemText}>Nessuna sottocartella</Text>
                      </TouchableOpacity>
                      {subfolders.map((sf) => (
                        <TouchableOpacity key={sf.id} style={[s.pickerItem, selectedSubfolder === sf.id && s.pickerItemActive]}
                          onPress={() => { setSelectedSubfolder(sf.id); setShowSubfolderPicker(false); }}>
                          <Text style={[s.pickerItemText, selectedSubfolder === sf.id && s.pickerItemTextActive]}>{sf.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity style={[s.saveBtn, saving && s.disabled]} onPress={saveRecipe} disabled={saving} testID="save-recipe-btn">
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="checkmark-circle" size={22} color="#fff" /><Text style={s.saveBtnText}>Salva Ricetta</Text></>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 },
  menuBtn: { padding: 8, backgroundColor: '#1a1a1a', borderRadius: 12 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#888', marginTop: 4 },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#aaa', marginBottom: 8, marginTop: 16 },
  urlRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  urlInput: { flex: 1, color: '#fff', fontSize: 15, padding: 14 },
  pasteBtn: { padding: 14 },
  textInput: { backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#333', color: '#fff', fontSize: 15, padding: 14 },
  textArea: { minHeight: 80, paddingTop: 12 },
  extractBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6B35', borderRadius: 12, padding: 14, marginTop: 12, gap: 8 },
  extractBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  previewSection: { marginHorizontal: 20, backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#2a2a2a' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  previewTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  warningBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,165,0,0.1)', borderRadius: 8, padding: 10, marginBottom: 12, gap: 8 },
  warningText: { flex: 1, color: '#FFA500', fontSize: 12 },
  previewThumb: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#2a2a2a' },
  previewPlaceholder: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' },
  captionWrap: { marginTop: 12 },
  captionLabel: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 6 },
  captionText: { fontSize: 13, color: '#ccc', lineHeight: 18 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 14, gap: 10 },
  pickerBtnText: { flex: 1, color: '#fff', fontSize: 15 },
  pickerList: { backgroundColor: '#252525', borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  pickerItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  pickerItemActive: { backgroundColor: '#FF6B35' },
  pickerItemText: { color: '#fff', fontSize: 14 },
  pickerItemTextActive: { fontWeight: '600' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#28a745', borderRadius: 12, padding: 16, marginTop: 24, gap: 8 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
