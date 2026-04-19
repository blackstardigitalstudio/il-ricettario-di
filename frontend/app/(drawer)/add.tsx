import { authFetch } from '../../src/utils/api';
import { triggerCountedAd } from '../../src/utils/ads';
import { useTheme } from '../../src/context/ThemeContext';
import { useLang } from '../../src/context/LangContext';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';

interface Folder { id: string; name: string; }
interface Subfolder { id: string; folder_id: string; name: string; }

export default function AddRecipeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { T } = useLang();
  const { colors } = useTheme();
  const st = useMemo(() => makeStyles(colors), [colors]);
  const { prefillUrl } = useLocalSearchParams<{ prefillUrl?: string }>();
  const [url, setUrl] = useState(typeof prefillUrl === 'string' ? prefillUrl : '');
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
    if (!trimmed) { Alert.alert(T('insert_link'), T('paste_video_link')); return; }
    if (!isValidUrl(trimmed)) { Alert.alert(T('invalid_link'), T('insert_ig_fb_link')); return; }

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
        // AdMob: every 5 saved recipes, show a rewarded interstitial.
        triggerCountedAd('save_recipe').catch(() => { /* never block UX */ });
        Alert.alert(
          `✅ ${T('recipe_saved')}`,
          T('ai_will_generate'),
          [{ text: 'OK', onPress: () => {
            setUrl(''); setManualCaption(''); setNotes('');
            setSelectedFolder(null); setSelectedSubfolder(null);
            router.push('/(drawer)');
          }}]
        );
      } else {
        const err = await res.json();
        Alert.alert(T('error'), err.detail || T('connection_error'));
      }
    } catch (e) {
      Alert.alert(T('error'), T('connection_error'));
    } finally {
      setSaving(false);
    }
  };

  const getFolderName = () => folders.find(f => f.id === selectedFolder)?.name || T('no_folder');
  const getSubfolderName = () => subfolders.find(s => s.id === selectedSubfolder)?.name || T('no_subfolder');

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
              <Text style={st.title}>{T('add_recipe')}</Text>
              <Text style={st.subtitle}>{T('paste_link')}</Text>
            </View>
          </View>

          {/* URL Input */}
          <View style={st.section}>
            <Text style={st.label}>{T('video_link')} *</Text>
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
              <Text style={st.infoText}>{T('ai_auto_generate')}</Text>
            </View>
          </View>

          {/* Optional: Caption */}
          <View style={st.section}>
            <Text style={st.label}>{T('description_optional')}</Text>
            <TextInput
              style={[st.textInput, st.textArea]}
              placeholder={T('add_description')}
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
            <Text style={st.label}>{T('personal_notes_optional')}</Text>
            <TextInput
              style={[st.textInput, st.textArea]}
              placeholder={T('your_notes')}
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
            <Text style={st.label}>{T('folder_optional')}</Text>
            <TouchableOpacity style={st.pickerBtn} onPress={() => setShowFolderPicker(!showFolderPicker)} testID="folder-picker">
              <Ionicons name="folder" size={18} color="#FF6B35" />
              <Text style={st.pickerText}>{getFolderName()}</Text>
              <Ionicons name="chevron-down" size={18} color="#888" />
            </TouchableOpacity>
            {showFolderPicker && (
              <View style={st.pickerList}>
                <TouchableOpacity style={st.pickerItem} onPress={() => { setSelectedFolder(null); setShowFolderPicker(false); }}>
                  <Text style={st.pickerItemText}>{T('no_folder')}</Text>
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
                <Text style={[st.label, { marginTop: 14 }]}>{T('subfolder')}</Text>
                <TouchableOpacity style={st.pickerBtn} onPress={() => setShowSubfolderPicker(!showSubfolderPicker)}>
                  <Ionicons name="folder-open" size={18} color="#FF6B35" />
                  <Text style={st.pickerText}>{getSubfolderName()}</Text>
                  <Ionicons name="chevron-down" size={18} color="#888" />
                </TouchableOpacity>
                {showSubfolderPicker && (
                  <View style={st.pickerList}>
                    <TouchableOpacity style={st.pickerItem} onPress={() => { setSelectedSubfolder(null); setShowSubfolderPicker(false); }}>
                      <Text style={st.pickerItemText}>{T('no_subfolder')}</Text>
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
                <><ActivityIndicator color="#fff" /><Text style={st.saveBtnText}>{T('saving')}</Text></>
              ) : (
                <><Ionicons name="checkmark-circle" size={22} color="#fff" /><Text style={st.saveBtnText}>{T('save_recipe')}</Text></>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scrollContent: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 },
  menuBtn: { padding: 8, backgroundColor: colors.card, borderRadius: 12 },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  section: { paddingHorizontal: 20, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },
  urlRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder },
  urlInput: { flex: 1, color: colors.text, fontSize: 15, padding: 14 },
  pasteBtn: { padding: 14 },
  textInput: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, color: colors.text, fontSize: 15, padding: 14 },
  textArea: { minHeight: 70, paddingTop: 12 },
  infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accentSoft, borderRadius: 10, padding: 12, marginTop: 12, gap: 8, borderWidth: 1, borderColor: colors.cardBorder },
  infoText: { flex: 1, color: colors.textMuted, fontSize: 13 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  pickerText: { flex: 1, color: colors.text, fontSize: 15 },
  pickerList: { backgroundColor: colors.inputBg, borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  pickerItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  pickerActive: { backgroundColor: colors.accent },
  pickerItemText: { color: colors.text, fontSize: 14 },
  pickerActiveText: { color: '#fff', fontWeight: '600' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success, borderRadius: 14, padding: 18, gap: 10, marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  });
}
