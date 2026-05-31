import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, FlatList,
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
} from '../database/queries';
import { ImportStackParamList, ImportSessionRecord } from '../types';
import { parseINGCsvContent } from '../services/csvParser';
import { parseINGPdfFromBase64 } from '../services/pdfParser';
import { matchAll } from '../services/categoryMatcher';
import { hashFileContent } from '../services/fileHash';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
  income: '#4CAF50', expense: '#F44336', warn: '#FFB74D',
};

type NavProp = NativeStackNavigationProp<ImportStackParamList, 'ImportMain'>;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function ImportScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ImportSessionRecord[]>([]);

  useFocusEffect(useCallback(() => {
    setSessions(getImportSessions());
  }, []));

  const doImport = async (uri: string, name: string, isPdf: boolean) => {
    setLoading(true);
    try {
      // Read file
      const content = isPdf
        ? await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const })
        : await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });

      const fileHash = hashFileContent(content);

      // Duplicate check
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

    // Create session
    const sessionId = createImportSession(filename, fileHash, parsed.length);

    // Insert all items — auto-matched go directly to transactions
    bulkInsertImportItems(
      sessionId,
      matched.map(r => ({
        tx: r.tx,
        status: r.categoryId !== null ? 'auto' : 'pending',
        categoryId: r.categoryId,
      }))
    );
    updateSessionCounts(sessionId);
    setSessions(getImportSessions());

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
          onPress: () => { deleteImportSession(session.id); setSessions(getImportSessions()); },
        },
        {
          text: `Mit ${imported} Buchungen`, style: 'destructive',
          onPress: () => { deleteImportSessionWithTransactions(session.id); setSessions(getImportSessions()); },
        },
      ]
    );
  };

  const pendingCount = (s: ImportSessionRecord) =>
    s.total_count - s.auto_count - s.assigned_count - s.skipped_count;

  const isComplete = (s: ImportSessionRecord) => pendingCount(s) <= 0;

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg, padding: 16 },
  pickBtn: {
    backgroundColor: DARK.surface, borderRadius: 12, padding: 18,
    alignItems: 'center', minHeight: 60, justifyContent: 'center',
  },
  pickBtnText: { color: DARK.accent, fontWeight: '600', fontSize: 16 },
  sectionTitle: { color: DARK.subtext, fontSize: 12, marginTop: 24, marginBottom: 8, fontWeight: '600' },
  sessionCard: {
    backgroundColor: DARK.surface, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  sessionTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sessionName: { flex: 1, color: DARK.text, fontSize: 14, fontWeight: '500' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  sessionMeta: { gap: 2 },
  sessionDate: { color: DARK.subtext, fontSize: 12 },
  sessionStats: { color: DARK.subtext, fontSize: 11, marginTop: 1 },
  resumeRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: DARK.card, paddingTop: 8 },
  resumeHint: { color: DARK.accent, fontSize: 12 },
  emptyHint: { color: DARK.subtext, fontSize: 13, marginTop: 20, lineHeight: 20 },
});
