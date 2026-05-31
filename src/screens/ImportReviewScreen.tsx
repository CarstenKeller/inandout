import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  getCategories, addCategory, updateCategoryKeywords, bulkInsertCategorized,
} from '../database/queries';
import { Category, ImportedTransaction, ImportStackParamList } from '../types';
import { getImportSession, clearImportSession } from '../services/importSession';
import { matchAll, suggestKeywords } from '../services/categoryMatcher';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
  income: '#4CAF50', expense: '#F44336',
};

const PRESET_COLORS = [
  '#4CAF50', '#F44336', '#FF9800', '#2196F3', '#9C27B0',
  '#00BCD4', '#607D8B', '#9E9E9E', '#E91E63', '#FF5722',
];

type NavProp = NativeStackNavigationProp<ImportStackParamList, 'ImportReview'>;
type RouteProps = RouteProp<ImportStackParamList, 'ImportReview'>;

const formatCurrency = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function ImportReviewScreen() {
  const navigation = useNavigation<NavProp>();
  const { autoCount } = useRoute<RouteProps>().params;

  const session = getImportSession();
  // Queue-based approach: remaining[0] is always the current item
  const initialCount = useRef((session?.reviewItems ?? []).length).current;
  const [remaining, setRemaining] = useState<ImportedTransaction[]>(
    () => (session?.reviewItems ?? []).map(r => r.tx)
  );
  const [extraAutoItems, setExtraAutoItems] = useState<Array<{ tx: ImportedTransaction; categoryId: number }>>([]);
  const [results, setResults] = useState<Array<{ tx: ImportedTransaction; categoryId: number | null }>>([]);
  const [lastAutoGain, setLastAutoGain] = useState(0); // how many were auto-matched in last step

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [kwChanges, setKwChanges] = useState<Record<number, string>>({});
  const [kwInput, setKwInput] = useState('');

  // New category inline form
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);

  const [importing, setImporting] = useState(false);

  useFocusEffect(useCallback(() => {
    getCategories().then(setCategories);
  }, []));

  // ── Keywords helpers ──────────────────────────────────────────────────────

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

  // ── Proceed (assign or skip) ───────────────────────────────────────────────

  const proceed = (catId: number | null) => {
    if (remaining.length === 0) return;
    const [current, ...rest] = remaining;

    let newExtra: Array<{ tx: ImportedTransaction; categoryId: number }> = [];
    let newRemaining = rest;

    // Re-match remaining items against accumulated keywords whenever we assigned a category
    if (catId !== null && rest.length > 0) {
      const mergedCats = categories.map(c => ({
        ...c,
        keywords: kwChanges[c.id] !== undefined ? kwChanges[c.id] : (c.keywords ?? ''),
      }));
      const rematched = matchAll(rest, mergedCats);
      newExtra = rematched
        .filter(r => r.categoryId !== null)
        .map(r => ({ tx: r.tx, categoryId: r.categoryId! }));
      newRemaining = rematched.filter(r => r.categoryId === null).map(r => r.tx);
    }

    setResults(prev => [...prev, { tx: current, categoryId: catId }]);
    setExtraAutoItems(prev => [...prev, ...newExtra]);
    setRemaining(newRemaining);
    setLastAutoGain(newExtra.length);
    setSelectedCatId(null);
    setKwInput('');
    setShowNewCat(false);
    setNewCatName('');
  };

  // ── Create new category inline ────────────────────────────────────────────

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    const current = remaining[0];
    const id = await addCategory({
      name: newCatName.trim(),
      color: newCatColor,
      icon: 'ellipsis-horizontal',
      type: current?.type ?? 'both',
      keywords: '',
    });
    const updated = await getCategories();
    setCategories(updated);
    setSelectedCatId(id);
    setShowNewCat(false);
    setNewCatName('');
  };

  // ── Final import ──────────────────────────────────────────────────────────

  const handleImport = async () => {
    setImporting(true);
    try {
      for (const [catIdStr, keywords] of Object.entries(kwChanges)) {
        await updateCategoryKeywords(Number(catIdStr), keywords);
      }
      const allAutoItems = [...(session?.autoItems ?? []), ...extraAutoItems];
      const manualItems = results
        .filter(r => r.categoryId !== null)
        .map(r => ({ tx: r.tx, categoryId: r.categoryId! }));
      const count = await bulkInsertCategorized([...allAutoItems, ...manualItems]);
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

  // ── Summary screen ────────────────────────────────────────────────────────

  if (remaining.length === 0) {
    const totalAuto = autoCount + extraAutoItems.length;
    const manualCount = results.filter(r => r.categoryId !== null).length;
    const skippedCount = results.filter(r => r.categoryId === null).length;
    const total = totalAuto + manualCount;

    return (
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryTitle}>Bereit zum Importieren</Text>
        <View style={styles.summaryCard}>
          <SummaryRow label="Automatisch erkannt" value={totalAuto} color={DARK.income} />
          <SummaryRow label="Manuell zugeordnet" value={manualCount} color={DARK.accent} />
          {skippedCount > 0 && <SummaryRow label="Übersprungen" value={skippedCount} color={DARK.subtext} />}
          <View style={styles.divider} />
          <SummaryRow label="Gesamt" value={total} color={DARK.text} bold />
        </View>
        <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
          <Text style={styles.importBtnText}>{total} Buchungen importieren</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Review screen ─────────────────────────────────────────────────────────

  const current = remaining[0];
  const processed = results.length + extraAutoItems.length;
  const displayTotal = processed + remaining.length;
  const visibleCats = categories.filter(c => c.type === 'both' || c.type === current.type);
  const suggestions = suggestKeywords(current.description);
  const selectedCat = categories.find(c => c.id === selectedCatId);
  const currentKwList = selectedCatId ? getKeywordList(selectedCatId) : [];
  const unusedSuggestions = suggestions.filter(s => !currentKwList.includes(s));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Progress */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>{processed + 1} von {displayTotal}</Text>
        {lastAutoGain > 0 && (
          <Text style={styles.autoGainBadge}>+{lastAutoGain} automatisch erkannt</Text>
        )}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, {
          width: `${Math.min(100, ((processed + 1) / Math.max(initialCount, 1)) * 100)}%` as any,
        }]} />
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
            style={[styles.catChip, selectedCatId === cat.id && { borderColor: cat.color, borderWidth: 2 }]}
            onPress={() => { setSelectedCatId(cat.id); setShowNewCat(false); }}
          >
            <View style={[styles.catDot, { backgroundColor: cat.color }]} />
            <Text style={styles.catText}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* New category button / inline form */}
      {!showNewCat ? (
        <TouchableOpacity style={styles.newCatBtn} onPress={() => { setShowNewCat(true); setSelectedCatId(null); }}>
          <Text style={styles.newCatBtnText}>+ Neue Kategorie anlegen</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.newCatForm}>
          <Text style={styles.label}>Name der neuen Kategorie</Text>
          <TextInput
            style={styles.newCatInput}
            value={newCatName}
            onChangeText={setNewCatName}
            placeholder="Kategoriename..."
            placeholderTextColor={DARK.subtext}
            autoFocus
          />
          <Text style={styles.label}>Farbe</Text>
          <View style={styles.colorRow}>
            {PRESET_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, newCatColor === c && styles.colorSelected]}
                onPress={() => setNewCatColor(c)}
              />
            ))}
          </View>
          <View style={styles.newCatActions}>
            <TouchableOpacity style={styles.newCatCancelBtn} onPress={() => setShowNewCat(false)}>
              <Text style={styles.newCatCancelText}>Abbrechen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.newCatSaveBtn} onPress={handleCreateCategory}>
              <Text style={styles.newCatSaveText}>Anlegen & auswählen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Keywords section — shown when a category is selected */}
      {selectedCatId !== null && (
        <View style={styles.kwSection}>
          <Text style={styles.label}>Stichworte für „{selectedCat?.name}"</Text>
          <Text style={styles.kwHint}>
            Buchungen, die eines dieser Stichworte enthalten, werden beim nächsten Import automatisch dieser Kategorie zugeordnet.
          </Text>

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

          {unusedSuggestions.length > 0 && (
            <>
              <Text style={styles.sublabel}>Vorschläge aus Beschreibung (antippen zum Hinzufügen):</Text>
              <View style={styles.chipRow}>
                {unusedSuggestions.map(s => (
                  <TouchableOpacity key={s} style={styles.suggestionChip} onPress={() => addKeyword(s)}>
                    <Text style={styles.suggestionText}>+ {s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={styles.kwInputRow}>
            <TextInput
              style={styles.kwInput}
              value={kwInput}
              onChangeText={setKwInput}
              placeholder="Eigenes Stichwort..."
              placeholderTextColor={DARK.subtext}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => { addKeyword(kwInput); setKwInput(''); }}
            />
            <TouchableOpacity style={styles.kwAddBtn} onPress={() => { addKeyword(kwInput); setKwInput(''); }}>
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

function SummaryRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: '700', color: DARK.text }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }, bold && { fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' },

  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressText: { color: DARK.text, fontWeight: '600', fontSize: 14 },
  autoGainBadge: { color: DARK.income, fontSize: 12, fontWeight: '600' },
  progressTrack: { height: 4, backgroundColor: DARK.surface, borderRadius: 2, marginBottom: 20 },
  progressFill: { height: 4, backgroundColor: DARK.accent, borderRadius: 2 },

  txCard: { backgroundColor: DARK.surface, borderRadius: 12, padding: 14, marginBottom: 20 },
  txHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  typeDot: { width: 10, height: 10, borderRadius: 5 },
  txAmount: { fontSize: 18, fontWeight: '700', flex: 1 },
  txDate: { color: DARK.subtext, fontSize: 12 },
  txDesc: { color: DARK.text, fontSize: 13, lineHeight: 18 },

  label: { color: DARK.subtext, fontSize: 12, marginBottom: 8, marginTop: 4 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DARK.surface,
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12,
    borderColor: 'transparent', borderWidth: 2,
  },
  catDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  catText: { color: DARK.text, fontSize: 13 },

  newCatBtn: {
    marginTop: 8, paddingVertical: 8, alignItems: 'center',
    borderWidth: 1, borderColor: DARK.card, borderRadius: 20, borderStyle: 'dashed',
  },
  newCatBtnText: { color: DARK.subtext, fontSize: 13 },
  newCatForm: {
    backgroundColor: DARK.surface, borderRadius: 12, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: DARK.accent,
  },
  newCatInput: {
    backgroundColor: DARK.card, color: DARK.text, borderRadius: 8,
    padding: 10, fontSize: 14, marginBottom: 4,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  colorDot: { width: 26, height: 26, borderRadius: 13 },
  colorSelected: { borderWidth: 3, borderColor: '#fff' },
  newCatActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  newCatCancelBtn: { padding: 8 },
  newCatCancelText: { color: DARK.subtext, fontSize: 14 },
  newCatSaveBtn: { backgroundColor: DARK.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  newCatSaveText: { color: '#000', fontWeight: '700', fontSize: 14 },

  kwSection: { backgroundColor: DARK.surface, borderRadius: 12, padding: 14, marginTop: 12 },
  kwHint: { color: DARK.subtext, fontSize: 11, marginBottom: 8, lineHeight: 16, fontStyle: 'italic' },
  sublabel: { color: DARK.subtext, fontSize: 11, marginTop: 8, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  kwChip: {
    flexDirection: 'row', backgroundColor: '#2A1F4A', borderRadius: 12,
    paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: DARK.accent,
  },
  kwChipText: { color: DARK.accent, fontSize: 12 },
  kwRemove: { color: DARK.accent, fontSize: 12 },
  suggestionChip: { backgroundColor: DARK.card, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  suggestionText: { color: DARK.subtext, fontSize: 12 },
  kwInputRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  kwInput: {
    flex: 1, backgroundColor: DARK.card, color: DARK.text,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
  },
  kwAddBtn: { backgroundColor: DARK.accent, borderRadius: 8, width: 40, alignItems: 'center', justifyContent: 'center' },
  kwAddBtnText: { color: '#000', fontSize: 20, fontWeight: '700' },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  skipBtn: { flex: 1, backgroundColor: DARK.surface, borderRadius: 12, padding: 14, alignItems: 'center' },
  skipBtnText: { color: DARK.subtext, fontWeight: '600' },
  nextBtn: { flex: 2, backgroundColor: DARK.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: '#4A3A6A', opacity: 0.6 },
  nextBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },

  summaryContainer: { flex: 1, backgroundColor: DARK.bg, padding: 24, justifyContent: 'center' },
  summaryTitle: { color: DARK.text, fontSize: 22, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  summaryCard: { backgroundColor: DARK.surface, borderRadius: 14, padding: 16, marginBottom: 24 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  summaryLabel: { color: DARK.subtext, fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: DARK.card, marginVertical: 4 },
  importBtn: { backgroundColor: DARK.accent, borderRadius: 14, padding: 18, alignItems: 'center' },
  importBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
