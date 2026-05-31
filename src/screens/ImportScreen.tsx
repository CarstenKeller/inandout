import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getCategories } from '../database/queries';
import { ImportStackParamList } from '../types';
import { parseINGCsv } from '../services/csvParser';
import { parseINGPdf } from '../services/pdfParser';
import { matchAll } from '../services/categoryMatcher';
import { setImportSession } from '../services/importSession';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', text: '#FFFFFF',
  subtext: '#AAAAAA', accent: '#BB86FC',
};

type NavProp = NativeStackNavigationProp<ImportStackParamList, 'ImportMain'>;

export default function ImportScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(false);

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

      if (parsed.length === 0) {
        Alert.alert('Info', 'Keine Buchungen gefunden');
        return;
      }

      const categories = await getCategories();
      const results = matchAll(parsed, categories);

      const autoItems = results
        .filter(r => r.categoryId !== null)
        .map(r => ({ tx: r.tx, categoryId: r.categoryId! }));
      const reviewItems = results
        .filter(r => r.categoryId === null)
        .map(r => ({ tx: r.tx }));

      setImportSession({ autoItems, reviewItems });
      navigation.navigate('ImportReview', {
        autoCount: autoItems.length,
        reviewCount: reviewItems.length,
      });
    } catch (e: unknown) {
      Alert.alert('Fehler', e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={loading}>
        {loading
          ? <ActivityIndicator color={DARK.accent} />
          : <Text style={styles.pickBtnText}>CSV oder PDF auswählen</Text>
        }
      </TouchableOpacity>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>So funktioniert der Import</Text>
        <Text style={styles.infoText}>
          {'1. Buchungen werden anhand von Stichworten automatisch kategorisiert.\n\n'}
          {'2. Nicht erkannte Buchungen kannst du manuell zuordnen und dabei Stichworte für die Kategorie festlegen.\n\n'}
          {'3. Beim nächsten Import werden diese Buchungen automatisch erkannt.'}
        </Text>
      </View>
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
  infoCard: {
    backgroundColor: DARK.surface, borderRadius: 12, padding: 16, marginTop: 24,
  },
  infoTitle: { color: DARK.text, fontWeight: '600', fontSize: 14, marginBottom: 10 },
  infoText: { color: DARK.subtext, fontSize: 13, lineHeight: 20 },
});
