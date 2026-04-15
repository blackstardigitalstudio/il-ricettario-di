import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Folder {
  id: string;
  name: string;
}

interface Subfolder {
  id: string;
  folder_id: string;
  name: string;
}

interface ExtractedData {
  platform: string;
  caption: string;
  video_url: string;
  thumbnail_url: string;
  extractionFailed?: boolean;
  error?: string;
}

export default function AddRecipeScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [manualCaption, setManualCaption] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [subfolders, setSubfolders] = useState<Subfolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showSubfolderPicker, setShowSubfolderPicker] = useState(false);

  useEffect(() => {
    fetchFolders();
  }, []);

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
      const response = await fetch(`${API_URL}/api/folders`);
      const data = await response.json();
      setFolders(data);
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  const fetchSubfolders = async (folderId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/subfolders?folder_id=${folderId}`);
      const data = await response.json();
      setSubfolders(data);
    } catch (error) {
      console.error('Error fetching subfolders:', error);
    }
  };

  const pasteFromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setUrl(text);
    }
  };

  const extractVideo = async () => {
    if (!url.trim()) {
      Alert.alert('Errore', 'Inserisci un URL');
      return;
    }

    setExtracting(true);
    setExtractedData(null);

    try {
      const response = await fetch(`${API_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        setExtractedData({
          platform: data.platform,
          caption: data.caption,
          video_url: data.video_url,
          thumbnail_url: data.thumbnail_url,
        });
      } else {
        // Allow manual entry even if extraction fails
        setExtractedData({
          platform: data.platform || 'unknown',
          caption: '',
          video_url: '',
          thumbnail_url: '',
          extractionFailed: true,
          error: data.error,
        });
        Alert.alert(
          'Estrazione parziale',
          'Non è stato possibile estrarre automaticamente il video. Puoi comunque salvare il link e inserire la descrizione manualmente.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error extracting:', error);
      Alert.alert('Errore', 'Errore di connessione');
    } finally {
      setExtracting(false);
    }
  };

  const saveRecipe = async () => {
    if (!name.trim()) {
      Alert.alert('Errore', 'Inserisci un nome per la ricetta');
      return;
    }

    if (!extractedData) {
      Alert.alert('Errore', 'Prima estrai il video');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/api/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          source_url: url.trim(),
          folder_id: selectedFolder,
          subfolder_id: selectedSubfolder,
          manual_caption: manualCaption.trim() || extractedData.caption || null,
        }),
      });

      if (response.ok) {
        Alert.alert('Successo', 'Ricetta salvata con successo!', [
          {
            text: 'OK',
            onPress: () => {
              // Reset form
              setUrl('');
              setName('');
              setManualCaption('');
              setExtractedData(null);
              setSelectedFolder(null);
              setSelectedSubfolder(null);
              router.push('/(tabs)');
            },
          },
        ]);
      } else {
        const error = await response.json();
        Alert.alert('Errore', error.detail || 'Errore durante il salvataggio');
      }
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Errore', 'Errore di connessione');
    } finally {
      setSaving(false);
    }
  };

  const getSelectedFolderName = () => {
    const folder = folders.find((f) => f.id === selectedFolder);
    return folder?.name || 'Seleziona cartella';
  };

  const getSelectedSubfolderName = () => {
    const subfolder = subfolders.find((s) => s.id === selectedSubfolder);
    return subfolder?.name || 'Seleziona sottocartella';
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Aggiungi Ricetta</Text>
            <Text style={styles.subtitle}>Incolla il link da Instagram o Facebook</Text>
          </View>

          {/* URL Input */}
          <View style={styles.section}>
            <Text style={styles.label}>Link Video</Text>
            <View style={styles.urlInputContainer}>
              <TextInput
                style={styles.urlInput}
                placeholder="https://www.instagram.com/reel/..."
                placeholderTextColor="#666"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.pasteButton} onPress={pasteFromClipboard}>
                <Ionicons name="clipboard" size={20} color="#FF6B35" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.extractButton, extracting && styles.buttonDisabled]}
              onPress={extractVideo}
              disabled={extracting}
            >
              {extracting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="download" size={20} color="#fff" />
                  <Text style={styles.extractButtonText}>Estrai Video</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Extracted Preview */}
          {extractedData && (
            <View style={styles.previewSection}>
              <View style={styles.previewHeader}>
                <Ionicons
                  name={extractedData.platform === 'instagram' ? 'logo-instagram' : 'logo-facebook'}
                  size={24}
                  color={extractedData.platform === 'instagram' ? '#E4405F' : '#1877F2'}
                />
                <Text style={styles.previewTitle}>
                  {extractedData.extractionFailed ? 'Link Salvato' : 'Video Estratto'}
                </Text>
              </View>
              
              {extractedData.extractionFailed && (
                <View style={styles.warningBox}>
                  <Ionicons name="warning" size={20} color="#FFA500" />
                  <Text style={styles.warningText}>
                    Estrazione automatica non riuscita. Puoi inserire la descrizione manualmente.
                  </Text>
                </View>
              )}
              
              {extractedData.thumbnail_url ? (
                <Image
                  source={{ uri: extractedData.thumbnail_url }}
                  style={styles.previewThumbnail}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.previewPlaceholder}>
                  <Ionicons name="videocam" size={50} color="#666" />
                  <Text style={styles.placeholderText}>
                    Apri il link originale per vedere il video
                  </Text>
                </View>
              )}
              {extractedData.caption && !extractedData.extractionFailed ? (
                <View style={styles.captionContainer}>
                  <Text style={styles.captionLabel}>Caption estratta:</Text>
                  <Text style={styles.captionText} numberOfLines={5}>
                    {extractedData.caption}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Recipe Details */}
          {extractedData && (
            <View style={styles.section}>
              <Text style={styles.label}>Nome Ricetta *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Es: Pasta alla Carbonara"
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
              />

              {/* Manual Caption - show when extraction failed or to edit */}
              <Text style={styles.label}>
                Descrizione / Caption {extractedData.extractionFailed ? '*' : '(opzionale)'}
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder={extractedData.caption || "Inserisci la descrizione della ricetta..."}
                placeholderTextColor="#666"
                value={manualCaption}
                onChangeText={setManualCaption}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* Folder Selection */}
              <Text style={styles.label}>Cartella (opzionale)</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowFolderPicker(!showFolderPicker)}
              >
                <Ionicons name="folder" size={20} color="#FF6B35" />
                <Text style={styles.pickerButtonText}>{getSelectedFolderName()}</Text>
                <Ionicons name="chevron-down" size={20} color="#888" />
              </TouchableOpacity>

              {showFolderPicker && (
                <View style={styles.pickerList}>
                  <TouchableOpacity
                    style={styles.pickerItem}
                    onPress={() => {
                      setSelectedFolder(null);
                      setShowFolderPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>Nessuna cartella</Text>
                  </TouchableOpacity>
                  {folders.map((folder) => (
                    <TouchableOpacity
                      key={folder.id}
                      style={[
                        styles.pickerItem,
                        selectedFolder === folder.id && styles.pickerItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedFolder(folder.id);
                        setShowFolderPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          selectedFolder === folder.id && styles.pickerItemTextSelected,
                        ]}
                      >
                        {folder.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Subfolder Selection */}
              {selectedFolder && subfolders.length > 0 && (
                <>
                  <Text style={styles.label}>Sottocartella (opzionale)</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowSubfolderPicker(!showSubfolderPicker)}
                  >
                    <Ionicons name="folder-open" size={20} color="#FF6B35" />
                    <Text style={styles.pickerButtonText}>{getSelectedSubfolderName()}</Text>
                    <Ionicons name="chevron-down" size={20} color="#888" />
                  </TouchableOpacity>

                  {showSubfolderPicker && (
                    <View style={styles.pickerList}>
                      <TouchableOpacity
                        style={styles.pickerItem}
                        onPress={() => {
                          setSelectedSubfolder(null);
                          setShowSubfolderPicker(false);
                        }}
                      >
                        <Text style={styles.pickerItemText}>Nessuna sottocartella</Text>
                      </TouchableOpacity>
                      {subfolders.map((subfolder) => (
                        <TouchableOpacity
                          key={subfolder.id}
                          style={[
                            styles.pickerItem,
                            selectedSubfolder === subfolder.id && styles.pickerItemSelected,
                          ]}
                          onPress={() => {
                            setSelectedSubfolder(subfolder.id);
                            setShowSubfolderPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerItemText,
                              selectedSubfolder === subfolder.id && styles.pickerItemTextSelected,
                            ]}
                          >
                            {subfolder.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={saveRecipe}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={22} color="#fff" />
                    <Text style={styles.saveButtonText}>Salva Ricetta</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#aaa',
    marginBottom: 8,
    marginTop: 16,
  },
  urlInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  urlInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    padding: 16,
  },
  pasteButton: {
    padding: 16,
  },
  textInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    color: '#fff',
    fontSize: 16,
    padding: 16,
  },
  extractButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 8,
  },
  extractButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  previewSection: {
    marginHorizontal: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  previewThumbnail: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
  },
  previewPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#666',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  warningText: {
    flex: 1,
    color: '#FFA500',
    fontSize: 13,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  captionContainer: {
    marginTop: 16,
  },
  captionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
  },
  captionText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
    gap: 12,
  },
  pickerButtonText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  pickerList: {
    backgroundColor: '#252525',
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  pickerItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  pickerItemSelected: {
    backgroundColor: '#FF6B35',
  },
  pickerItemText: {
    color: '#fff',
    fontSize: 15,
  },
  pickerItemTextSelected: {
    fontWeight: '600',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    borderRadius: 12,
    padding: 18,
    marginTop: 24,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
