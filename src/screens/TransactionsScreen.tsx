import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getTransactions, deleteTransaction } from '../database/queries';
import { Transaction } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', text: '#FFFFFF',
  subtext: '#AAAAAA', income: '#4CAF50', expense: '#F44336',
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTransactions(await getTransactions());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (item: Transaction) => {
    Alert.alert('Buchung löschen', `"${item.description}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive',
        onPress: async () => { await deleteTransaction(item.id); load(); },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#BB86FC" size="large" /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      data={transactions}
      keyExtractor={item => String(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>Keine Buchungen vorhanden</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.item} onLongPress={() => handleDelete(item)}>
          <View style={[styles.typeDot, { backgroundColor: item.type === 'income' ? DARK.income : DARK.expense }]} />
          <View style={styles.info}>
            <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
            <Text style={styles.meta}>{item.date} · {item.categoryName ?? 'Ohne Kategorie'}</Text>
          </View>
          <Text style={[styles.amount, { color: item.type === 'income' ? DARK.income : DARK.expense }]}>
            {item.type === 'expense' ? '-' : '+'}{formatCurrency(item.amount)}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' },
  empty: { color: DARK.subtext, textAlign: 'center', marginTop: 40 },
  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DARK.surface,
    marginHorizontal: 12, marginTop: 8, borderRadius: 10, padding: 14,
  },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  info: { flex: 1 },
  desc: { color: DARK.text, fontSize: 14, fontWeight: '500' },
  meta: { color: DARK.subtext, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '600' },
});
