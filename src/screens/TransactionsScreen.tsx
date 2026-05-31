import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TouchableHighlight, ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTransactions, deleteTransaction, getCategories } from '../database/queries';
import { Transaction, Category, TransactionsStackParamList } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', text: '#FFFFFF',
  subtext: '#AAAAAA', income: '#4CAF50', expense: '#F44336',
};

type NavProp = NativeStackNavigationProp<TransactionsStackParamList, 'TransactionsList'>;
type RouteProps = RouteProp<TransactionsStackParamList, 'TransactionsList'>;

const formatCurrency = (amount: number) =>
  amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();

  useEffect(() => {
    const tf = route.params?.typeFilter;
    if (tf) setFilterType(tf);
  }, [route.params?.typeFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txs, cats] = await Promise.all([getTransactions(), getCategories()]);
      // only imported transactions — manual/planning entries live in the Planung tab
      setTransactions(txs.filter(t => t.isManual === 0));
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = transactions
    .filter(t => filterType === 'all' || t.type === filterType)
    .filter(t => filterCategoryId === null || t.categoryId === filterCategoryId);

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
      { text: 'Bearbeiten', onPress: () => navigation.navigate('AddTransaction', { transaction: item, defaultManual: false }) },
      { text: 'Löschen', style: 'destructive', onPress: () => confirmDelete(item) },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#BB86FC" size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Filter bar */}
      <View style={styles.filterBarOuter}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBarContent}
        >
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'all' && filterCategoryId === null && styles.filterChipActive]}
            onPress={() => { setFilterType('all'); setFilterCategoryId(null); }}
          >
            <Text style={[styles.filterChipText, filterType === 'all' && filterCategoryId === null && styles.filterChipTextActive]}>
              Alle
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'income' && { backgroundColor: '#1B3A1B', borderColor: '#4CAF50' }]}
            onPress={() => { setFilterType(prev => prev === 'income' ? 'all' : 'income'); setFilterCategoryId(null); }}
          >
            <Text style={[styles.filterChipText, filterType === 'income' && { color: '#4CAF50', fontWeight: '700' }]}>
              ↑ Einnahmen
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'expense' && { backgroundColor: '#3A0000', borderColor: '#F44336' }]}
            onPress={() => { setFilterType(prev => prev === 'expense' ? 'all' : 'expense'); setFilterCategoryId(null); }}
          >
            <Text style={[styles.filterChipText, filterType === 'expense' && { color: '#F44336', fontWeight: '700' }]}>
              ↓ Ausgaben
            </Text>
          </TouchableOpacity>
          <View style={styles.filterSep} />
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
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={filtered}
        keyExtractor={item => String(item.id)}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {filterCategoryId || filterType !== 'all'
              ? 'Keine Buchungen für diesen Filter'
              : 'Noch keine importierten Buchungen'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableHighlight
            underlayColor="#333"
            onLongPress={() => handleLongPress(item)}
            style={styles.item}
          >
            <View style={styles.itemRow}>
              <View style={[styles.typeDot, {
                backgroundColor: item.type === 'income' ? DARK.income : DARK.expense,
              }]} />
              <View style={styles.info}>
                <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.date} · {item.categoryName ?? 'Ohne Kategorie'}
                </Text>
              </View>
              <Text style={[styles.amount, {
                color: item.type === 'income' ? DARK.income : DARK.expense,
              }]}>
                {item.type === 'expense' ? '-' : '+'}{formatCurrency(item.amount)}
              </Text>
            </View>
          </TouchableHighlight>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' },
  filterBarOuter: {
    height: 58, flexShrink: 0,
    borderBottomWidth: 1, borderBottomColor: DARK.surface,
    overflow: 'hidden',
  },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 16, backgroundColor: DARK.surface, borderWidth: 1, borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: '#BB86FC33', borderColor: '#BB86FC' },
  filterChipText: { color: DARK.subtext, fontSize: 13 },
  filterChipTextActive: { color: '#BB86FC', fontWeight: '700' },
  filterDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  filterSep: { width: 1, height: 20, backgroundColor: '#333', marginHorizontal: 4 },
  empty: { color: DARK.subtext, textAlign: 'center', marginTop: 40 },
  item: {
    marginHorizontal: 12, marginTop: 8, borderRadius: 10,
    backgroundColor: DARK.surface, overflow: 'hidden',
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  info: { flex: 1 },
  desc: { color: DARK.text, fontSize: 14, fontWeight: '500' },
  meta: { color: DARK.subtext, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '600' },
});
