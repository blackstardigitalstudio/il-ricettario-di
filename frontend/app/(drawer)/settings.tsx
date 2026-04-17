import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  Switch, Platform, ActivityIndicator, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '../../src/utils/api';
import { useLang, LANGUAGES } from '../../src/context/LangContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { T, lang, setLang } = useLang();
  const { mode, colors, toggle } = useTheme();

  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPicture, setUserPicture] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const currentLang = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const localName = await AsyncStorage.getItem('user_name');
      if (localName) { setUserName(localName); setTempName(localName); }
      const stored = await AsyncStorage.getItem('user_data');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.name) { setUserName(data.name); setTempName(data.name); }
        setUserEmail(data.email || '');
        setUserPicture(data.picture || '');
      }
    } catch (e) { /* */ }
  };

  const saveName = async () => {
    const val = tempName.trim();
    if (!val) return;
    try {
      await AsyncStorage.setItem('user_name', val);
      try { await authFetch('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ name: val }) }); } catch (e) { /* */ }
      const stored = await AsyncStorage.getItem('user_data');
      if (stored) {
        const d = JSON.parse(stored); d.name = val;
        await AsyncStorage.setItem('user_data', JSON.stringify(d));
      }
      setUserName(val);
      setEditingName(false);
    } catch (e) { /* */ }
  };

  const handleGoogleLogin = () => {
    router.push('/google-login');
  };

  const handleLogout = () => {
    Alert.alert(T('logout'), T('logout_confirm'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('logout'), style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try { await authFetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* */ }
          await AsyncStorage.removeItem('session_token');
          await AsyncStorage.removeItem('user_data');
          setUserEmail('');
          setUserPicture('');
          setLoggingOut(false);
          if (typeof window !== 'undefined' && (window as any).location) (window as any).location.reload();
        },
      },
    ]);
  };

  const openDrawer = () => { try { navigation.dispatch(DrawerActions.openDrawer()); } catch (e) { /* */ } };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 12 },
    menuBtn: { padding: 8, backgroundColor: colors.card, borderRadius: 12 },
    title: { fontSize: 24, fontWeight: 'bold', color: colors.text, flex: 1 },
    scroll: { flex: 1 }, scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, marginTop: 24, marginBottom: 10, marginLeft: 4, textTransform: 'uppercase' },
    card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 18, marginBottom: 8 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatar: { width: 56, height: 56, borderRadius: 28 },
    avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentSoft, justifyContent: 'center', alignItems: 'center' },
    profileName: { fontSize: 18, fontWeight: '700', color: colors.text },
    profileEmail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    editInput: { backgroundColor: colors.inputBg, borderRadius: 10, padding: 12, color: colors.text, fontSize: 16, borderWidth: 1, borderColor: colors.cardBorder, marginTop: 10 },
    inputRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    smallBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
    rowIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    rowLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '500' },
    rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    divider: { height: 1, backgroundColor: colors.divider, marginLeft: 48 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 12, marginTop: 6 },
    googleBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dadce0' },
    googleText: { color: '#3c4043', fontSize: 15, fontWeight: '600' },
    logoutBtn: { backgroundColor: colors.danger + '18', borderWidth: 1, borderColor: colors.danger + '40' },
    logoutText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
    saveText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
  });

  const isLoggedIn = !!userEmail;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.menuBtn} onPress={openDrawer}>
          <Ionicons name="menu" size={26} color={colors.accent} />
        </TouchableOpacity>
        <Text style={s.title}>⚙️ {T('settings')}</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* PROFILE */}
        <Text style={s.sectionTitle}>{T('profile')}</Text>
        <View style={s.card}>
          <View style={s.profileRow}>
            {userPicture ? (
              <Image source={{ uri: userPicture }} style={s.avatar} />
            ) : (
              <View style={s.avatarPlaceholder}><Ionicons name="person" size={28} color={colors.accent} /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{userName || T('user')}</Text>
              {userEmail ? <Text style={s.profileEmail}>{userEmail}</Text> : <Text style={s.profileEmail}>{T('not_logged_in')}</Text>}
            </View>
          </View>

          {editingName ? (<>
            <TextInput
              style={s.editInput}
              value={tempName}
              onChangeText={setTempName}
              placeholder={T('your_name')}
              placeholderTextColor={colors.textSubtle}
              autoFocus
            />
            <View style={s.inputRow}>
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.inputBg }]} onPress={() => { setEditingName(false); setTempName(userName); }}>
                <Text style={s.cancelText}>{T('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: colors.accent }]} onPress={saveName}>
                <Text style={s.saveText}>{T('save')}</Text>
              </TouchableOpacity>
            </View>
          </>) : (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.accentSoft, marginTop: 14 }]} onPress={() => setEditingName(true)} testID="edit-name-settings">
              <Ionicons name="pencil" size={18} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>{T('edit_name')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ACCOUNT */}
        <Text style={s.sectionTitle}>{T('account')}</Text>
        <View style={s.card}>
          {!isLoggedIn ? (
            <TouchableOpacity style={[s.actionBtn, s.googleBtn]} onPress={handleGoogleLogin} testID="google-login-btn">
              <Ionicons name="logo-google" size={20} color="#4285F4" />
              <Text style={s.googleText}>{T('login_with_google')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.actionBtn, s.logoutBtn]} onPress={handleLogout} disabled={loggingOut} testID="logout-btn">
              {loggingOut ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="log-out-outline" size={20} color={colors.danger} />}
              <Text style={s.logoutText}>{T('logout')}</Text>
            </TouchableOpacity>
          )}
          <Text style={[s.rowSub, { textAlign: 'center', marginTop: 10 }]}>
            {isLoggedIn ? T('logged_in_sync_hint') : T('login_hint')}
          </Text>
        </View>

        {/* APPEARANCE */}
        <Text style={s.sectionTitle}>{T('appearance')}</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>{T('theme')}</Text>
              <Text style={s.rowSub}>{mode === 'dark' ? T('dark_mode') : T('light_mode')}</Text>
            </View>
            <Switch
              value={mode === 'light'}
              onValueChange={toggle}
              trackColor={{ false: '#555', true: colors.accent }}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
              testID="theme-switch"
            />
          </View>
          <View style={s.divider} />
          <TouchableOpacity style={s.row} onPress={() => setShowLangPicker(true)} testID="language-picker-btn">
            <View style={[s.rowIcon, { backgroundColor: '#1877F220' }]}>
              <Ionicons name="language" size={20} color="#1877F2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>{T('language')}</Text>
              <Text style={s.rowSub}>{currentLang.flag}  {currentLang.name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          </TouchableOpacity>
        </View>

        {/* ABOUT */}
        <Text style={s.sectionTitle}>{T('about')}</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="restaurant" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Il Ricettario</Text>
              <Text style={s.rowSub}>v1.0.0</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal visible={showLangPicker} transparent animationType="fade" onRequestClose={() => setShowLangPicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowLangPicker(false)} />
          <View style={{ backgroundColor: colors.card, borderRadius: 18, width: '100%', maxHeight: '70%', padding: 16, borderWidth: 1, borderColor: colors.cardBorder }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12, textAlign: 'center' }}>{T('language')}</Text>
            <ScrollView>
              {LANGUAGES.map((l) => {
                const active = lang === l.code;
                return (
                  <TouchableOpacity
                    key={l.code}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, backgroundColor: active ? colors.accentSoft : 'transparent', marginBottom: 4 }}
                    onPress={() => { setLang(l.code); setShowLangPicker(false); }}
                    testID={`lang-${l.code}`}
                  >
                    <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                    <Text style={{ flex: 1, color: active ? colors.accent : colors.text, fontSize: 15, fontWeight: active ? '700' : '500' }}>{l.name}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
