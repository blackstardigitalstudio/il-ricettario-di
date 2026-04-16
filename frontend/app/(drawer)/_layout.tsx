import React, { useState, useEffect } from 'react';
import { Drawer } from 'expo-router/drawer';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '../utils/api';
import { getUser, setGlobalUser } from '../_layout';

function CustomDrawerContent(props: any) {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPicture, setUserPicture] = useState('');
  const [showEditName, setShowEditName] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const stored = await AsyncStorage.getItem('user_data');
      if (stored) {
        const data = JSON.parse(stored);
        setUserName(data.name || '');
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
      const res = await authFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setUserName(newName.trim());
        const stored = await AsyncStorage.getItem('user_data');
        if (stored) {
          const data = JSON.parse(stored);
          data.name = newName.trim();
          await AsyncStorage.setItem('user_data', JSON.stringify(data));
        }
        setShowEditName(false);
        Alert.alert('Fatto!', `Ora è "Il Ricettario di ${newName.trim()}"`);
      }
    } catch (e) {
      console.log('Save name error:', e);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Vuoi uscire dal tuo account?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci', style: 'destructive',
        onPress: async () => {
          try {
            await authFetch('/api/auth/logout', { method: 'POST' });
          } catch (e) { /* ignore */ }
          await AsyncStorage.removeItem('session_token');
          await AsyncStorage.removeItem('user_data');
          setGlobalUser(null);
        },
      },
    ]);
  };

  const menuItems = [
    { key: 'index', icon: 'home', label: 'Home', color: '#FF6B35' },
    { key: 'add', icon: 'add-circle', label: 'Aggiungi Ricetta', color: '#28a745' },
    { key: 'folders', icon: 'folder', label: 'Cartelle', color: '#6C3DC1' },
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
        <TouchableOpacity onPress={() => { setNewName(userName); setShowEditName(true); }} testID="edit-name-btn">
          <Text style={ds.userName}>{userName}</Text>
          <Text style={ds.userEmail}>{userEmail}</Text>
        </TouchableOpacity>
      </View>

      <View style={ds.appTitle}>
        <Ionicons name="restaurant" size={22} color="#FF6B35" />
        <Text style={ds.appTitleText}>Il Ricettario di {userName.split(' ')[0]}</Text>
      </View>

      <View style={ds.sep} />

      {menuItems.map((item) => (
        <TouchableOpacity key={item.key} style={ds.menuItem}
          onPress={() => { props.navigation.closeDrawer(); router.push(`/(drawer)/${item.key}`); }}
          testID={`drawer-${item.key}`}>
          <View style={[ds.iconCircle, { backgroundColor: item.color + '20' }]}>
            <Ionicons name={item.icon as any} size={22} color={item.color} />
          </View>
          <Text style={ds.menuLabel}>{item.label}</Text>
        </TouchableOpacity>
      ))}

      <View style={ds.sep} />

      <TouchableOpacity style={ds.menuItem} onPress={() => { setNewName(userName); setShowEditName(true); }} testID="drawer-edit-name">
        <View style={[ds.iconCircle, { backgroundColor: '#FF6B3520' }]}>
          <Ionicons name="pencil" size={22} color="#FF6B35" />
        </View>
        <Text style={ds.menuLabel}>Modifica Nome</Text>
      </TouchableOpacity>

      <TouchableOpacity style={ds.menuItem} onPress={handleLogout} testID="drawer-logout">
        <View style={[ds.iconCircle, { backgroundColor: '#FF444420' }]}>
          <Ionicons name="log-out" size={22} color="#FF4444" />
        </View>
        <Text style={[ds.menuLabel, { color: '#FF4444' }]}>Esci</Text>
      </TouchableOpacity>

      {/* Edit Name Modal */}
      <Modal visible={showEditName} transparent animationType="fade">
        <View style={ds.modalOverlay}>
          <View style={ds.modalContent}>
            <Text style={ds.modalTitle}>Cambia Nome</Text>
            <TextInput style={ds.modalInput} value={newName} onChangeText={setNewName}
              placeholder="Il tuo nome..." placeholderTextColor="#666" autoFocus testID="edit-name-input" />
            <Text style={ds.modalPreview}>Il Ricettario di {newName || '...'}</Text>
            <View style={ds.modalBtns}>
              <TouchableOpacity style={ds.cancelBtn} onPress={() => setShowEditName(false)}>
                <Text style={ds.cancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ds.saveBtn, !newName.trim() && ds.disabled]} onPress={saveName} disabled={!newName.trim()} testID="save-name-btn">
                <Text style={ds.saveText}>Salva</Text>
              </TouchableOpacity>
            </View>
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
  appTitleText: { fontSize: 16, fontWeight: '600', color: '#FF6B35' },
  sep: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 10, marginHorizontal: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 14 },
  iconCircle: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '500', color: '#ddd' },
  disabled: { opacity: 0.4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 360, backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 20 },
  modalInput: { backgroundColor: '#252525', borderRadius: 12, padding: 16, fontSize: 18, color: '#fff', borderWidth: 1, borderColor: '#333', textAlign: 'center' },
  modalPreview: { fontSize: 18, fontWeight: '600', color: '#FF6B35', textAlign: 'center', marginVertical: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#FF6B35', alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
      <Drawer.Screen name="add" options={{ title: 'Aggiungi' }} />
      <Drawer.Screen name="folders" options={{ title: 'Cartelle' }} />
    </Drawer>
  );
}
