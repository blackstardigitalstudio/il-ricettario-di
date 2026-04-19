import React, { useState, useEffect, useMemo } from 'react';
import { Drawer } from 'expo-router/drawer';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '../../src/utils/api';
import { useLang, LANGUAGES } from '../../src/context/LangContext';
import { useTheme } from '../../src/context/ThemeContext';

function CustomDrawerContent(props: any) {
  const router = useRouter();
  const { T, lang, setLang } = useLang();
  const { colors } = useTheme();
  const ds = useMemo(() => makeDrawerStyles(colors), [colors]);
  const [userName, setUserName] = useState('');
  const [showEditName, setShowEditName] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const localName = await AsyncStorage.getItem('user_name');
      if (localName) setUserName(localName);
    } catch (e) {
      console.log('Error loading user:', e);
    }
  };

  const saveName = async () => {
    if (!newName.trim()) return;
    try {
      await AsyncStorage.setItem('user_name', newName.trim());
      try {
        await authFetch('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({ name: newName.trim() }),
        });
      } catch (e) { /* ignore if offline */ }
      setUserName(newName.trim());
      setShowEditName(false);
      Alert.alert(T('done'), `${T('now_is')} "${T('cookbook_of')} ${newName.trim()}"`);
    } catch (e) {
      console.log('Save name error:', e);
    }
  };

  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  const menuItems = [
    { key: 'index', icon: 'home', label: T('home'), color: '#FF6B35' },
    { key: 'add', icon: 'add-circle', label: T('add_recipe'), color: '#28a745' },
    { key: 'folders', icon: 'folder', label: T('folders'), color: '#6C3DC1' },
    { key: 'favorites', icon: 'star', label: T('favorites'), color: '#FFD700' },
    { key: 'shopping-list', icon: 'basket', label: T('shopping_list') || 'Lista Spesa', color: '#17a2b8' },
    { key: 'settings', icon: 'settings', label: T('settings'), color: '#888' },
  ];

  return (
    <DrawerContentScrollView {...props} style={ds.scroll} contentContainerStyle={ds.container}>
      {/* User Header */}
      <View style={ds.userHeader}>
        <View style={ds.avatarPlaceholder}>
          <Ionicons name="person" size={28} color="#FF6B35" />
        </View>
        <TouchableOpacity onPress={() => { setNewName(userName); setShowEditName(true); }} testID="edit-name-btn" style={{ flex: 1 }}>
          <Text style={ds.userName} numberOfLines={1}>{userName}</Text>
        </TouchableOpacity>
      </View>

      <View style={ds.appTitle}>
        <Ionicons name="restaurant" size={22} color="#FF6B35" />
        <Text style={ds.appTitleText} numberOfLines={1}>{T('cookbook_of')} {userName.split(' ')[0]}</Text>
      </View>

      <View style={ds.sep} />

      {menuItems.map((item) => (
        <TouchableOpacity key={item.key} style={ds.menuItem}
          onPress={() => {
            // Use drawer navigation (no stacking). Closes drawer automatically.
            try {
              props.navigation.navigate(item.key);
            } catch (e) {
              // Fallback if not in drawer context (e.g., navigated from detail screen)
              props.navigation.closeDrawer();
              setTimeout(() => router.replace('/(drawer)'), 50);
            }
          }}
          testID={`drawer-${item.key}`}>
          <View style={[ds.iconCircle, { backgroundColor: item.color + '20' }]}>
            <Ionicons name={item.icon as any} size={22} color={item.color} />
          </View>
          <Text style={ds.menuLabel}>{item.label}</Text>
        </TouchableOpacity>
      ))}

      {/* Edit Name Modal */}
      <Modal visible={showEditName} transparent animationType="fade" onRequestClose={() => setShowEditName(false)}>
        <View style={ds.modalOverlay}>
          <View style={ds.modalContent}>
            <Text style={ds.modalTitle}>{T('change_name')}</Text>
            <TextInput style={ds.modalInput} value={newName} onChangeText={setNewName}
              placeholder={T('your_name')} placeholderTextColor="#666" autoFocus testID="edit-name-input" />
            <Text style={ds.modalPreview}>{T('cookbook_of')} {newName || '...'}</Text>
            <View style={ds.modalBtns}>
              <TouchableOpacity style={ds.cancelBtn} onPress={() => setShowEditName(false)}>
                <Text style={ds.cancelText}>{T('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ds.saveBtn, !newName.trim() && ds.disabled]} onPress={saveName} disabled={!newName.trim()} testID="save-name-btn">
                <Text style={ds.saveText}>{T('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Language Modal */}
      <Modal visible={showLangPicker} transparent animationType="fade" onRequestClose={() => setShowLangPicker(false)}>
        <View style={ds.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowLangPicker(false)} />
          <View style={ds.modalContent}>
            <Text style={ds.modalTitle}>{T('language')}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {LANGUAGES.map((l) => (
                <TouchableOpacity
                  key={l.code}
                  style={[ds.langItem, lang === l.code && ds.langItemActive]}
                  onPress={() => { setLang(l.code); setShowLangPicker(false); }}
                  testID={`lang-${l.code}`}
                >
                  <Text style={ds.langItemFlag}>{l.flag}</Text>
                  <Text style={[ds.langItemName, lang === l.code && ds.langItemNameActive]}>{l.name}</Text>
                  {lang === l.code ? <Ionicons name="checkmark" size={22} color="#FF6B35" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </DrawerContentScrollView>
  );
}

const ds = makeDrawerStyles({ bg:"#0f0f0f", card:"#1a1a1a", cardBorder:"#2a2a2a", text:"#ffffff", textMuted:"#aaaaaa", textSubtle:"#666666", accent:"#FF6B35", accentSoft:"#FF6B3520", divider:"#222222", overlay:"rgba(0,0,0,0.85)", inputBg:"#252525", success:"#4CAF50", danger:"#FF4444" });

function makeDrawerStyles(colors: any) {
  return StyleSheet.create({
  scroll: { backgroundColor: '#141414' },
  container: { flex: 1 },
  userHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.cardBorder, justifyContent: 'center', alignItems: 'center' },
  userName: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  userEmail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  appTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  appTitleText: { fontSize: 16, fontWeight: '600', color: '#FF6B35', flex: 1 },
  sep: { height: 1, backgroundColor: colors.cardBorder, marginVertical: 10, marginHorizontal: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 14 },
  iconCircle: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '500', color: colors.text, flex: 1 },
  langInline: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  langInlineFlag: { fontSize: 14 },
  langInlineName: { fontSize: 12, color: colors.textMuted },
  disabled: { opacity: 0.4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 400, backgroundColor: colors.card, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 20 },
  modalInput: { backgroundColor: colors.inputBg, borderRadius: 12, padding: 16, fontSize: 18, color: colors.text, borderWidth: 1, borderColor: colors.cardBorder, textAlign: 'center' },
  modalPreview: { fontSize: 18, fontWeight: '600', color: '#FF6B35', textAlign: 'center', marginVertical: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.cardBorder, alignItems: 'center' },
  cancelText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#FF6B35', alignItems: 'center' },
  saveText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  langItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, gap: 12 },
  langItemActive: { backgroundColor: '#FF6B3520' },
  langItemFlag: { fontSize: 22 },
  langItemName: { flex: 1, color: colors.text, fontSize: 16 },
  langItemNameActive: { color: '#FF6B35', fontWeight: '600' },
});
}

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: { width: 300, backgroundColor: '#141414' },
        drawerType: 'front',
        swipeEnabled: true,
        swipeEdgeWidth: 50,
      }}
    >
      <Drawer.Screen name="index" options={{ title: 'Home' }} />
      <Drawer.Screen name="add" options={{ title: 'Add' }} />
      <Drawer.Screen name="folders" options={{ title: 'Folders' }} />
      <Drawer.Screen name="favorites" options={{ title: 'Favorites' }} />
      <Drawer.Screen name="shopping-list" options={{ title: 'Shopping List' }} />
      <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
    </Drawer>
  );
}
