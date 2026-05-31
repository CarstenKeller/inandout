import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getCategories, bulkInsertTransactions } from '../database/queries';
import { Category, ImportedTransaction } from '../types';
import { parseINGCsv } from '../services/csvParser';
import { parseINGPdf } from '../services/pdfParser';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', text: '#FFFFFF',
  subtext: '#AAAAAA', accent: '#BB86FC', income: '#4CAF50', expense: '#F44336',
};

export default function ImportScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [preview, setPreview] = useState<ImportedTransaction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getCategories().then(setCategories); }, []);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/pdf'],
    });
    if (result.canceled || !result.assets?.[0]) return;

    const { uri, mimeType, name } = result.assets[0];
    setLoading(true);
    try {
      const isPdf = mimeType === 'application/pdf' || name?.endsWith('.pdf');
      const parsed = isPdf ? await parseINGPdf(uri) : await parseINGCsv(uri);
      setPreview(parsed);
      if (parsed.length === 0) Alert.alert('Info', 'Keine Buchungen gefunden');
    } catch (e: unknown) {
      Alert.alert('Fehler', e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedCategory) {
      Alert.alert('Fehler', 'Bitte eine Standard-Kategorie wählen');
      return;
    }
    setLoading(true);
    try {
      const count = await bulkInsertTransactions(preview, selectedCategory);
      Alert.alert('Fertig', `${count} neue Buchungen importiert (Duplikate übersprungen)`);
      setPreview([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.pickBtn} onPress={pickFile}>
        <Text style={styles.pickBtnText}>CSV oder PDF auswählen</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator color={DARK.accent} style={{ marginTop: 20 }} />}

      {preview.length > 0 && (
        <>
          <Text style={styles.previewCount}>{preview.length} Buchungen gefunden</Text>

          <Text style={styles.label}>Standard-Kategorie</Text>
          <View style={styles.catRow}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.catChip,
                  selectedCategory === cat.id && { borderColor: cat.color, borderWidth: 2 },
                ]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                <Text style={styles.catText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={preview.slice(0, 10)}
            keyExtractor={(_, i) => String(i)}
            style={styles.previewList}
            renderItem={({ item }) => (
              <View style={styles.previewItem}>
                <Text style={styles.previewDesc} numberOfLines={1}>{item.description}</Text>
                <Text style={[styles.previewAmount, { color: item.type === 'income' ? DARK.income : DARK.expense }]}>
                  {item.type === 'expense' ? '-' : '+'}{item.amount.toFixed(2)} €
                </Text>
              </View>
            )}
          />
          {preview.length > 10 && (
            <Text style={styles.moreText}>... und {preview.length - 10} weitere</Text>
          )}

          <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
            <Text style={styles.importBtnText}>Importieren</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg, padding: 16 },
  pickBtn: { backgroundColor: DARK.surface, borderRadius: 12, padding: 18, alignItems: 'center' },
  pickBtnText: { color: DARK.accent, fontWeight: '600', fontSize: 16 },
  previewCount: { color: DARK.text, fontSize: 15, fontWeight: '600', marginTop: 20 },
  label: { color: DARK.subtext, fontSize: 12, marginTop: 14, marginBottom: 6 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DARK.surface,
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10,
    borderColor: 'transparent', borderWidth: 2,
  },
  catDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  catText: { color: DARK.text, fontSize: 12 },
  previewList: { marginTop: 12, maxHeight: 200 },
  previewItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: DARK.surface,
  },
  previewDesc: { flex: 1, color: DARK.text, fontSize: 13, marginRight: 8 },
  previewAmount: { fontSize: 13, fontWeight: '600' },
  moreText: { color: DARK.subtext, fontSize: 12, marginTop: 4 },
  importBtn: {
    backgroundColor: DARK.accent, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  importBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
