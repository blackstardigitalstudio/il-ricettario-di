import React, { useState, useEffect } from 'react';
import { Drawer } from 'expo-router/drawer';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '../../src/utils/api';
import { useLang, LANGUAGES } from '../../src/context/LangContext';

function CustomDrawerContent(props: any) {
  const router = useRouter();
  const { T, lang, setLang } = useLang();
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPicture, setUserPicture] = useState('');
  const [showEditName, setShowEditName] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const localName = await AsyncStorage.getItem('user_name');
      if (localName) {
        setUserName(localName);
      }
      const stored = await AsyncStorage.getItem('user_data');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.name) setUserName(data.name);
        setUserEmail(data.email || '');
        setUserPicture(data.picture || '');
      }
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
      const stored = await AsyncStorage.getItem('user_data');
      if (stored) {
        const data = JSON.parse(stored);
        data.name = newName.trim();
        await AsyncStorage.setItem('user_data', JSON.stringify(data));
      }
      setShowEditName(false);
      Alert.alert(T('done'), `${T('now_is')} "${T('cookbook_of')} ${newName.trim()}"`);
    } catch (e) {
      console.log('Save name error:', e);
    }
  };

  const handleLogout = async () => {
    Alert.alert(T('logout'), T('logout_confirm'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('logout'), style: 'destructive',
        onPress: async () => {
          try {
            await authFetch('/api/auth/logout', { method: 'POST' });
          } catch (e) { /* ignore */ }
          await AsyncStorage.removeItem('session_token');
          await AsyncStorage.removeItem('user_data');
          await AsyncStorage.removeItem('user_name');
          if (typeof window !== 'undefined') window.location.reload();
        },
      },
    ]);
  };

  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  const menuItems = [
    { key: 'index', icon: 'home', label: T('home'), color: '#FF6B35' },
    { key: 'add', icon: 'add-circle', label: T('add_recipe'), color: '#28a745' },
    { key: 'folders', icon: 'folder', label: T('folders'), color: '#6C3DC1' },
    { key: 'favorites', icon: 'star', label: T('favorites'), color: '#FFD700' },
    { key: 'settings', icon: 'settings', label: T('settings'), color: '#888' },
  ];

  return (
    <DrawerContentScrollView {...props} style={ds.scroll} contentContainerStyle={ds.container}>
      {/* User Header */}
      <View style={ds.userHeader}>
        {userPicture ? (
          <Image source={{ uri: userPicture }} style={ds.avatar} />
        ) : (
          <View style={ds.avatarPlaceholder}>
            <Ionicons name="person" size={28} color="#FF6B35" />
          </View>
        )}
        <TouchableOpacity onPress={() => { setNewName(userName); setShowEditName(true); }} testID="edit-name-btn" style={{ flex: 1 }}>
          <Text style={ds.userName} numberOfLines={1}>{userName}</Text>
          {userEmail ? <Text style={ds.userEmail} numberOfLines={1}>{userEmail}</Text> : null}
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

const ds = StyleSheet.create({
  scroll: { backgroundColor: '#141414' },
  container: { flex: 1 },
  userHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' },
  userName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  userEmail: { fontSize: 12, color: '#888', marginTop: 2 },
  appTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  appTitleText: { fontSize: 16, fontWeight: '600', color: '#FF6B35', flex: 1 },
  sep: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 10, marginHorizontal: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 14 },
  iconCircle: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '500', color: '#ddd', flex: 1 },
  langInline: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#252525', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  langInlineFlag: { fontSize: 14 },
  langInlineName: { fontSize: 12, color: '#aaa' },
  disabled: { opacity: 0.4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 400, backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 20 },
  modalInput: { backgroundColor: '#252525', borderRadius: 12, padding: 16, fontSize: 18, color: '#fff', borderWidth: 1, borderColor: '#333', textAlign: 'center' },
  modalPreview: { fontSize: 18, fontWeight: '600', color: '#FF6B35', textAlign: 'center', marginVertical: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#FF6B35', alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  langItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, gap: 12 },
  langItemActive: { backgroundColor: '#FF6B3520' },
  langItemFlag: { fontSize: 22 },
  langItemName: { flex: 1, color: '#ddd', fontSize: 16 },
  langItemNameActive: { color: '#FF6B35', fontWeight: '600' },
});

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
      <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
    </Drawer>
  );
}
