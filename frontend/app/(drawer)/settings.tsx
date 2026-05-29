import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  Switch, Platform, ActivityIndicator, Modal, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { authFetch } from '../../src/utils/api';
import { useLang, LANGUAGES } from '../../src/context/LangContext';
import { useTheme } from '../../src/context/ThemeContext';
import { mandatoryAd, ADS_DISABLED_KEY } from '../../src/utils/ads';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { T, lang, setLang } = useLang();
  const { mode, colors, toggle } = useTheme();

  const [userName, setUserName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Hidden premium unlock: 5 taps on version → opens code dialog.
  const [versionTaps, setVersionTaps] = useState(0);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [adsDisabled, setAdsDisabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(ADS_DISABLED_KEY);
        setAdsDisabled(v === '1');
      } catch { /* */ }
    })();
  }, []);

  const onVersionTap = () => {
    const next = versionTaps + 1;
    setVersionTaps(next);
    if (next >= 5) {
      setVersionTaps(0);
      setCodeInput('');
      setShowCodeModal(true);
    }
  };

  const submitCode = async () => {
    const code = codeInput.trim();
    if (code === 'Ciao2020') {
      try { await AsyncStorage.setItem(ADS_DISABLED_KEY, '1'); } catch { /* */ }
      setAdsDisabled(true);
      setShowCodeModal(false);
      Alert.alert('✨ Premium', 'Ads disattivati per sempre su questo dispositivo.');
    } else if (code === 'reset' || code === 'RESET') {
      try { await AsyncStorage.removeItem(ADS_DISABLED_KEY); } catch { /* */ }
      setAdsDisabled(false);
      setShowCodeModal(false);
      Alert.alert('Ads', 'Premium rimosso. Gli ads torneranno attivi.');
    } else {
      Alert.alert('Codice non valido', 'Il codice inserito non è corretto.');
    }
  };

  const currentLang = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const localName = await AsyncStorage.getItem('user_name');
      if (localName) { setUserName(localName); setTempName(localName); }
    } catch (e) { /* */ }
  };

  const saveName = async () => {
    const val = tempName.trim();
    if (!val) return;
    try {
      await AsyncStorage.setItem('user_name', val);
      try { await authFetch('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ name: val }) }); } catch (e) { /* */ }
      setUserName(val);
      setEditingName(false);
    } catch (e) { /* */ }
  };

  const exportBackup = async () => {
    setExporting(true);
    try {
      // AdMob: MANDATORY rewarded interstitial before every backup export.
      // Graceful fallback if ad cannot load (policy-safe: never block user).
      try { await mandatoryAd(); } catch { /* ignore */ }
      const res = await authFetch('/api/backup/export');
      if (!res.ok) {
        Alert.alert(T('error'), T('backup_export_failed') || 'Esportazione fallita');
        return;
      }
      const data = await res.json();
      const totals = data.totals || {};
      const json = JSON.stringify(data, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fname = `ricettario-backup-${ts}.json`;

      if (Platform.OS === 'web') {
        // Fallback for web: trigger browser download
        try {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fname;
          a.click();
          URL.revokeObjectURL(url);
          Alert.alert(T('done') || 'Fatto', `${totals.recipes || 0} ricette esportate`);
        } catch (e) { /* */ }
        return;
      }

      const path = `${FileSystem.cacheDirectory}${fname}`;
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      const msg = `📦 ${T('backup_label') || 'Backup Ricettario'}\n` +
                  `${T('recipes_label') || 'Ricette'}: ${totals.recipes || 0} • ` +
                  `${T('folders_label') || 'Cartelle'}: ${totals.folders || 0}`;
      if (canShare) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/json',
          dialogTitle: T('backup_share_title') || 'Condividi backup',
          UTI: 'public.json',
        });
      } else {
        // Fallback: open native Share sheet with text only (still works on WhatsApp as link-less message)
        await Share.share({ message: `${msg}\n\n${json.substring(0, 1000)}…` });
      }
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const importBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const uri = asset.uri;

      Alert.alert(
        T('backup_import_title') || 'Importa backup',
        T('backup_import_msg') || 'Come vuoi importare?\n\n• Unisci: aggiunge solo le voci nuove\n• Sostituisci: cancella tutto e reimporta',
        [
          { text: T('cancel'), style: 'cancel' },
          { text: T('backup_merge') || 'Unisci', onPress: () => runImport(uri, 'merge') },
          { text: T('backup_replace') || 'Sostituisci', style: 'destructive', onPress: () => runImport(uri, 'replace') },
        ],
      );
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || 'Import failed');
    }
  };

  const runImport = async (uri: string, mode: 'merge' | 'replace') => {
    setImporting(true);
    try {
      const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      let data: any;
      try { data = JSON.parse(content); } catch {
        Alert.alert(T('error'), T('backup_invalid_json') || 'File JSON non valido');
        return;
      }
      const res = await authFetch('/api/backup/import', {
        method: 'POST',
        body: JSON.stringify({ data, mode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert(T('error'), err?.detail || (T('backup_import_failed') || 'Importazione fallita'));
        return;
      }
      const out = await res.json();
      const imp = out.imported || {};
      Alert.alert(
        T('backup_import_done') || 'Importazione completata',
        `✓ ${imp.recipes || 0} ${T('recipes_label') || 'ricette'}\n` +
        `✓ ${imp.folders || 0} ${T('folders_label') || 'cartelle'}\n` +
        `✓ ${imp.subfolders || 0} ${T('subfolders_label') || 'sottocartelle'}\n` +
        (imp.skipped ? `⊘ ${imp.skipped} ${T('backup_skipped') || 'già presenti'}` : ''),
        [{ text: 'OK' }],
      );
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
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

  const isLoggedIn = false;

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
            <View style={s.avatarPlaceholder}><Ionicons name="person" size={28} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{userName || T('user')}</Text>
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

        {/* BACKUP */}
        <Text style={s.sectionTitle}>💾 {T('backup') || 'Backup'}</Text>
        <View style={s.card}>
          <Text style={[s.rowSub, { marginBottom: 12, lineHeight: 18 }]}>
            {T('backup_hint') || "Esporta il tuo ricettario in un file JSON per conservarlo al sicuro o trasferirlo su un altro dispositivo. Puoi inviarlo tramite WhatsApp, email o salvarlo nel cloud."}
          </Text>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: colors.accent, marginBottom: 8 }]}
            onPress={exportBackup}
            disabled={exporting}
            testID="backup-export-btn"
          >
            {exporting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="cloud-download-outline" size={20} color="#fff" />
            )}
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
              {exporting ? (T('backup_exporting') || 'Esportazione...') : (T('backup_export') || 'Esporta Backup')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: colors.accentSoft }]}
            onPress={importBackup}
            disabled={importing}
            testID="backup-import-btn"
          >
            {importing ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={20} color={colors.accent} />
            )}
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>
              {importing ? (T('backup_importing') || 'Importazione...') : (T('backup_import') || 'Importa Backup')}
            </Text>
          </TouchableOpacity>
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
          <TouchableOpacity
            style={s.row}
            onPress={onVersionTap}
            activeOpacity={0.8}
            testID="about-version-row"
          >
            <View style={[s.rowIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="restaurant" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Il Ricettario</Text>
              <Text style={s.rowSub}>v1.0.23</Text>
            </View>
            {adsDisabled ? (
              <View style={{ backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>PREMIUM</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <View style={s.divider} />
          <View style={[s.row, { justifyContent: 'center' }]}>
            <View style={{ flexDirection: 'row', width: 22, height: 15, borderRadius: 2, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.cardBorder }}>
              <View style={{ flex: 1, backgroundColor: '#009246' }} />
              <View style={{ flex: 1, backgroundColor: '#ffffff' }} />
              <View style={{ flex: 1, backgroundColor: '#CE2B37' }} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5 }}>Made in Italy</Text>
          </View>
        </View>
      </ScrollView>

      {/* Premium unlock code modal (hidden: 5 taps on version) */}
      <Modal visible={showCodeModal} transparent animationType="fade" onRequestClose={() => setShowCodeModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowCodeModal(false)} />
          <View style={{ backgroundColor: colors.card, borderRadius: 18, width: '100%', padding: 22, borderWidth: 1, borderColor: colors.cardBorder }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4, textAlign: 'center' }}>🔑 Codice Premium</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16, textAlign: 'center' }}>
              Inserisci il codice per sbloccare la versione senza ads.
            </Text>
            <TextInput
              value={codeInput}
              onChangeText={setCodeInput}
              placeholder="Codice"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={{ backgroundColor: colors.inputBg, color: colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, marginBottom: 14 }}
              onSubmitEditing={submitCode}
              testID="premium-code-input"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => setShowCodeModal(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.inputBg }}>
                <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '500' }}>{T('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitCode} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent }} testID="premium-code-submit">
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Conferma</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
