import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { getCategories, addTransaction, updateTransaction } from '../database/queries';
import { Category, TransactionsStackParamList } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
  income: '#4CAF50', expense: '#F44336', manual: '#FFB74D',
};

type RouteProps = RouteProp<TransactionsStackParamList, 'AddTransaction'>;

export default function AddTransactionScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const existing = route.params?.transaction;

  const [categories, setCategories] = useState<Category[]>([]);
  const [type, setType] = useState<'income' | 'expense'>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing ? String(existing.amount).replace('.', ',') : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState<number | null>(existing?.categoryId ?? null);
  const [isManual, setIsManual] = useState((existing?.isManual ?? 1) === 1);

  const isEditing = !!existing;

  useEffect(() => { getCategories().then(setCategories); }, []);

  const handleSave = async () => {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Fehler', 'Bitte einen gültigen Betrag eingeben');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Fehler', 'Bitte eine Beschreibung eingeben');
      return;
    }
    if (!categoryId) {
      Alert.alert('Fehler', 'Bitte eine Kategorie wählen');
      return;
    }

    const data = {
      date,
      amount: parsed,
      description: description.trim(),
      categoryId,
      type,
      isManual: isManual ? 1 : 0,
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
      <View style={styles.typeRow}>
        {(['expense', 'income'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.typeBtn, type === t && { backgroundColor: t === 'income' ? DARK.income : DARK.expense }]}
            onPress={() => setType(t)}
          >
            <Text style={styles.typeBtnText}>{t === 'income' ? 'Einnahme' : 'Ausgabe'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Betrag (€)</Text>
      <TextInput
        style={styles.input} value={amount} onChangeText={setAmount}
        placeholder="0,00" placeholderTextColor={DARK.subtext}
        keyboardType="decimal-pad" returnKeyType="done"
      />

      <Text style={styles.label}>Beschreibung / Kommentar</Text>
      <TextInput
        style={[styles.input, { minHeight: 60 }]}
        value={description} onChangeText={setDescription}
        placeholder="z.B. Geschätzte Miete Q3" placeholderTextColor={DARK.subtext}
        multiline
      />

      <Text style={styles.label}>Datum</Text>
      <TextInput
        style={styles.input} value={date} onChangeText={setDate}
        placeholder="YYYY-MM-DD" placeholderTextColor={DARK.subtext}
      />

      <Text style={styles.label}>Kategorie</Text>
      <View style={styles.catGrid}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.catChip,
              categoryId === cat.id && { borderColor: cat.color, borderWidth: 2 },
            ]}
            onPress={() => setCategoryId(cat.id)}
          >
            <View style={[styles.catDot, { backgroundColor: cat.color }]} />
            <Text style={styles.catText}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.manualRow}>
        <View style={styles.manualInfo}>
          <Text style={styles.manualLabel}>Manuelle Schätzung</Text>
          <Text style={styles.manualHint}>
            Markiert als Platzhalter – wird später durch CSV/PDF-Import ersetzt
          </Text>
        </View>
        <Switch
          value={isManual}
          onValueChange={setIsManual}
          trackColor={{ false: DARK.surface, true: DARK.manual }}
          thumbColor={isManual ? '#fff' : '#888'}
        />
      </View>

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
  input: { backgroundColor: DARK.surface, color: DARK.text, borderRadius: 10, padding: 14, fontSize: 16 },
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
  saveBtn: {
    backgroundColor: DARK.accent, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 24, marginBottom: 32,
  },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
