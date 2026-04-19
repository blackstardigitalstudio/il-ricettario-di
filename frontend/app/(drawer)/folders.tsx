import { authFetch } from '../../src/utils/api';
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useLang } from '../../src/context/LangContext';
import { useTheme } from '../../src/context/ThemeContext';



interface Folder {
  id: string;
  name: string;
  created_at: string;
}

interface Subfolder {
  id: string;
  folder_id: string;
  name: string;
}

export default function FoldersScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { T } = useLang();
  const { colors } = useTheme();
  const st = useMemo(() => makeStyles(colors), [colors]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [subfolders, setSubfolders] = useState<{ [key: string]: Subfolder[] }>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showSubfolderModal, setShowSubfolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newSubfolderName, setNewSubfolderName] = useState('');
  const [selectedFolderForSubfolder, setSelectedFolderForSubfolder] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editingSubfolder, setEditingSubfolder] = useState<Subfolder | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchFolders = async () => {
    try {
      const response = await authFetch(`/api/folders`);
      const data = await response.json();
      setFolders(data);

      // Fetch subfolders for each folder
      const subfoldersMap: { [key: string]: Subfolder[] } = {};
      for (const folder of data) {
        const subResponse = await authFetch(`/api/subfolders?folder_id=${folder.id}`);
        const subData = await subResponse.json();
        subfoldersMap[folder.id] = subData;
      }
      setSubfolders(subfoldersMap);
    } catch (error) {
      console.error('Error fetching folders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchFolders();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchFolders();
  };

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert(T('error'), T('folder_name'));
      return;
    }
    setSaving(true);
    try {
      const response = await authFetch(`/api/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (response.ok) {
        setNewFolderName('');
        setShowFolderModal(false);
        fetchFolders();
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      Alert.alert('Errore', 'Impossibile creare la cartella');
    } finally {
      setSaving(false);
    }
  };

  const updateFolder = async () => {
    if (!editingFolder || !newFolderName.trim()) return;
    setSaving(true);
    try {
      const response = await authFetch(`/api/folders/${editingFolder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (response.ok) {
        setNewFolderName('');
        setEditingFolder(null);
        setShowFolderModal(false);
        fetchFolders();
      }
    } catch (error) {
      console.error('Error updating folder:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteFolder = (folder: Folder) => {
    Alert.alert(
      T('delete_folder'),
      T('delete_folder_confirm'),
      [
        { text: T('cancel'), style: 'cancel' },
        {
          text: T('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await authFetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
              fetchFolders();
            } catch (error) {
              console.error('Error deleting folder:', error);
            }
          },
        },
      ]
    );
  };

  const createSubfolder = async () => {
    if (!newSubfolderName.trim() || !selectedFolderForSubfolder) return;
    setSaving(true);
    try {
      const response = await authFetch(`/api/subfolders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_id: selectedFolderForSubfolder,
          name: newSubfolderName.trim(),
        }),
      });
      if (response.ok) {
        setNewSubfolderName('');
        setSelectedFolderForSubfolder(null);
        setShowSubfolderModal(false);
        fetchFolders();
      }
    } catch (error) {
      console.error('Error creating subfolder:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateSubfolder = async () => {
    if (!editingSubfolder || !newSubfolderName.trim()) return;
    setSaving(true);
    try {
      const response = await authFetch(`/api/subfolders/${editingSubfolder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSubfolderName.trim() }),
      });
      if (response.ok) {
        setNewSubfolderName('');
        setEditingSubfolder(null);
        setShowSubfolderModal(false);
        fetchFolders();
      }
    } catch (error) {
      console.error('Error updating subfolder:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteSubfolder = (subfolder: Subfolder) => {
    Alert.alert(
      T('delete_subfolder'),
      T('delete_subfolder_confirm'),
      [
        { text: T('cancel'), style: 'cancel' },
        {
          text: T('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await authFetch(`/api/subfolders/${subfolder.id}`, { method: 'DELETE' });
              fetchFolders();
            } catch (error) {
              console.error('Error deleting subfolder:', error);
            }
          },
        },
      ]
    );
  };

  const openEditFolder = (folder: Folder) => {
    setEditingFolder(folder);
    setNewFolderName(folder.name);
    setShowFolderModal(true);
  };

  const openEditSubfolder = (subfolder: Subfolder) => {
    setEditingSubfolder(subfolder);
    setNewSubfolderName(subfolder.name);
    setShowSubfolderModal(true);
  };

  const openAddSubfolder = (folderId: string) => {
    setSelectedFolderForSubfolder(folderId);
    setNewSubfolderName('');
    setEditingSubfolder(null);
    setShowSubfolderModal(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => navigation.dispatch(DrawerActions.openDrawer())} testID="menu-btn-folders">
          <Ionicons name="menu" size={28} color="#FF6B35" />
        </TouchableOpacity>
        <Text style={styles.title}>{T('folders')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setEditingFolder(null);
            setNewFolderName('');
            setShowFolderModal(true);
          }}
        >
          <Ionicons name="add" size={28} color="#FF6B35" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />
        }
      >
        {folders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={80} color="#444" />
            <Text style={styles.emptyText}>{T('no_folders')}</Text>
            <Text style={styles.emptySubtext}>{T('create_first_folder')}</Text>
          </View>
        ) : (
          folders.map((folder) => (
            <View key={folder.id} style={styles.folderContainer}>
              <TouchableOpacity
                style={styles.folderRow}
                onPress={() => toggleFolder(folder.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={expandedFolders.has(folder.id) ? 'folder-open' : 'folder'}
                  size={28}
                  color="#FF6B35"
                />
                <Text style={styles.folderName}>{folder.name}</Text>
                <View style={styles.folderActions}>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => openAddSubfolder(folder.id)}
                  >
                    <Ionicons name="add-circle-outline" size={22} color="#888" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => openEditFolder(folder)}
                  >
                    <Ionicons name="pencil" size={20} color="#888" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => deleteFolder(folder)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF4444" />
                  </TouchableOpacity>
                  <Ionicons
                    name={expandedFolders.has(folder.id) ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color="#666"
                  />
                </View>
              </TouchableOpacity>

              {/* Subfolders */}
              {expandedFolders.has(folder.id) && (
                <View style={styles.subfolderList}>
                  {subfolders[folder.id]?.length === 0 ? (
                    <Text style={styles.noSubfolders}>{T('no_subfolders')}</Text>
                  ) : (
                    subfolders[folder.id]?.map((subfolder) => (
                      <TouchableOpacity
                        key={subfolder.id}
                        style={styles.subfolderRow}
                        onPress={() => router.push(`/folder/${folder.id}?subfolder=${subfolder.id}`)}
                      >
                        <Ionicons name="folder-outline" size={22} color="#888" />
                        <Text style={styles.subfolderName}>{subfolder.name}</Text>
                        <View style={styles.folderActions}>
                          <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => openEditSubfolder(subfolder)}
                          >
                            <Ionicons name="pencil" size={18} color="#666" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => deleteSubfolder(subfolder)}
                          >
                            <Ionicons name="trash-outline" size={18} color="#FF4444" />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                  <TouchableOpacity
                    style={styles.viewAllButton}
                    onPress={() => router.push(`/folder/${folder.id}`)}
                  >
                    <Ionicons name="eye" size={18} color="#FF6B35" />
                    <Text style={styles.viewAllText}>{T('view_all_recipes')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Folder Modal */}
      <Modal visible={showFolderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingFolder ? T('edit_folder') : T('new_folder')}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={T('folder_name')}
              placeholderTextColor="#666"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowFolderModal(false);
                  setEditingFolder(null);
                  setNewFolderName('');
                }}
              >
                <Text style={styles.modalCancelText}>{T('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, saving && styles.buttonDisabled]}
                onPress={editingFolder ? updateFolder : createFolder}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>{T('save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Subfolder Modal */}
      <Modal visible={showSubfolderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingSubfolder ? T('edit_subfolder') : T('new_subfolder')}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={T('subfolder_name')}
              placeholderTextColor="#666"
              value={newSubfolderName}
              onChangeText={setNewSubfolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowSubfolderModal(false);
                  setEditingSubfolder(null);
                  setSelectedFolderForSubfolder(null);
                  setNewSubfolderName('');
                }}
              >
                <Text style={styles.modalCancelText}>{T('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, saving && styles.buttonDisabled]}
                onPress={editingSubfolder ? updateSubfolder : createSubfolder}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>{T('save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = makeStyles({
  bg: '#0f0f0f', card: '#1a1a1a', cardBorder: '#2a2a2a', text: '#ffffff',
  textMuted: '#aaaaaa', textSubtle: '#666666', accent: '#FF6B35',
  accentSoft: '#FF6B3520', divider: '#222222', overlay: 'rgba(0,0,0,0.85)',
  inputBg: '#252525', success: '#4CAF50', danger: '#FF4444',
});

function makeStyles(colors: any) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
  },
  menuBtn: {
    padding: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  addButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSubtle,
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSubtle,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  folderContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  folderName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  folderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 8,
  },
  subfolderList: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingVertical: 8,
  },
  subfolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    paddingLeft: 52,
    gap: 10,
  },
  subfolderName: {
    flex: 1,
    fontSize: 15,
    color: '#ccc',
  },
  noSubfolders: {
    fontSize: 14,
    color: colors.textSubtle,
    paddingVertical: 12,
    paddingHorizontal: 52,
    fontStyle: 'italic',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  viewAllText: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.cardBorder,
    alignItems: 'center',
  },
  modalCancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
  },
  modalSaveText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
}
