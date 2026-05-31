import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TouchableHighlight, ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTransactions, deleteTransaction, getCategories } from '../database/queries';
import { Transaction, Category, TransactionsStackParamList } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', text: '#FFFFFF',
  subtext: '#AAAAAA', income: '#4CAF50', expense: '#F44336', manual: '#FFB74D',
};

type NavProp = NativeStackNavigationProp<TransactionsStackParamList, 'TransactionsList'>;

const formatCurrency = (amount: number) =>
  amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NavProp>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txs, cats] = await Promise.all([getTransactions(), getCategories()]);
      setTransactions(txs);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = filterCategoryId
    ? transactions.filter(t => t.categoryId === filterCategoryId)
    : transactions;

  const confirmDelete = (item: Transaction) => {
    Alert.alert('Löschen', `"${item.description}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive',
        onPress: async () => { await deleteTransaction(item.id); load(); },
      },
    ]);
  };

  const handleLongPress = (item: Transaction) => {
    Alert.alert(item.description, undefined, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Bearbeiten', onPress: () => navigation.navigate('AddTransaction', { transaction: item }) },
      { text: 'Löschen', style: 'destructive', onPress: () => confirmDelete(item) },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#BB86FC" size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Category filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, filterCategoryId === null && styles.filterChipActive]}
          onPress={() => setFilterCategoryId(null)}
        >
          <Text style={[styles.filterChipText, filterCategoryId === null && styles.filterChipTextActive]}>
            Alle
          </Text>
        </TouchableOpacity>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.filterChip,
              filterCategoryId === cat.id && { backgroundColor: cat.color + '33', borderColor: cat.color },
            ]}
            onPress={() => setFilterCategoryId(prev => prev === cat.id ? null : cat.id)}
          >
            <View style={[styles.filterDot, { backgroundColor: cat.color }]} />
            <Text style={[
              styles.filterChipText,
              filterCategoryId === cat.id && { color: cat.color, fontWeight: '700' },
            ]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Transaction list */}
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {filterCategoryId ? 'Keine Buchungen in dieser Kategorie' : 'Keine Buchungen vorhanden'}
          </Text>
        }
        renderItem={({ item }) => {
          const manual = item.isManual === 1;
          return (
            <TouchableHighlight
              underlayColor="#333"
              onLongPress={() => handleLongPress(item)}
              style={[styles.item, manual && styles.manualItem]}
            >
              <View>
                {manual && (
                  <View style={styles.manualBadge}>
                    <Text style={styles.manualBadgeText}>SCHÄTZUNG</Text>
                  </View>
                )}
                <View style={styles.itemRow}>
                  <View style={[styles.typeDot, {
                    backgroundColor: item.type === 'income' ? DARK.income : DARK.expense,
                  }]} />
                  <View style={styles.info}>
                    <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.meta}>
                      {item.date} · {item.categoryName ?? 'Ohne Kategorie'}
                    </Text>
                  </View>
                  <Text style={[styles.amount, {
                    color: item.type === 'income' ? DARK.income : DARK.expense,
                  }]}>
                    {item.type === 'expense' ? '-' : '+'}{formatCurrency(item.amount)}
                  </Text>
                </View>
              </View>
            </TouchableHighlight>
          );
        }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddTransaction', {})}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' },
  filterBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: DARK.surface },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 16, backgroundColor: DARK.surface, borderWidth: 1, borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: '#BB86FC33', borderColor: '#BB86FC' },
  filterChipText: { color: DARK.subtext, fontSize: 13 },
  filterChipTextActive: { color: '#BB86FC', fontWeight: '700' },
  filterDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  empty: { color: DARK.subtext, textAlign: 'center', marginTop: 40 },
  item: {
    marginHorizontal: 12, marginTop: 8, borderRadius: 10,
    backgroundColor: DARK.surface, overflow: 'hidden',
  },
  manualItem: { borderWidth: 1, borderColor: DARK.manual, borderStyle: 'dashed' },
  manualBadge: {
    backgroundColor: '#3D2E00', paddingHorizontal: 10, paddingVertical: 3,
    alignSelf: 'flex-start', borderBottomRightRadius: 8,
  },
  manualBadgeText: { color: DARK.manual, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  info: { flex: 1 },
  desc: { color: DARK.text, fontSize: 14, fontWeight: '500' },
  meta: { color: DARK.subtext, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '600' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, backgroundColor: '#BB86FC',
    width: 56, height: 56, borderRadius: 28, justifyContent: 'center',
    alignItems: 'center', elevation: 6,
  },
  fabText: { color: '#000', fontSize: 28, fontWeight: 'bold', lineHeight: 32 },
});
