import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getCategories, addTransaction } from '../database/queries';
import { Category } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
  income: '#4CAF50', expense: '#F44336',
};

export default function AddTransactionScreen() {
  const navigation = useNavigation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState<number | null>(null);

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

    await addTransaction({ date, amount: parsed, description: description.trim(), categoryId, type });
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

      <Text style={styles.label}>Beschreibung</Text>
      <TextInput
        style={styles.input} value={description} onChangeText={setDescription}
        placeholder="z.B. Supermarkt" placeholderTextColor={DARK.subtext}
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

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Buchung speichern</Text>
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
  saveBtn: {
    backgroundColor: DARK.accent, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 28, marginBottom: 24,
  },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
