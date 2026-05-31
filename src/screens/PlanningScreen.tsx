import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getManualTransactions } from '../database/queries';
import { Transaction, PeriodBalance, Recurrence } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
  income: '#4CAF50', expense: '#F44336', manual: '#FFB74D',
};

type ViewMode = 'monthly' | 'quarterly' | 'yearly';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const formatCurrency = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

function amountForMonth(t: Transaction, year: number, month: number): number {
  const d = new Date(t.date);
  const txMonth = d.getMonth() + 1;
  const txYear = d.getFullYear();

  const rec: Recurrence = t.recurrence ?? 'once';
  switch (rec) {
    case 'monthly':
      return t.amount;
    case 'quarterly':
      return ((month - txMonth) % 3 + 12) % 3 === 0 ? t.amount : 0;
    case 'yearly':
      return txMonth === month ? t.amount : 0;
    case 'once':
    default:
      return txYear === year && txMonth === month ? t.amount : 0;
  }
}

export default function PlanningScreen() {
  const [mode, setMode] = useState<ViewMode>('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    getManualTransactions().then(t => { setTransactions(t); setLoading(false); });
  }, []));

  const monthlyData: PeriodBalance[] = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const income = transactions
        .filter(t => t.type === 'income')
        .reduce((s, t) => s + amountForMonth(t, year, month), 0);
      const expenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((s, t) => s + amountForMonth(t, year, month), 0);
      return { label: MONTH_NAMES[i], income, expenses, balance: income - expenses };
    }),
    [transactions, year]
  );

  const quarterlyData: PeriodBalance[] = useMemo(() =>
    Array.from({ length: 4 }, (_, i) => {
      const months = monthlyData.slice(i * 3, i * 3 + 3);
      const income = months.reduce((s, m) => s + m.income, 0);
      const expenses = months.reduce((s, m) => s + m.expenses, 0);
      return { label: `Q${i + 1}`, income, expenses, balance: income - expenses };
    }),
    [monthlyData]
  );

  const yearlyData: PeriodBalance = useMemo(() => {
    const income = monthlyData.reduce((s, m) => s + m.income, 0);
    const expenses = monthlyData.reduce((s, m) => s + m.expenses, 0);
    return { label: String(year), income, expenses, balance: income - expenses };
  }, [monthlyData, year]);

  const rows = mode === 'monthly' ? monthlyData : mode === 'quarterly' ? quarterlyData : [yearlyData];

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={DARK.accent} size="large" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {/* Year navigation */}
      <View style={styles.yearNav}>
        <TouchableOpacity onPress={() => setYear(y => y - 1)}>
          <Text style={styles.navBtn}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.yearLabel}>{year}</Text>
        <TouchableOpacity onPress={() => setYear(y => y + 1)}>
          <Text style={styles.navBtn}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        {(['monthly', 'quarterly', 'yearly'] as ViewMode[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
              {m === 'monthly' ? 'Monatlich' : m === 'quarterly' ? 'Quartal' : 'Jahr'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {transactions.length === 0 ? (
        <Text style={styles.empty}>Keine manuellen Positionen vorhanden{'\n'}Buchungen mit „Manuelle Schätzung" anlegen</Text>
      ) : (
        <>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.labelCell]}>Zeitraum</Text>
            <Text style={[styles.headerCell, styles.amountCell]}>Einnahmen</Text>
            <Text style={[styles.headerCell, styles.amountCell]}>Ausgaben</Text>
            <Text style={[styles.headerCell, styles.amountCell]}>Saldo</Text>
          </View>

          {/* Rows */}
          {rows.map((row, idx) => (
            <View key={idx} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowAlt]}>
              <Text style={[styles.cell, styles.labelCell]}>{row.label}</Text>
              <Text style={[styles.cell, styles.amountCell, { color: DARK.income }]}>
                {row.income > 0 ? formatCurrency(row.income) : '–'}
              </Text>
              <Text style={[styles.cell, styles.amountCell, { color: DARK.expense }]}>
                {row.expenses > 0 ? formatCurrency(row.expenses) : '–'}
              </Text>
              <Text style={[styles.cell, styles.amountCell, {
                color: row.balance >= 0 ? DARK.income : DARK.expense,
                fontWeight: '700',
              }]}>
                {row.income === 0 && row.expenses === 0 ? '–' : formatCurrency(row.balance)}
              </Text>
            </View>
          ))}

          {/* Totals */}
          {mode !== 'yearly' && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalCell, styles.labelCell]}>Gesamt</Text>
              <Text style={[styles.totalCell, styles.amountCell, { color: DARK.income }]}>
                {formatCurrency(rows.reduce((s, r) => s + r.income, 0))}
              </Text>
              <Text style={[styles.totalCell, styles.amountCell, { color: DARK.expense }]}>
                {formatCurrency(rows.reduce((s, r) => s + r.expenses, 0))}
              </Text>
              <Text style={[styles.totalCell, styles.amountCell, {
                color: rows.reduce((s, r) => s + r.balance, 0) >= 0 ? DARK.income : DARK.expense,
              }]}>
                {formatCurrency(rows.reduce((s, r) => s + r.balance, 0))}
              </Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' },
  yearNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  navBtn: { color: DARK.accent, fontSize: 24, paddingHorizontal: 16 },
  yearLabel: { color: DARK.text, fontSize: 22, fontWeight: '700' },
  modeRow: { flexDirection: 'row', backgroundColor: DARK.surface, borderRadius: 10, padding: 4, marginBottom: 20, gap: 4 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeBtnActive: { backgroundColor: DARK.accent },
  modeBtnText: { color: DARK.subtext, fontWeight: '600', fontSize: 13 },
  modeBtnTextActive: { color: '#000' },
  empty: { color: DARK.subtext, textAlign: 'center', marginTop: 40, lineHeight: 24 },
  tableHeader: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: DARK.card, marginBottom: 4,
  },
  headerCell: { color: DARK.subtext, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 6 },
  tableRowAlt: { backgroundColor: DARK.surface },
  cell: { color: DARK.text, fontSize: 13 },
  totalRow: {
    flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 4,
    marginTop: 8, borderTopWidth: 1, borderTopColor: DARK.card,
  },
  totalCell: { fontSize: 13, fontWeight: '700', color: DARK.text },
  labelCell: { flex: 1.2 },
  amountCell: { flex: 2, textAlign: 'right' },
});
