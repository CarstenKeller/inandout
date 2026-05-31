import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMonthlyBalance, getCategoryBalances } from '../database/queries';
import { MonthlyBalance, CategoryBalance } from '../types';

const DARK = {
  bg: '#121212',
  surface: '#1E1E1E',
  card: '#2C2C2C',
  text: '#FFFFFF',
  subtext: '#AAAAAA',
  income: '#4CAF50',
  expense: '#F44336',
  accent: '#BB86FC',
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export default function DashboardScreen() {
  const [balance, setBalance] = useState<MonthlyBalance | null>(null);
  const [categories, setCategories] = useState<CategoryBalance[]>([]);
  const [month, setMonth] = useState(getCurrentMonth());
  const [typeFilter, setTypeFilter] = useState<'income' | 'expense' | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, c] = await Promise.all([
        getMonthlyBalance(month),
        getCategoryBalances(month, typeFilter ?? undefined),
      ]);
      setBalance(b);
      setCategories(c);
    } finally {
      setLoading(false);
    }
  }, [month, typeFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changeMonth = (delta: number) => {
    const [year, m] = month.split('-').map(Number);
    const d = new Date(year, m - 1 + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthLabel = () => {
    const [year, m] = month.split('-').map(Number);
    return new Date(year, m - 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={DARK.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => changeMonth(-1)}>
          <Text style={styles.navBtn}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel()}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}>
          <Text style={styles.navBtn}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      {balance && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceTitle}>Saldo</Text>
          <Text style={[styles.balanceAmount, { color: balance.balance >= 0 ? DARK.income : DARK.expense }]}>
            {formatCurrency(balance.balance)}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.halfCard, typeFilter === 'income' && styles.halfCardActiveIncome]}
              onPress={() => setTypeFilter(f => f === 'income' ? null : 'income')}
              activeOpacity={0.7}
            >
              <Text style={styles.subtext}>Einnahmen</Text>
              <Text style={[styles.subAmount, { color: DARK.income }]}>{formatCurrency(balance.income)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.halfCard, typeFilter === 'expense' && styles.halfCardActiveExpense]}
              onPress={() => setTypeFilter(f => f === 'expense' ? null : 'expense')}
              activeOpacity={0.7}
            >
              <Text style={styles.subtext}>Ausgaben</Text>
              <Text style={[styles.subAmount, { color: DARK.expense }]}>{formatCurrency(balance.expenses)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        Kategorien{typeFilter === 'income' ? ' · Einnahmen' : typeFilter === 'expense' ? ' · Ausgaben' : ''}
      </Text>
      {categories.length === 0 && (
        <Text style={styles.emptyText}>Keine Buchungen in diesem Monat</Text>
      )}
      {categories.map(cat => (
        <View key={cat.categoryId} style={styles.categoryRow}>
          <View style={[styles.dot, { backgroundColor: cat.categoryColor }]} />
          <Text style={styles.catName}>{cat.categoryName}</Text>
          <Text style={styles.catCount}>{cat.count} Buchungen</Text>
          <Text style={[styles.catAmount, { color: DARK.expense }]}>{formatCurrency(cat.total)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  navBtn: { color: DARK.accent, fontSize: 24, paddingHorizontal: 16 },
  monthLabel: { color: DARK.text, fontSize: 18, fontWeight: '600' },
  balanceCard: { backgroundColor: DARK.surface, borderRadius: 12, padding: 20, marginBottom: 24 },
  balanceTitle: { color: DARK.subtext, fontSize: 14, marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontWeight: 'bold', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12 },
  halfCard: { flex: 1, backgroundColor: DARK.card, borderRadius: 8, padding: 12, borderWidth: 2, borderColor: 'transparent' },
  halfCardActiveIncome: { borderColor: DARK.income },
  halfCardActiveExpense: { borderColor: DARK.expense },
  subtext: { color: DARK.subtext, fontSize: 12 },
  subAmount: { fontSize: 18, fontWeight: '600', marginTop: 4 },
  sectionTitle: { color: DARK.text, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  emptyText: { color: DARK.subtext, textAlign: 'center', marginTop: 16 },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DARK.surface,
    borderRadius: 8, padding: 12, marginBottom: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  catName: { flex: 1, color: DARK.text, fontSize: 14 },
  catCount: { color: DARK.subtext, fontSize: 12, marginRight: 10 },
  catAmount: { fontSize: 14, fontWeight: '600' },
});
