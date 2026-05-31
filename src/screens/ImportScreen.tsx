import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, FlatList, Modal, TextInput, ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  getCategories,
  createImportSession, findSessionByHash, getImportSessions,
  bulkInsertImportItems, updateSessionCounts,
  deleteImportSession, deleteImportSessionWithTransactions,
  getAccounts, createAccount,
  getUnlinkedTransactionCount, migrateTransactionsToAccount,
} from '../database/queries';
import { ImportStackParamList, ImportSessionRecord, Account } from '../types';
import { parseINGCsvContent } from '../services/csvParser';
import { parseINGPdfFromBase64 } from '../services/pdfParser';
import { matchAll } from '../services/categoryMatcher';
import { hashFileContent } from '../services/fileHash';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
  income: '#4CAF50', expense: '#F44336', warn: '#FFB74D',
};

const ACCOUNT_COLORS = ['#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0', '#607D8B'];

type NavProp = NativeStackNavigationProp<ImportStackParamList, 'ImportMain'>;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function ImportScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ImportSessionRecord[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountIban, setNewAccountIban] = useState('');
  const [newAccountColor, setNewAccountColor] = useState(ACCOUNT_COLORS[0]);

  const reloadData = useCallback(() => {
    const accs = getAccounts();
    setAccounts(accs);
    setSelectedAccountId(prev => {
      if (prev !== null && accs.some(a => a.id === prev)) return prev;
      return accs.length > 0 ? accs[0].id : null;
    });
    setSessions(getImportSessions());
  }, []);

  useFocusEffect(useCallback(() => { reloadData(); }, [reloadData]));

  const handleCreateAccount = () => {
    if (!newAccountName.trim()) return;
    const isFirst = accounts.length === 0;
    const id = createAccount(newAccountName.trim(), newAccountColor, newAccountIban.trim() || undefined);

    const finish = () => {
      reloadData();
      setSelectedAccountId(id);
      setShowNewAccountModal(false);
      setNewAccountName('');
      setNewAccountIban('');
      setNewAccountColor(ACCOUNT_COLORS[0]);
    };

    if (isFirst) {
      const unlinked = getUnlinkedTransactionCount();
      if (unlinked > 0) {
        Alert.alert(
          'Bestehende Buchungen',
          `${unlinked} bereits importierte Buchungen haben kein Konto. Sollen sie "${newAccountName.trim()}" zugewiesen werden?`,
          [
            { text: 'Nein', onPress: finish },
            { text: 'Ja, zuweisen', onPress: () => { migrateTransactionsToAccount(id); finish(); } },
          ]
        );
        return;
      }
    }
    finish();
  };

  const doImport = async (uri: string, name: string, isPdf: boolean) => {
    if (!selectedAccountId) {
      Alert.alert('Kein Konto', 'Bitte zuerst ein Konto auswählen oder anlegen.');
      return;
    }
    setLoading(true);
    try {
      const content = isPdf
        ? await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const })
        : await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });

      const fileHash = hashFileContent(content);

      const existing = findSessionByHash(fileHash);
      if (existing) {
        Alert.alert(
          'Datei bereits importiert',
          `Diese Datei wurde bereits am ${formatDate(existing.imported_at)} importiert.\n\nDateiname: ${existing.filename}`,
          [
            { text: 'Abbrechen', style: 'cancel' },
            {
              text: 'Trotzdem fortfahren', style: 'destructive',
              onPress: () => processFile(content, name, fileHash, isPdf),
            },
          ]
        );
        return;
      }

      await processFile(content, name, fileHash, isPdf);
    } catch (e: unknown) {
      Alert.alert('Fehler', e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  };

  const processFile = async (
    content: string, filename: string, fileHash: string, isPdf: boolean
  ) => {
    const parsed = isPdf
      ? parseINGPdfFromBase64(content)
      : parseINGCsvContent(content);

    if (parsed.length === 0) {
      Alert.alert('Info', 'Keine Buchungen gefunden');
      return;
    }

    const categories = await getCategories();
    const matched = matchAll(parsed, categories);

    const sessionId = createImportSession(filename, fileHash, parsed.length, selectedAccountId);

    bulkInsertImportItems(
      sessionId,
      matched.map(r => ({
        tx: r.tx,
        status: r.categoryId !== null ? 'auto' : 'pending',
        categoryId: r.categoryId,
      }))
    );
    updateSessionCounts(sessionId);
    reloadData();

    navigation.navigate('ImportReview', { sessionId });
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/pdf'],
    });
    if (result.canceled || !result.assets?.[0]) return;
    const { uri, mimeType, name } = result.assets[0];
    const isPdf = mimeType === 'application/pdf' || name?.endsWith('.pdf');
    await doImport(uri, name ?? 'Unbekannte Datei', isPdf);
  };

  const handleDelete = (session: ImportSessionRecord) => {
    const imported = session.auto_count + session.assigned_count;
    Alert.alert(
      'Import löschen',
      `"${session.filename}"\n\n${imported > 0 ? `${imported} Buchungen wurden aus diesem Import übernommen.` : 'Keine Buchungen wurden importiert.'}`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Nur Session',
          onPress: () => { deleteImportSession(session.id); reloadData(); },
        },
        {
          text: `Mit ${imported} Buchungen`, style: 'destructive',
          onPress: () => { deleteImportSessionWithTransactions(session.id); reloadData(); },
        },
      ]
    );
  };

  const pendingCount = (s: ImportSessionRecord) =>
    s.total_count - s.auto_count - s.assigned_count - s.skipped_count;

  const isComplete = (s: ImportSessionRecord) => pendingCount(s) <= 0;

  return (
    <View style={styles.container}>
      {/* Account selector */}
      <Text style={styles.sectionLabel}>Konto für Import</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.accountRow}
      >
        {accounts.map(acc => (
          <TouchableOpacity
            key={acc.id}
            style={[
              styles.accountChip,
              selectedAccountId === acc.id && { borderColor: acc.color, backgroundColor: acc.color + '22' },
            ]}
            onPress={() => setSelectedAccountId(acc.id)}
          >
            <View style={[styles.accountDot, { backgroundColor: acc.color }]} />
            <Text style={[
              styles.accountChipText,
              selectedAccountId === acc.id && { color: acc.color, fontWeight: '700' },
            ]}>
              {acc.name}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.accountChipAdd} onPress={() => setShowNewAccountModal(true)}>
          <Text style={styles.accountChipAddText}>+ Neu</Text>
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={loading}>
        {loading
          ? <ActivityIndicator color={DARK.accent} />
          : <Text style={styles.pickBtnText}>CSV oder PDF auswählen</Text>
        }
      </TouchableOpacity>

      {sessions.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Import-Verlauf</Text>
          <FlatList
            data={sessions}
            keyExtractor={s => String(s.id)}
            style={{ flex: 1 }}
            renderItem={({ item }) => {
              const pc = pendingCount(item);
              const complete = isComplete(item);
              const acc = accounts.find(a => a.id === item.account_id);
              return (
                <TouchableOpacity
                  style={styles.sessionCard}
                  onPress={() => navigation.navigate('ImportReview', { sessionId: item.id })}
                  onLongPress={() => handleDelete(item)}
                >
                  <View style={styles.sessionTop}>
                    <Text style={styles.sessionName} numberOfLines={1}>{item.filename}</Text>
                    <View style={[styles.badge, { backgroundColor: complete ? '#1B3A1B' : '#3A2A00' }]}>
                      <Text style={[styles.badgeText, { color: complete ? DARK.income : DARK.warn }]}>
                        {complete ? '✓ Vollständig' : `${pc} ausstehend`}
                      </Text>
                    </View>
                  </View>
                  {acc && (
                    <View style={styles.sessionAccountRow}>
                      <View style={[styles.accountDot, { backgroundColor: acc.color }]} />
                      <Text style={styles.sessionAccountName}>{acc.name}</Text>
                    </View>
                  )}
                  <View style={styles.sessionMeta}>
                    <Text style={styles.sessionDate}>{formatDate(item.imported_at)}</Text>
                    <Text style={styles.sessionStats}>
                      {item.total_count} Buchungen · {item.auto_count} auto · {item.assigned_count} manuell
                      {item.skipped_count > 0 ? ` · ${item.skipped_count} übersprungen` : ''}
                    </Text>
                  </View>
                  {!complete && (
                    <View style={styles.resumeRow}>
                      <Text style={styles.resumeHint}>Antippen zum Fortsetzen</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}

      {sessions.length === 0 && !loading && (
        <Text style={styles.emptyHint}>
          Buchungen werden beim Import anhand von Kategorie-Stichworten automatisch zugeordnet.
          Nicht erkannte Buchungen kannst du manuell kategorisieren.
        </Text>
      )}

      {/* New Account Modal */}
      <Modal visible={showNewAccountModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Neues Konto</Text>
            <TextInput
              style={styles.input}
              placeholder="Name (z.B. Girokonto)"
              placeholderTextColor={DARK.subtext}
              value={newAccountName}
              onChangeText={setNewAccountName}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="IBAN (optional)"
              placeholderTextColor={DARK.subtext}
              value={newAccountIban}
              onChangeText={setNewAccountIban}
              autoCapitalize="characters"
            />
            <Text style={styles.colorLabel}>Farbe</Text>
            <View style={styles.colorRow}>
              {ACCOUNT_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    newAccountColor === c && styles.colorDotSelected,
                  ]}
                  onPress={() => setNewAccountColor(c)}
                />
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => {
                  setShowNewAccountModal(false);
                  setNewAccountName('');
                  setNewAccountIban('');
                  setNewAccountColor(ACCOUNT_COLORS[0]);
                }}
              >
                <Text style={styles.modalBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleCreateAccount}
              >
                <Text style={[styles.modalBtnText, { color: DARK.bg, fontWeight: '700' }]}>Erstellen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg, padding: 16 },
  sectionLabel: {
    color: DARK.subtext, fontSize: 11, fontWeight: '600',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  accountRow: { flexDirection: 'row', gap: 8, paddingBottom: 14, alignItems: 'center' },
  accountChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 16, backgroundColor: DARK.surface, borderWidth: 1, borderColor: 'transparent',
  },
  accountDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  accountChipText: { color: DARK.subtext, fontSize: 13 },
  accountChipAdd: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 16, backgroundColor: DARK.surface, borderWidth: 1, borderColor: DARK.accent + '66',
  },
  accountChipAddText: { color: DARK.accent, fontSize: 13 },
  pickBtn: {
    backgroundColor: DARK.surface, borderRadius: 12, padding: 18,
    alignItems: 'center', minHeight: 60, justifyContent: 'center',
  },
  pickBtnText: { color: DARK.accent, fontWeight: '600', fontSize: 16 },
  sectionTitle: { color: DARK.subtext, fontSize: 12, marginTop: 24, marginBottom: 8, fontWeight: '600' },
  sessionCard: {
    backgroundColor: DARK.surface, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  sessionTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sessionName: { flex: 1, color: DARK.text, fontSize: 14, fontWeight: '500' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  sessionAccountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sessionAccountName: { color: DARK.subtext, fontSize: 12 },
  sessionMeta: { gap: 2 },
  sessionDate: { color: DARK.subtext, fontSize: 12 },
  sessionStats: { color: DARK.subtext, fontSize: 11, marginTop: 1 },
  resumeRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: DARK.card, paddingTop: 8 },
  resumeHint: { color: DARK.accent, fontSize: 12 },
  emptyHint: { color: DARK.subtext, fontSize: 13, marginTop: 20, lineHeight: 20 },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalBox: { backgroundColor: DARK.surface, borderRadius: 16, padding: 24, width: '100%' },
  modalTitle: { color: DARK.text, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: DARK.card, borderRadius: 10, padding: 12,
    color: DARK.text, fontSize: 14, marginBottom: 12,
  },
  colorLabel: { color: DARK.subtext, fontSize: 12, marginBottom: 10 },
  colorRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: { borderWidth: 3, borderColor: '#FFFFFF' },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: DARK.card, alignItems: 'center',
  },
  modalBtnPrimary: { backgroundColor: DARK.accent },
  modalBtnText: { color: DARK.text, fontSize: 15 },
});
