import React, { useState, useEffect } from 'react';
import { Drawer } from 'expo-router/drawer';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

function CustomDrawerContent(props: any) {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [showEditName, setShowEditName] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadName();
  }, []);

  const loadName = async () => {
    const name = await AsyncStorage.getItem('user_name');
    setUserName(name || '');
  };

  const saveName = async () => {
    if (!newName.trim()) return;
    try {
      await fetch(`${API_URL}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      await AsyncStorage.setItem('user_name', newName.trim());
      setUserName(newName.trim());
      setShowEditName(false);
      Alert.alert('Fatto!', `Ora è "Il Ricettario di ${newName.trim()}"`);
    } catch (e) {
      console.error(e);
    }
  };

  const menuItems = [
    { key: 'index', icon: 'home', label: 'Home', color: '#FF6B35' },
    { key: 'add', icon: 'add-circle', label: 'Aggiungi Ricetta', color: '#28a745' },
    { key: 'folders', icon: 'folder', label: 'Cartelle', color: '#6C3DC1' },
  ];

  return (
    <DrawerContentScrollView {...props} style={ds.drawerScroll} contentContainerStyle={ds.drawerContainer}>
      {/* Header */}
      <View style={ds.drawerHeader}>
        <Ionicons name="restaurant" size={40} color="#FF6B35" />
        <Text style={ds.drawerTitle}>Il Ricettario di</Text>
        <TouchableOpacity style={ds.nameRow} onPress={() => { setNewName(userName); setShowEditName(true); }} testID="edit-name-btn">
          <Text style={ds.drawerName}>{userName}</Text>
          <Ionicons name="pencil" size={16} color="#888" />
        </TouchableOpacity>
      </View>

      <View style={ds.separator} />

      {/* Menu Items */}
      {menuItems.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={ds.menuItem}
          onPress={() => {
            props.navigation.closeDrawer();
            router.push(`/(drawer)/${item.key}`);
          }}
          testID={`drawer-${item.key}`}
        >
          <View style={[ds.iconCircle, { backgroundColor: item.color + '20' }]}>
            <Ionicons name={item.icon as any} size={24} color={item.color} />
          </View>
          <Text style={ds.menuLabel}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color="#555" />
        </TouchableOpacity>
      ))}

      <View style={ds.separator} />

      {/* Edit Name */}
      <TouchableOpacity
        style={ds.menuItem}
        onPress={() => { setNewName(userName); setShowEditName(true); }}
        testID="drawer-edit-name"
      >
        <View style={[ds.iconCircle, { backgroundColor: '#FF6B3520' }]}>
          <Ionicons name="person" size={24} color="#FF6B35" />
        </View>
        <Text style={ds.menuLabel}>Modifica Nome</Text>
        <Ionicons name="chevron-forward" size={18} color="#555" />
      </TouchableOpacity>

      {/* Edit Name Modal */}
      <Modal visible={showEditName} transparent animationType="fade">
        <View style={ds.modalOverlay}>
          <View style={ds.modalContent}>
            <Text style={ds.modalTitle}>Cambia Nome</Text>
            <TextInput
              style={ds.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Il tuo nome..."
              placeholderTextColor="#666"
              autoFocus
              testID="edit-name-input"
            />
            <Text style={ds.modalPreview}>Il Ricettario di {newName || '...'}</Text>
            <View style={ds.modalButtons}>
              <TouchableOpacity style={ds.modalCancelBtn} onPress={() => setShowEditName(false)}>
                <Text style={ds.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ds.modalSaveBtn, !newName.trim() && ds.disabled]} onPress={saveName} disabled={!newName.trim()} testID="save-name-btn">
                <Text style={ds.modalSaveText}>Salva</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </DrawerContentScrollView>
  );
}

const ds = StyleSheet.create({
  drawerScroll: { backgroundColor: '#141414' },
  drawerContainer: { flex: 1 },
  drawerHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  drawerTitle: { fontSize: 16, color: '#888', marginTop: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  drawerName: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  separator: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 12, marginHorizontal: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  iconCircle: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: '#ddd' },
  disabled: { opacity: 0.4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 360, backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 20 },
  modalInput: { backgroundColor: '#252525', borderRadius: 12, padding: 16, fontSize: 18, color: '#fff', borderWidth: 1, borderColor: '#333', textAlign: 'center' },
  modalPreview: { fontSize: 18, fontWeight: '600', color: '#FF6B35', textAlign: 'center', marginVertical: 16 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' },
  modalCancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalSaveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#FF6B35', alignItems: 'center' },
  modalSaveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
