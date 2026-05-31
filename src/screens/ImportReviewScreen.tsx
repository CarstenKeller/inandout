import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getCategories, updateCategoryKeywords, bulkInsertCategorized } from '../database/queries';
import { Category, ImportedTransaction, ImportStackParamList } from '../types';
import { getImportSession, clearImportSession } from '../services/importSession';
import { suggestKeywords } from '../services/categoryMatcher';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
  income: '#4CAF50', expense: '#F44336',
};

type NavProp = NativeStackNavigationProp<ImportStackParamList, 'ImportReview'>;
type RouteProps = RouteProp<ImportStackParamList, 'ImportReview'>;

const formatCurrency = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function ImportReviewScreen() {
  const navigation = useNavigation<NavProp>();
  const { autoCount, reviewCount } = useRoute<RouteProps>().params;

  const session = getImportSession();
  const reviewItems = session?.reviewItems ?? [];

  const [index, setIndex] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [kwChanges, setKwChanges] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Array<{ tx: ImportedTransaction; categoryId: number | null }>>([]);
  const [kwInput, setKwInput] = useState('');
  const [importing, setImporting] = useState(false);

  useFocusEffect(useCallback(() => {
    getCategories().then(setCategories);
  }, []));

  const getKeywordsFor = (catId: number): string => {
    if (kwChanges[catId] !== undefined) return kwChanges[catId];
    return categories.find(c => c.id === catId)?.keywords ?? '';
  };

  const getKeywordList = (catId: number): string[] =>
    getKeywordsFor(catId).split(',').map(k => k.trim()).filter(Boolean);

  const addKeyword = (kw: string) => {
    if (!selectedCatId || !kw.trim()) return;
    const clean = kw.trim().toLowerCase();
    const existing = getKeywordList(selectedCatId);
    if (!existing.includes(clean)) {
      setKwChanges(prev => ({
        ...prev,
        [selectedCatId]: [...existing, clean].join(', '),
      }));
    }
  };

  const removeKeyword = (kw: string) => {
    if (!selectedCatId) return;
    const updated = getKeywordList(selectedCatId).filter(k => k !== kw);
    setKwChanges(prev => ({ ...prev, [selectedCatId]: updated.join(', ') }));
  };

  const proceed = (catId: number | null) => {
    if (!reviewItems[index]) return;
    setResults(prev => [...prev, { tx: reviewItems[index].tx, categoryId: catId }]);
    setSelectedCatId(null);
    setKwInput('');
    setIndex(i => i + 1);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      for (const [catIdStr, keywords] of Object.entries(kwChanges)) {
        await updateCategoryKeywords(Number(catIdStr), keywords);
      }

      const autoItems = session?.autoItems ?? [];
      const manualItems = results
        .filter(r => r.categoryId !== null)
        .map(r => ({ tx: r.tx, categoryId: r.categoryId! }));

      const count = await bulkInsertCategorized([...autoItems, ...manualItems]);
      clearImportSession();
      Alert.alert(
        'Fertig',
        `${count} neue Buchungen importiert (Duplikate übersprungen)`,
        [{ text: 'OK', onPress: () => navigation.navigate('ImportMain') }]
      );
    } catch (e: unknown) {
      Alert.alert('Fehler', e instanceof Error ? e.message : 'Unbekannter Fehler');
      setImporting(false);
    }
  };

  if (importing) {
    return <View style={styles.center}><ActivityIndicator color={DARK.accent} size="large" /></View>;
  }

  // Summary screen — shown when all review items are processed
  const done = index >= reviewItems.length;
  if (done) {
    const manualCount = results.filter(r => r.categoryId !== null).length;
    const skippedCount = results.filter(r => r.categoryId === null).length;
    const total = autoCount + manualCount;

    return (
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryTitle}>Bereit zum Importieren</Text>

        <View style={styles.summaryCard}>
          <Row label="Automatisch erkannt" value={autoCount} color={DARK.income} />
          <Row label="Manuell zugeordnet" value={manualCount} color={DARK.accent} />
          {skippedCount > 0 && <Row label="Übersprungen" value={skippedCount} color={DARK.subtext} />}
          <View style={styles.divider} />
          <Row label="Gesamt" value={total} color={DARK.text} bold />
        </View>

        <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
          <Text style={styles.importBtnText}>{total} Buchungen importieren</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const current = reviewItems[index].tx;
  const visibleCats = categories.filter(c => c.type === 'both' || c.type === current.type);
  const suggestions = suggestKeywords(current.description);
  const selectedCat = categories.find(c => c.id === selectedCatId);
  const currentKwList = selectedCatId ? getKeywordList(selectedCatId) : [];
  const unusedSuggestions = suggestions.filter(s => !currentKwList.includes(s));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Progress */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>{index + 1} von {reviewCount}</Text>
        {autoCount > 0 && (
          <Text style={styles.progressSub}>+ {autoCount} auto</Text>
        )}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / reviewCount) * 100}%` as any }]} />
      </View>

      {/* Transaction card */}
      <View style={styles.txCard}>
        <View style={styles.txHeader}>
          <View style={[styles.typeDot, { backgroundColor: current.type === 'income' ? DARK.income : DARK.expense }]} />
          <Text style={[styles.txAmount, { color: current.type === 'income' ? DARK.income : DARK.expense }]}>
            {current.type === 'expense' ? '–' : '+'}{formatCurrency(current.amount)}
          </Text>
          <Text style={styles.txDate}>{current.date}</Text>
        </View>
        <Text style={styles.txDesc}>{current.description}</Text>
      </View>

      {/* Category picker */}
      <Text style={styles.label}>
        Kategorie ({current.type === 'income' ? 'Einnahmen' : 'Ausgaben'})
      </Text>
      <View style={styles.catGrid}>
        {visibleCats.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.catChip,
              selectedCatId === cat.id && { borderColor: cat.color, borderWidth: 2 },
            ]}
            onPress={() => setSelectedCatId(cat.id)}
          >
            <View style={[styles.catDot, { backgroundColor: cat.color }]} />
            <Text style={styles.catText}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Keywords section */}
      {selectedCatId !== null && (
        <View style={styles.kwSection}>
          <Text style={styles.label}>Stichworte für „{selectedCat?.name}"</Text>

          {/* Current keywords — tap to remove */}
          {currentKwList.length > 0 && (
            <View style={styles.chipRow}>
              {currentKwList.map(kw => (
                <TouchableOpacity key={kw} style={styles.kwChip} onPress={() => removeKeyword(kw)}>
                  <Text style={styles.kwChipText}>{kw}</Text>
                  <Text style={styles.kwRemove}> ×</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Word suggestions from description */}
          {unusedSuggestions.length > 0 && (
            <>
              <Text style={styles.sublabel}>Vorschläge aus Beschreibung:</Text>
              <View style={styles.chipRow}>
                {unusedSuggestions.map(s => (
                  <TouchableOpacity key={s} style={styles.suggestionChip} onPress={() => addKeyword(s)}>
                    <Text style={styles.suggestionText}>+ {s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Manual keyword input */}
          <View style={styles.kwInputRow}>
            <TextInput
              style={styles.kwInput}
              value={kwInput}
              onChangeText={setKwInput}
              placeholder="Eigenes Stichwort..."
              placeholderTextColor={DARK.subtext}
              returnKeyType="done"
              onSubmitEditing={() => { addKeyword(kwInput); setKwInput(''); }}
            />
            <TouchableOpacity
              style={styles.kwAddBtn}
              onPress={() => { addKeyword(kwInput); setKwInput(''); }}
            >
              <Text style={styles.kwAddBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.skipBtn} onPress={() => proceed(null)}>
          <Text style={styles.skipBtnText}>Überspringen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextBtn, !selectedCatId && styles.nextBtnDisabled]}
          onPress={() => proceed(selectedCatId)}
          disabled={!selectedCatId}
        >
          <Text style={styles.nextBtnText}>Zuordnen →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Row({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: '700', color: DARK.text }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }, bold && { fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' },

  // Progress
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressText: { color: DARK.text, fontWeight: '600', fontSize: 14 },
  progressSub: { color: DARK.income, fontSize: 12 },
  progressTrack: { height: 4, backgroundColor: DARK.surface, borderRadius: 2, marginBottom: 20 },
  progressFill: { height: 4, backgroundColor: DARK.accent, borderRadius: 2 },

  // Transaction card
  txCard: { backgroundColor: DARK.surface, borderRadius: 12, padding: 14, marginBottom: 20 },
  txHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  typeDot: { width: 10, height: 10, borderRadius: 5 },
  txAmount: { fontSize: 18, fontWeight: '700', flex: 1 },
  txDate: { color: DARK.subtext, fontSize: 12 },
  txDesc: { color: DARK.text, fontSize: 13, lineHeight: 18 },

  // Category
  label: { color: DARK.subtext, fontSize: 12, marginBottom: 8, marginTop: 4 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DARK.surface,
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12,
    borderColor: 'transparent', borderWidth: 2,
  },
  catDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  catText: { color: DARK.text, fontSize: 13 },

  // Keywords
  kwSection: { backgroundColor: DARK.surface, borderRadius: 12, padding: 14, marginTop: 8 },
  sublabel: { color: DARK.subtext, fontSize: 11, marginTop: 8, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  kwChip: {
    flexDirection: 'row', backgroundColor: '#2A1F4A', borderRadius: 12,
    paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: DARK.accent,
  },
  kwChipText: { color: DARK.accent, fontSize: 12 },
  kwRemove: { color: DARK.accent, fontSize: 12 },
  suggestionChip: {
    backgroundColor: DARK.card, borderRadius: 12,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  suggestionText: { color: DARK.subtext, fontSize: 12 },
  kwInputRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  kwInput: {
    flex: 1, backgroundColor: DARK.card, color: DARK.text,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
  },
  kwAddBtn: {
    backgroundColor: DARK.accent, borderRadius: 8,
    width: 40, alignItems: 'center', justifyContent: 'center',
  },
  kwAddBtnText: { color: '#000', fontSize: 20, fontWeight: '700' },

  // Action buttons
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  skipBtn: {
    flex: 1, backgroundColor: DARK.surface, borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  skipBtnText: { color: DARK.subtext, fontWeight: '600' },
  nextBtn: {
    flex: 2, backgroundColor: DARK.accent, borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: '#4A3A6A', opacity: 0.6 },
  nextBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },

  // Summary
  summaryContainer: {
    flex: 1, backgroundColor: DARK.bg, padding: 24,
    justifyContent: 'center',
  },
  summaryTitle: { color: DARK.text, fontSize: 22, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  summaryCard: { backgroundColor: DARK.surface, borderRadius: 14, padding: 16, marginBottom: 24 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  summaryLabel: { color: DARK.subtext, fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: DARK.card, marginVertical: 4 },
  importBtn: {
    backgroundColor: DARK.accent, borderRadius: 14, padding: 18, alignItems: 'center',
  },
  importBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
