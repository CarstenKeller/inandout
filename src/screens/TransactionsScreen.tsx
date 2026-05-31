import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TouchableHighlight, ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTransactions, deleteTransaction, getCategories, getAccounts } from '../database/queries';
import { Transaction, Category, Account, TransactionsStackParamList } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', income: '#4CAF50', expense: '#F44336',
  accent: '#BB86FC',
};

type NavProp = NativeStackNavigationProp<TransactionsStackParamList, 'TransactionsList'>;
type RouteProps = RouteProp<TransactionsStackParamList, 'TransactionsList'>;

const formatCurrency = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
};

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterMonth, setFilterMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();

  // Apply params from navigation (e.g. from Dashboard category tap)
  useEffect(() => {
    const p = route.params;
    if (!p) return;
    if (p.typeFilter)        setFilterType(p.typeFilter);
    if (p.filterCategoryId)  setFilterCategoryId(p.filterCategoryId);
    if (p.filterMonth)       setFilterMonth(p.filterMonth);
    if (p.filterAccountId)   setFilterAccountId(p.filterAccountId);
  }, [route.params]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txs, cats] = await Promise.all([
        getTransactions(filterMonth ?? undefined),
        getCategories(),
      ]);
      setTransactions(txs.filter(t => t.isManual === 0));
      setCategories(cats);
      setAccounts(getAccounts());
    } finally {
      setLoading(false);
    }
  }, [filterMonth]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = transactions
    .filter(t => filterType === 'all' || t.type === filterType)
    .filter(t => filterCategoryId === null || t.categoryId === filterCategoryId)
    .filter(t => filterAccountId === null || t.accountId === filterAccountId);

  const confirmDelete = (item: Transaction) => {
    Alert.alert('Löschen', `"${item.description}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive',
        onPress: async () => { await deleteTransaction(item.id); load(); } },
    ]);
  };

  const handleLongPress = (item: Transaction) => {
    Alert.alert(item.description, undefined, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Bearbeiten', onPress: () => navigation.navigate('AddTransaction', { transaction: item, defaultManual: false }) },
      { text: 'Löschen', style: 'destructive', onPress: () => confirmDelete(item) },
    ]);
  };

  const clearFilters = () => {
    setFilterType('all');
    setFilterCategoryId(null);
    setFilterMonth(null);
    setFilterAccountId(null);
  };

  const activeFilterCat = categories.find(c => c.id === filterCategoryId);
  const activeFilterAccount = accounts.find(a => a.id === filterAccountId);
  const hasActiveFilter = filterType !== 'all' || filterCategoryId !== null || filterMonth !== null || filterAccountId !== null;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={DARK.accent} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Active-filter banner (shown when navigated from Dashboard or filter active) */}
      {hasActiveFilter && (
        <View style={styles.filterBanner}>
          <Text style={styles.filterBannerText} numberOfLines={1}>
            {[
              filterMonth && monthLabel(filterMonth),
              activeFilterCat && activeFilterCat.name,
              filterType === 'income' ? '↑ Einnahmen' : filterType === 'expense' ? '↓ Ausgaben' : null,
              activeFilterAccount && activeFilterAccount.name,
            ].filter(Boolean).join(' · ')}
          </Text>
          <TouchableOpacity onPress={clearFilters} style={styles.filterBannerClear}>
            <Text style={styles.filterBannerClearText}>✕ Zurücksetzen</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter bar: type + category + account */}
      <View style={styles.filterBarOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBarContent}>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'all' && filterCategoryId === null && filterAccountId === null && styles.filterChipActive]}
            onPress={() => { setFilterType('all'); setFilterCategoryId(null); setFilterAccountId(null); }}
          >
            <Text style={[styles.filterChipText, filterType === 'all' && filterCategoryId === null && filterAccountId === null && styles.filterChipTextActive]}>
              Alle
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'income' && { backgroundColor: '#1B3A1B', borderColor: DARK.income }]}
            onPress={() => { setFilterType(p => p === 'income' ? 'all' : 'income'); setFilterCategoryId(null); }}
          >
            <Text style={[styles.filterChipText, filterType === 'income' && { color: DARK.income, fontWeight: '700' }]}>
              ↑ Einnahmen
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'expense' && { backgroundColor: '#3A0000', borderColor: DARK.expense }]}
            onPress={() => { setFilterType(p => p === 'expense' ? 'all' : 'expense'); setFilterCategoryId(null); }}
          >
            <Text style={[styles.filterChipText, filterType === 'expense' && { color: DARK.expense, fontWeight: '700' }]}>
              ↓ Ausgaben
            </Text>
          </TouchableOpacity>
          <View style={styles.filterSep} />
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.filterChip, filterCategoryId === cat.id && { backgroundColor: cat.color + '33', borderColor: cat.color }]}
              onPress={() => setFilterCategoryId(p => p === cat.id ? null : cat.id)}
            >
              <View style={[styles.filterDot, { backgroundColor: cat.color }]} />
              <Text style={[styles.filterChipText, filterCategoryId === cat.id && { color: cat.color, fontWeight: '700' }]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
          {accounts.length > 1 && (
            <>
              <View style={styles.filterSep} />
              {accounts.map(acc => (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.filterChip, filterAccountId === acc.id && { backgroundColor: acc.color + '33', borderColor: acc.color }]}
                  onPress={() => setFilterAccountId(p => p === acc.id ? null : acc.id)}
                >
                  <View style={[styles.filterDot, { backgroundColor: acc.color }]} />
                  <Text style={[styles.filterChipText, filterAccountId === acc.id && { color: acc.color, fontWeight: '700' }]}>
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      </View>

      {/* Count */}
      {hasActiveFilter && (
        <Text style={styles.resultCount}>{filtered.length} Buchung{filtered.length !== 1 ? 'en' : ''}</Text>
      )}

      <FlatList
        style={{ flex: 1 }}
        data={filtered}
        keyExtractor={item => String(item.id)}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {hasActiveFilter ? 'Keine Buchungen für diesen Filter' : 'Noch keine importierten Buchungen'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableHighlight underlayColor="#333" onLongPress={() => handleLongPress(item)} style={styles.item}>
            <View style={styles.itemRow}>
              <View style={[styles.typeDot, { backgroundColor: item.type === 'income' ? DARK.income : DARK.expense }]} />
              <View style={styles.info}>
                <Text style={styles.desc} numberOfLines={filterCategoryId ? 3 : 1}>{item.description}</Text>
                <Text style={styles.meta}>
                  {item.date} · {item.categoryName ?? 'Ohne Kategorie'}
                  {accounts.length > 1 && item.accountName ? ` · ${item.accountName}` : ''}
                </Text>
              </View>
              {accounts.length > 1 && item.accountColor && (
                <View style={[styles.accountBadge, { backgroundColor: item.accountColor + '33', borderColor: item.accountColor }]} />
              )}
              <Text style={[styles.amount, { color: item.type === 'income' ? DARK.income : DARK.expense }]}>
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
  filterBanner: {
    backgroundColor: '#1A1A2E', paddingHorizontal: 14, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: DARK.accent + '44',
  },
  filterBannerText: { color: DARK.accent, fontSize: 13, fontWeight: '600', flex: 1 },
  filterBannerClear: { marginLeft: 12 },
  filterBannerClearText: { color: DARK.subtext, fontSize: 12 },
  resultCount: { color: DARK.subtext, fontSize: 11, paddingHorizontal: 14, paddingTop: 6 },
  filterBarOuter: { height: 58, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: DARK.surface, overflow: 'hidden' },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 16, backgroundColor: DARK.surface, borderWidth: 1, borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: DARK.accent + '33', borderColor: DARK.accent },
  filterChipText: { color: DARK.subtext, fontSize: 13 },
  filterChipTextActive: { color: DARK.accent, fontWeight: '700' },
  filterDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  filterSep: { width: 1, height: 20, backgroundColor: '#333', marginHorizontal: 4 },
  empty: { color: DARK.subtext, textAlign: 'center', marginTop: 40 },
  item: { marginHorizontal: 12, marginTop: 8, borderRadius: 10, backgroundColor: DARK.surface, overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12, marginTop: 3 },
  info: { flex: 1 },
  desc: { color: DARK.text, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  meta: { color: DARK.subtext, fontSize: 12, marginTop: 3 },
  accountBadge: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, marginRight: 6, marginTop: 5 },
  amount: { fontSize: 14, fontWeight: '600', marginLeft: 10 },
});
