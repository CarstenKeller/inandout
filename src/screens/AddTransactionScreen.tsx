import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { getCategories, addTransaction, updateTransaction } from '../database/queries';
import { Category, Recurrence, Transaction } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
  income: '#4CAF50', expense: '#F44336', manual: '#FFB74D',
};

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'once',      label: 'Einmalig' },
  { value: 'monthly',   label: 'Monatlich' },
  { value: 'quarterly', label: 'Quartalsweise' },
  { value: 'yearly',    label: 'Jährlich' },
];

const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

type AddTxParams = { transaction?: Transaction; defaultManual?: boolean };
type RouteProps = RouteProp<{ AddTransaction: AddTxParams | undefined }, 'AddTransaction'>;

export default function AddTransactionScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const existing = route.params?.transaction;
  const defaultManual = route.params?.defaultManual ?? true;

  const [categories, setCategories] = useState<Category[]>([]);
  const [type, setType] = useState<'income' | 'expense'>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing ? String(existing.amount).replace('.', ',') : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState<number | null>(existing?.categoryId ?? null);
  const [isManual, setIsManual] = useState(existing ? existing.isManual === 1 : defaultManual);
  const [recurrence, setRecurrence] = useState<Recurrence>(existing?.recurrence ?? 'monthly');

  const isEditing = !!existing;

  useFocusEffect(useCallback(() => {
    getCategories().then(setCategories);
  }, []));

  // Only show categories matching the selected type
  const visibleCategories = categories.filter(
    cat => cat.type === 'both' || cat.type === type
  );

  const handleTypeChange = (newType: 'income' | 'expense') => {
    setType(newType);
    // Deselect category if it doesn't match new type
    if (categoryId) {
      const cat = categories.find(c => c.id === categoryId);
      if (cat && cat.type !== 'both' && cat.type !== newType) {
        setCategoryId(null);
      }
    }
  };

  const currentMonth = parseInt(date.split('-')[1] ?? '1', 10);
  const setMonth = (m: number) => {
    const year = date.split('-')[0] ?? String(new Date().getFullYear());
    setDate(`${year}-${String(m).padStart(2, '0')}-01`);
  };

  const handleSave = async () => {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) { Alert.alert('Fehler', 'Bitte einen gültigen Betrag eingeben'); return; }
    if (!description.trim()) { Alert.alert('Fehler', 'Bitte eine Beschreibung eingeben'); return; }
    if (!categoryId) { Alert.alert('Fehler', 'Bitte eine Kategorie wählen'); return; }

    const data = {
      date,
      amount: parsed,
      description: description.trim(),
      categoryId,
      type,
      isManual: isManual ? 1 : 0,
      recurrence: isManual ? recurrence : 'once' as Recurrence,
    };

    if (isEditing) {
      await updateTransaction(existing.id, data);
    } else {
      await addTransaction(data);
    }
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>

      {/* Type */}
      <View style={styles.typeRow}>
        {(['expense', 'income'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.typeBtn, type === t && { backgroundColor: t === 'income' ? DARK.income : DARK.expense }]}
            onPress={() => handleTypeChange(t)}
          >
            <Text style={styles.typeBtnText}>{t === 'income' ? 'Einnahme' : 'Ausgabe'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Amount */}
      <Text style={styles.label}>Betrag (€)</Text>
      <TextInput
        style={styles.input} value={amount} onChangeText={setAmount}
        placeholder="0,00" placeholderTextColor={DARK.subtext}
        keyboardType="decimal-pad" returnKeyType="done"
      />

      {/* Description */}
      <Text style={styles.label}>Beschreibung / Kommentar</Text>
      <TextInput
        style={[styles.input, { minHeight: 60 }]}
        value={description} onChangeText={setDescription}
        placeholder="z.B. Geschätzte Miete" placeholderTextColor={DARK.subtext}
        multiline
      />

      {/* Category — filtered by type */}
      <Text style={styles.label}>
        Kategorie{' '}
        <Text style={styles.labelHint}>
          ({type === 'income' ? 'Einnahmen' : 'Ausgaben'})
        </Text>
      </Text>
      {visibleCategories.length === 0
        ? <Text style={styles.noCategories}>Keine passenden Kategorien</Text>
        : (
          <View style={styles.catGrid}>
            {visibleCategories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catChip, categoryId === cat.id && { borderColor: cat.color, borderWidth: 2 }]}
                onPress={() => setCategoryId(cat.id)}
              >
                <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                <Text style={styles.catText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )
      }

      {/* Manual toggle */}
      <View style={styles.manualRow}>
        <View style={styles.manualInfo}>
          <Text style={styles.manualLabel}>Manuelle Schätzung</Text>
          <Text style={styles.manualHint}>Platzhalter – später durch Import ersetzt</Text>
        </View>
        <Switch
          value={isManual}
          onValueChange={setIsManual}
          trackColor={{ false: DARK.surface, true: DARK.manual }}
          thumbColor={isManual ? '#fff' : '#888'}
        />
      </View>

      {/* Recurrence + month picker directly below (manual only) */}
      {isManual && (
        <View style={styles.manualBlock}>
          <Text style={styles.label}>Wiederholung</Text>
          <View style={styles.recurrenceGrid}>
            {RECURRENCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.recurrenceChip, recurrence === opt.value && styles.recurrenceChipActive]}
                onPress={() => setRecurrence(opt.value)}
              >
                <Text style={[styles.recurrenceText, recurrence === opt.value && styles.recurrenceTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Month picker directly below when yearly */}
          {recurrence === 'yearly' && (
            <>
              <Text style={styles.label}>Monat der Zahlung</Text>
              <View style={styles.monthGrid}>
                {MONTH_NAMES.map((name, i) => {
                  const m = i + 1;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.monthChip, currentMonth === m && styles.monthChipActive]}
                      onPress={() => setMonth(m)}
                    >
                      <Text style={[styles.monthChipText, currentMonth === m && styles.monthChipTextActive]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>
      )}

      {/* Date field — hidden for manual+yearly (month picker handles it) */}
      {!(isManual && recurrence === 'yearly') && (
        <>
          <Text style={styles.label}>Datum</Text>
          <TextInput
            style={styles.input} value={date} onChangeText={setDate}
            placeholder="YYYY-MM-DD" placeholderTextColor={DARK.subtext}
          />
        </>
      )}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>
          {isEditing ? 'Änderungen speichern' : 'Buchung speichern'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  typeBtn: { flex: 1, backgroundColor: DARK.surface, padding: 14, borderRadius: 10, alignItems: 'center' },
  typeBtnText: { color: DARK.text, fontWeight: '600' },
  label: { color: DARK.subtext, fontSize: 12, marginBottom: 6, marginTop: 14 },
  labelHint: { color: DARK.subtext, fontSize: 11, fontStyle: 'italic' },
  input: { backgroundColor: DARK.surface, color: DARK.text, borderRadius: 10, padding: 14, fontSize: 16 },
  noCategories: { color: DARK.subtext, fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DARK.surface,
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12,
    borderColor: 'transparent', borderWidth: 2,
  },
  catDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  catText: { color: DARK.text, fontSize: 13 },
  manualRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DARK.surface,
    borderRadius: 12, padding: 14, marginTop: 20, gap: 12,
  },
  manualInfo: { flex: 1 },
  manualLabel: { color: DARK.manual, fontWeight: '600', fontSize: 14 },
  manualHint: { color: DARK.subtext, fontSize: 12, marginTop: 2 },
  manualBlock: {
    backgroundColor: DARK.surface, borderRadius: 12,
    padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: '#3D2E00',
  },
  recurrenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  recurrenceChip: {
    backgroundColor: DARK.card, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'transparent',
  },
  recurrenceChipActive: { borderColor: DARK.manual, backgroundColor: '#3D2E00' },
  recurrenceText: { color: DARK.subtext, fontSize: 13 },
  recurrenceTextActive: { color: DARK.manual, fontWeight: '600' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  monthChip: {
    width: '22%', paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    backgroundColor: DARK.card, borderWidth: 1, borderColor: 'transparent',
  },
  monthChipActive: { borderColor: DARK.accent, backgroundColor: '#2A1F4A' },
  monthChipText: { color: DARK.subtext, fontSize: 13, fontWeight: '500' },
  monthChipTextActive: { color: DARK.accent, fontWeight: '700' },
  saveBtn: {
    backgroundColor: DARK.accent, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 24, marginBottom: 32,
  },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
