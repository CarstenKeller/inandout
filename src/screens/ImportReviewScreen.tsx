import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  getCategories, addCategory,
  updateCategoryKeywords, updateCategoryAmountRules,
  assignImportItem, updateSessionCounts,
  getPendingImportItems, getImportSessions,
} from '../database/queries';
import {
  Category, ImportItemRecord, ImportSessionRecord, ImportStackParamList,
} from '../types';
import { matchAll, suggestKeywords } from '../services/categoryMatcher';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
  income: '#4CAF50', expense: '#F44336',
};

const PRESET_COLORS = [
  '#4CAF50','#F44336','#FF9800','#2196F3','#9C27B0',
  '#00BCD4','#607D8B','#9E9E9E','#E91E63','#FF5722',
];

type NavProp = NativeStackNavigationProp<ImportStackParamList, 'ImportReview'>;
type RouteProps = RouteProp<ImportStackParamList, 'ImportReview'>;

const formatCurrency = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const toTx = (item: ImportItemRecord) => ({
  date: item.date, amount: item.amount, description: item.description,
  type: item.type, importHash: item.import_hash,
});

export default function ImportReviewScreen() {
  const navigation = useNavigation<NavProp>();
  const { sessionId } = useRoute<RouteProps>().params;

  const [pending, setPending] = useState<ImportItemRecord[]>([]);
  const [session, setSession] = useState<ImportSessionRecord | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [kwChanges, setKwChanges] = useState<Record<number, string>>({});
  const [kwInput, setKwInput] = useState('');
  const [amtRuleChanges, setAmtRuleChanges] = useState<Record<number, string>>({});
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);
  const [lastAutoGain, setLastAutoGain] = useState(0);
  const initialCount = useRef<number | null>(null);
  const kwChangesRef = useRef<Record<number, string>>({});
  const amtRuleChangesRef = useRef<Record<number, string>>({});

  const reload = useCallback(() => {
    const items = getPendingImportItems(sessionId);
    if (initialCount.current === null) initialCount.current = items.length;
    setPending(items);
    const all = getImportSessions();
    setSession(all.find(s => s.id === sessionId) ?? null);
    getCategories().then(setCategories);
  }, [sessionId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // ── Keywords helpers ──────────────────────────────────────────────────────

  const getKwList = (catId: number): string[] => {
    const raw = kwChangesRef.current[catId] !== undefined
      ? kwChangesRef.current[catId]
      : (categories.find(c => c.id === catId)?.keywords ?? '');
    return raw.split(',').map(k => k.trim()).filter(Boolean);
  };

  const addKw = (kw: string) => {
    if (!selectedCatId || !kw.trim()) return;
    const clean = kw.trim().toLowerCase();
    const existing = getKwList(selectedCatId);
    if (!existing.includes(clean)) {
      const updated = { ...kwChangesRef.current, [selectedCatId]: [...existing, clean].join(', ') };
      kwChangesRef.current = updated;
      setKwChanges({ ...updated });
    }
  };

  const removeKw = (kw: string) => {
    if (!selectedCatId) return;
    const updated = { ...kwChangesRef.current, [selectedCatId]: getKwList(selectedCatId).filter(k => k !== kw).join(', ') };
    kwChangesRef.current = updated;
    setKwChanges({ ...updated });
  };

  // ── Amount rules helpers ──────────────────────────────────────────────────

  const getAmtList = (catId: number): string[] => {
    const raw = amtRuleChangesRef.current[catId] !== undefined
      ? amtRuleChangesRef.current[catId]
      : (categories.find(c => c.id === catId)?.amount_rules ?? '');
    return raw.split(',').map(a => a.trim()).filter(Boolean);
  };

  const addAmtRule = (amount: number) => {
    if (!selectedCatId) return;
    const key = amount.toFixed(2);
    const existing = getAmtList(selectedCatId);
    if (!existing.includes(key)) {
      const updated = { ...amtRuleChangesRef.current, [selectedCatId]: [...existing, key].join(', ') };
      amtRuleChangesRef.current = updated;
      setAmtRuleChanges({ ...updated });
    }
  };

  const removeAmtRule = (key: string) => {
    if (!selectedCatId) return;
    const updated = { ...amtRuleChangesRef.current, [selectedCatId]: getAmtList(selectedCatId).filter(a => a !== key).join(', ') };
    amtRuleChangesRef.current = updated;
    setAmtRuleChanges({ ...updated });
  };

  // ── Assign or skip ────────────────────────────────────────────────────────

  const proceed = async (catId: number | null) => {
    if (pending.length === 0) return;
    const [current, ...rest] = pending;

    // Read from refs — always current regardless of React render cycle
    const finalKwChanges = { ...kwChangesRef.current };
    const rawInput = kwInput.trim();
    if (rawInput && catId !== null) {
      const clean = rawInput.toLowerCase();
      const base = finalKwChanges[catId] !== undefined
        ? finalKwChanges[catId]
        : (categories.find(c => c.id === catId)?.keywords ?? '');
      const existing = base.split(',').map(k => k.trim()).filter(Boolean);
      if (!existing.includes(clean)) {
        finalKwChanges[catId] = [...existing, clean].join(', ');
      }
    }

    const finalAmtChanges = { ...amtRuleChangesRef.current };

    // Clear refs and state before async work
    kwChangesRef.current = {};
    amtRuleChangesRef.current = {};
    setKwChanges({});
    setAmtRuleChanges({});
    setKwInput('');

    for (const [id, kw] of Object.entries(finalKwChanges)) {
      await updateCategoryKeywords(Number(id), kw);
    }
    for (const [id, rules] of Object.entries(finalAmtChanges)) {
      await updateCategoryAmountRules(Number(id), rules);
    }

    // Write to DB immediately
    assignImportItem(current, catId !== null ? 'assigned' : 'skipped', catId);

    // Always fetch fresh categories so the next transaction sees updated keywords
    const freshCats = await getCategories();
    setCategories(freshCats);

    // Re-match remaining with updated keywords
    let newPending = rest;
    let autoGain = 0;

    if (catId !== null && rest.length > 0) {
      const rematched = matchAll(rest.map(toTx), freshCats);

      for (const r of rematched) {
        if (r.categoryId !== null) {
          const item = rest.find(i => i.import_hash === r.tx.importHash);
          if (item) { assignImportItem(item, 'auto', r.categoryId); autoGain++; }
        }
      }
      newPending = rematched.filter(r => r.categoryId === null)
        .map(r => rest.find(i => i.import_hash === r.tx.importHash)!);
    }

    updateSessionCounts(sessionId);
    const all = getImportSessions();
    setSession(all.find(s => s.id === sessionId) ?? null);
    setPending(newPending);
    setLastAutoGain(autoGain);
    setSelectedCatId(null);
    setShowNewCat(false);
    setNewCatName('');
  };

  // ── Create new category ───────────────────────────────────────────────────

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    const current = pending[0];
    const id = await addCategory({
      name: newCatName.trim(), color: newCatColor,
      icon: 'ellipsis-horizontal', type: current?.type ?? 'both', keywords: '',
    });
    const updated = await getCategories();
    setCategories(updated);
    setSelectedCatId(id);
    setShowNewCat(false);
    setNewCatName('');
  };

  // ── Summary ───────────────────────────────────────────────────────────────

  if (pending.length === 0 && session !== null) {
    return (
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryTitle}>Import abgeschlossen</Text>
        <View style={styles.summaryCard}>
          <SRow label="Gefunden" value={session.total_count} color={DARK.text} />
          <SRow label="Automatisch erkannt" value={session.auto_count} color={DARK.income} />
          <SRow label="Manuell zugeordnet" value={session.assigned_count} color={DARK.accent} />
          {session.skipped_count > 0 &&
            <SRow label="Übersprungen" value={session.skipped_count} color={DARK.subtext} />}
          <View style={styles.divider} />
          <SRow
            label="Importiert"
            value={session.auto_count + session.assigned_count}
            color={DARK.income} bold
          />
        </View>
        <Text style={styles.summaryHint}>
          Alle Buchungen wurden sofort in die Datenbank übernommen.
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.navigate('ImportMain')}>
          <Text style={styles.doneBtnText}>Zurück zur Übersicht</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (pending.length === 0) {
    return <View style={styles.center}><ActivityIndicator color={DARK.accent} size="large" /></View>;
  }

  // ── Review ────────────────────────────────────────────────────────────────

  const current = pending[0];
  const processed = (session?.assigned_count ?? 0) + (session?.skipped_count ?? 0) + (session?.auto_count ?? 0) - (session ? session.total_count - (initialCount.current ?? session.total_count) - (session.auto_count) : 0);
  const total = initialCount.current ?? pending.length;
  const reviewedSoFar = total - pending.length;

  const visibleCats = categories.filter(c => c.type === 'both' || c.type === current.type);
  const selectedCat = categories.find(c => c.id === selectedCatId);
  const currentKwList = selectedCatId ? getKwList(selectedCatId) : [];
  const suggestions = suggestKeywords(current.description);
  const unusedSuggestions = suggestions.filter(s => !currentKwList.includes(s));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Progress */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>{reviewedSoFar + 1} von {total}</Text>
        {lastAutoGain > 0 && (
          <Text style={styles.autoGainBadge}>+{lastAutoGain} automatisch erkannt</Text>
        )}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, {
          width: `${Math.min(100, ((reviewedSoFar + 1) / Math.max(total, 1)) * 100)}%` as any,
        }]} />
      </View>

      {/* Transaction card */}
      <View style={styles.txCard}>
        <View style={styles.txHeader}>
          <View style={[styles.typeDot, {
            backgroundColor: current.type === 'income' ? DARK.income : DARK.expense,
          }]} />
          <Text style={[styles.txAmount, {
            color: current.type === 'income' ? DARK.income : DARK.expense,
          }]}>
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

      {/* New category */}
      {!showNewCat ? (
        <TouchableOpacity
          style={styles.newCatBtn}
          onPress={() => { setShowNewCat(true); setSelectedCatId(null); }}
        >
          <Text style={styles.newCatBtnText}>+ Neue Kategorie anlegen</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.newCatForm}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.newCatInput} value={newCatName} onChangeText={setNewCatName}
            placeholder="Kategoriename..." placeholderTextColor={DARK.subtext} autoFocus
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

      {/* Keywords */}
      {selectedCatId !== null && (
        <View style={styles.kwSection}>
          <Text style={styles.label}>Stichworte für „{selectedCat?.name}"</Text>
          <Text style={styles.kwHint}>
            Beim nächsten Import werden Buchungen mit diesen Stichworten automatisch erkannt.
          </Text>
          {currentKwList.length > 0 && (
            <View style={styles.chipRow}>
              {currentKwList.map(kw => (
                <TouchableOpacity key={kw} style={styles.kwChip} onPress={() => removeKw(kw)}>
                  <Text style={styles.kwChipText}>{kw}</Text>
                  <Text style={styles.kwRemove}> ×</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {unusedSuggestions.length > 0 && (
            <>
              <Text style={styles.sublabel}>Vorschläge (antippen zum Hinzufügen):</Text>
              <View style={styles.chipRow}>
                {unusedSuggestions.map(s => (
                  <TouchableOpacity key={s} style={styles.suggestionChip} onPress={() => addKw(s)}>
                    <Text style={styles.suggestionText}>+ {s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <View style={styles.kwInputRow}>
            <TextInput
              style={styles.kwInput} value={kwInput} onChangeText={setKwInput}
              placeholder="Eigenes Stichwort..." placeholderTextColor={DARK.subtext}
              autoCapitalize="none" returnKeyType="done"
              onSubmitEditing={() => { addKw(kwInput); setKwInput(''); }}
            />
            <TouchableOpacity style={styles.kwAddBtn} onPress={() => { addKw(kwInput); setKwInput(''); }}>
              <Text style={styles.kwAddBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Amount rules */}
          <View style={styles.amtDivider} />
          <Text style={styles.sublabel}>Betragsregel (für Buchungen ohne eindeutigen Text)</Text>
          {getAmtList(selectedCatId).length > 0 && (
            <View style={[styles.chipRow, { marginTop: 4 }]}>
              {getAmtList(selectedCatId).map(key => (
                <TouchableOpacity key={key} style={styles.amtChip} onPress={() => removeAmtRule(key)}>
                  <Text style={styles.amtChipText}>
                    {parseFloat(key).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </Text>
                  <Text style={styles.amtChipRemove}> ×</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {!getAmtList(selectedCatId).includes(current.amount.toFixed(2)) && (
            <TouchableOpacity
              style={styles.amtAddBtn}
              onPress={() => addAmtRule(current.amount)}
            >
              <Text style={styles.amtAddBtnText}>
                + {formatCurrency(current.amount)} als Regel hinzufügen
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Buttons */}
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

function SRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
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
    backgroundColor: DARK.surface, borderRadius: 12, padding: 14,
    marginTop: 8, borderWidth: 1, borderColor: DARK.accent,
  },
  newCatInput: {
    backgroundColor: DARK.card, color: DARK.text,
    borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 4,
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

  amtDivider: { height: 1, backgroundColor: DARK.card, marginVertical: 10 },
  amtChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#3A2A00', borderRadius: 12,
    paddingVertical: 4, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#FFB74D',
  },
  amtChipText: { color: '#FFB74D', fontSize: 12 },
  amtChipRemove: { color: '#FFB74D', fontSize: 12 },
  amtAddBtn: {
    alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: '#3A2A00', borderRadius: 12,
    paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#FFB74D',
  },
  amtAddBtnText: { color: '#FFB74D', fontSize: 12 },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  skipBtn: { flex: 1, backgroundColor: DARK.surface, borderRadius: 12, padding: 14, alignItems: 'center' },
  skipBtnText: { color: DARK.subtext, fontWeight: '600' },
  nextBtn: { flex: 2, backgroundColor: DARK.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: '#4A3A6A', opacity: 0.6 },
  nextBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },

  summaryContainer: { flex: 1, backgroundColor: DARK.bg, padding: 24, justifyContent: 'center' },
  summaryTitle: { color: DARK.text, fontSize: 22, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  summaryCard: { backgroundColor: DARK.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  summaryLabel: { color: DARK.subtext, fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: DARK.card, marginVertical: 4 },
  summaryHint: { color: DARK.subtext, fontSize: 12, textAlign: 'center', marginBottom: 24 },
  doneBtn: { backgroundColor: DARK.accent, borderRadius: 14, padding: 18, alignItems: 'center' },
  doneBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
