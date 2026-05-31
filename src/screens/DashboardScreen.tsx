import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  getMonthlyBalance, getCategoryBalances, getMonthlyBalancesForRange,
} from '../database/queries';
import { MonthlyBalance, CategoryBalance } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA',
  income: '#4CAF50', expense: '#F44336', accent: '#BB86FC',
};

type PeriodMode = 'month' | 'year' | 'range';

const DE_MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DE_MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

const CHART_H = 130;
const COL_W   = 42;
const BAR_W   = 14;

const formatCurrency = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const getCurrentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const offsetMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmtLong = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${DE_MONTHS[m - 1]} ${y}`;
};

const fmtShort = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${DE_MONTHS_SHORT[m - 1]} ${y}`;
};

// ── Bar chart (pure View, no SVG dep) ────────────────────────────────────────

function BarChart({ data }: { data: MonthlyBalance[] }) {
  if (data.length === 0) return null;
  const hasData = data.some(d => d.income > 0 || d.expenses > 0);
  if (!hasData) return <Text style={cs.noData}>Keine Buchungen in diesem Zeitraum</Text>;

  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expenses]), 1);
  const useShort = data.length <= 7;

  return (
    <View>
      <View style={cs.legend}>
        {[['Einnahmen', DARK.income], ['Ausgaben', DARK.expense]].map(([label, color]) => (
          <View key={label} style={cs.legendItem}>
            <View style={[cs.legendDot, { backgroundColor: color }]} />
            <Text style={cs.legendText}>{label}</Text>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 2 }}>
          {data.map(d => {
            const [, m] = d.month.split('-').map(Number);
            const incH = d.income   > 0 ? Math.max(Math.round(d.income   / maxVal * CHART_H), 3) : 0;
            const expH = d.expenses > 0 ? Math.max(Math.round(d.expenses / maxVal * CHART_H), 3) : 0;
            const label = useShort ? DE_MONTHS_SHORT[m - 1] : DE_MONTHS_SHORT[m - 1][0];
            return (
              <View key={d.month} style={{ width: COL_W, alignItems: 'center' }}>
                <View style={{ height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 3, justifyContent: 'center' }}>
                  <View style={{ width: BAR_W, height: incH, backgroundColor: DARK.income, borderRadius: 3 }} />
                  <View style={{ width: BAR_W, height: expH, backgroundColor: DARK.expense, borderRadius: 3 }} />
                </View>
                <Text style={cs.barLabel}>{label}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const cs = StyleSheet.create({
  legend:     { flexDirection: 'row', gap: 16, marginBottom: 8, justifyContent: 'flex-end' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: DARK.subtext, fontSize: 11 },
  barLabel:   { color: DARK.subtext, fontSize: 10, marginTop: 5, textAlign: 'center' },
  noData:     { color: DARK.subtext, textAlign: 'center', paddingVertical: 24, fontSize: 13 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const now = new Date();

  const [mode, setMode]         = useState<PeriodMode>('month');
  const [month, setMonth]       = useState(getCurrentMonth());
  const [year, setYear]         = useState(now.getFullYear());
  const [rangeFrom, setRangeFrom] = useState(offsetMonth(getCurrentMonth(), -5));
  const [rangeTo,   setRangeTo]   = useState(getCurrentMonth());
  const [typeFilter, setTypeFilter] = useState<'income' | 'expense' | null>(null);
  const [loading, setLoading]   = useState(true);

  const [balance,    setBalance]    = useState<MonthlyBalance | null>(null);
  const [categories, setCategories] = useState<CategoryBalance[]>([]);
  const [chartData,  setChartData]  = useState<MonthlyBalance[]>([]);

  // Zeitraum month picker
  const [pickerField, setPickerField] = useState<'from' | 'to' | null>(null);
  const [pickerYear,  setPickerYear]  = useState(now.getFullYear());

  const openPicker = (field: 'from' | 'to') => {
    const ym = field === 'from' ? rangeFrom : rangeTo;
    setPickerYear(parseInt(ym.split('-')[0]));
    setPickerField(field);
  };

  const handlePickerSelect = (ym: string) => {
    if (pickerField === 'from') setRangeFrom(ym);
    else                        setRangeTo(ym);
    setPickerField(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'month') {
        const [b, c] = await Promise.all([
          getMonthlyBalance(month),
          getCategoryBalances(month, typeFilter ?? undefined),
        ]);
        setBalance(b);
        setCategories(c);
        setChartData([]);
      } else {
        const from = mode === 'year' ? `${year}-01` : rangeFrom;
        const to   = mode === 'year' ? `${year}-12` : rangeTo;
        const data = await getMonthlyBalancesForRange(from, to);
        setChartData(data);
        const income   = data.reduce((s, d) => s + d.income,   0);
        const expenses = data.reduce((s, d) => s + d.expenses, 0);
        setBalance({ month: from, income, expenses, balance: income - expenses });
        setCategories([]);
      }
    } finally {
      setLoading(false);
    }
  }, [mode, month, year, rangeFrom, rangeTo, typeFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCategory = (cat: CategoryBalance) => {
    navigation.navigate('Transactions', {
      screen: 'TransactionsList',
      params: { filterCategoryId: cat.categoryId, filterMonth: month, typeFilter: typeFilter ?? undefined },
    });
  };

  const periodTitle = () => {
    if (mode === 'month') return fmtLong(month);
    if (mode === 'year')  return String(year);
    return `${fmtShort(rangeFrom)} – ${fmtShort(rangeTo)}`;
  };

  const switchMode = (m: PeriodMode) => {
    setMode(m);
    setTypeFilter(null);
  };

  return (
    <View style={s.root}>
      {/* Period mode tabs */}
      <View style={s.modeTabs}>
        {(['month', 'year', 'range'] as PeriodMode[]).map(pm => (
          <TouchableOpacity
            key={pm}
            style={[s.modeTab, mode === pm && s.modeTabActive]}
            onPress={() => switchMode(pm)}
          >
            <Text style={[s.modeTabText, mode === pm && s.modeTabTextActive]}>
              {pm === 'month' ? 'Monat' : pm === 'year' ? 'Jahr' : 'Zeitraum'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>

        {/* Navigation row */}
        {mode === 'month' && (
          <View style={s.navRow}>
            <TouchableOpacity onPress={() => setMonth(p => offsetMonth(p, -1))} style={s.navBtn}>
              <Text style={s.navBtnText}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={s.periodTitle}>{fmtLong(month)}</Text>
            <TouchableOpacity onPress={() => setMonth(p => offsetMonth(p, 1))} style={s.navBtn}>
              <Text style={s.navBtnText}>{'>'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'year' && (
          <View style={s.navRow}>
            <TouchableOpacity onPress={() => setYear(y => y - 1)} style={s.navBtn}>
              <Text style={s.navBtnText}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={s.periodTitle}>{year}</Text>
            <TouchableOpacity onPress={() => setYear(y => y + 1)} style={s.navBtn}>
              <Text style={s.navBtnText}>{'>'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'range' && (
          <View style={s.rangeRow}>
            <TouchableOpacity style={s.rangeChip} onPress={() => openPicker('from')}>
              <Text style={s.rangeChipLabel}>Von</Text>
              <Text style={s.rangeChipValue}>{fmtShort(rangeFrom)}</Text>
            </TouchableOpacity>
            <Text style={s.rangeSep}>→</Text>
            <TouchableOpacity style={s.rangeChip} onPress={() => openPicker('to')}>
              <Text style={s.rangeChipLabel}>Bis</Text>
              <Text style={s.rangeChipValue}>{fmtShort(rangeTo)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading
          ? <ActivityIndicator color={DARK.accent} style={{ marginTop: 48 }} />
          : (
            <>
              {/* Summary card */}
              {balance && (
                <View style={s.balanceCard}>
                  <Text style={s.balanceLabel}>Saldo · {periodTitle()}</Text>
                  <Text style={[s.balanceAmount, { color: balance.balance >= 0 ? DARK.income : DARK.expense }]}>
                    {formatCurrency(balance.balance)}
                  </Text>
                  <View style={s.tilesRow}>
                    <TouchableOpacity
                      style={[s.tile, mode === 'month' && typeFilter === 'income' && s.tileActiveIncome]}
                      onPress={() => mode === 'month' && setTypeFilter(f => f === 'income' ? null : 'income')}
                      activeOpacity={mode === 'month' ? 0.7 : 1}
                    >
                      <Text style={s.tileLabel}>Einnahmen</Text>
                      <Text style={[s.tileAmount, { color: DARK.income }]}>{formatCurrency(balance.income)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.tile, mode === 'month' && typeFilter === 'expense' && s.tileActiveExpense]}
                      onPress={() => mode === 'month' && setTypeFilter(f => f === 'expense' ? null : 'expense')}
                      activeOpacity={mode === 'month' ? 0.7 : 1}
                    >
                      <Text style={s.tileLabel}>Ausgaben</Text>
                      <Text style={[s.tileAmount, { color: DARK.expense }]}>{formatCurrency(balance.expenses)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Bar chart — Jahr / Zeitraum */}
              {(mode === 'year' || mode === 'range') && (
                <View style={s.chartCard}>
                  <BarChart data={chartData} />
                </View>
              )}

              {/* Category breakdown — Monat only */}
              {mode === 'month' && (
                <>
                  <Text style={s.sectionTitle}>
                    Kategorien
                    {typeFilter === 'income' ? ' · Einnahmen' : typeFilter === 'expense' ? ' · Ausgaben' : ''}
                  </Text>
                  {categories.length === 0
                    ? <Text style={s.emptyText}>Keine Buchungen in diesem Monat</Text>
                    : categories.map(cat => (
                        <TouchableOpacity
                          key={cat.categoryId}
                          style={s.catRow}
                          onPress={() => openCategory(cat)}
                          activeOpacity={0.7}
                        >
                          <View style={[s.dot, { backgroundColor: cat.categoryColor }]} />
                          <Text style={s.catName}>{cat.categoryName}</Text>
                          <Text style={s.catCount}>{cat.count} Buchung{cat.count !== 1 ? 'en' : ''}</Text>
                          <Text style={[s.catAmount, { color: DARK.expense }]}>{formatCurrency(cat.total)}</Text>
                        </TouchableOpacity>
                      ))
                  }
                </>
              )}
            </>
          )
        }
      </ScrollView>

      {/* Month picker modal */}
      <Modal visible={pickerField !== null} transparent animationType="fade">
        <View style={s.pickerOverlay}>
          <View style={s.pickerBox}>
            <Text style={s.pickerTitle}>
              {pickerField === 'from' ? 'Von' : 'Bis'}
            </Text>
            <View style={s.pickerYearRow}>
              <TouchableOpacity onPress={() => setPickerYear(y => y - 1)} style={s.pickerNavBtn}>
                <Text style={s.pickerNavText}>{'<'}</Text>
              </TouchableOpacity>
              <Text style={s.pickerYearText}>{pickerYear}</Text>
              <TouchableOpacity onPress={() => setPickerYear(y => y + 1)} style={s.pickerNavBtn}>
                <Text style={s.pickerNavText}>{'>'}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.monthGrid}>
              {DE_MONTHS_SHORT.map((name, idx) => {
                const ym = `${pickerYear}-${String(idx + 1).padStart(2, '0')}`;
                const isSel = ym === (pickerField === 'from' ? rangeFrom : rangeTo);
                return (
                  <TouchableOpacity
                    key={ym}
                    style={[s.monthCell, isSel && s.monthCellSelected]}
                    onPress={() => handlePickerSelect(ym)}
                  >
                    <Text style={[s.monthCellText, isSel && s.monthCellTextSelected]}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={s.pickerClose} onPress={() => setPickerField(null)}>
              <Text style={s.pickerCloseText}>Schließen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },

  // Mode tabs
  modeTabs: {
    flexDirection: 'row', backgroundColor: DARK.surface,
    borderBottomWidth: 1, borderBottomColor: DARK.card,
  },
  modeTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  modeTabActive: { borderBottomColor: DARK.accent },
  modeTabText: { color: DARK.subtext, fontSize: 14, fontWeight: '500' },
  modeTabTextActive: { color: DARK.accent, fontWeight: '700' },

  // Navigation
  navRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  navBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  navBtnText: { color: DARK.accent, fontSize: 22, fontWeight: '600' },
  periodTitle: { color: DARK.text, fontSize: 18, fontWeight: '600' },

  // Range picker row
  rangeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, marginBottom: 16,
  },
  rangeChip: {
    flex: 1, backgroundColor: DARK.surface, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: DARK.card,
  },
  rangeChipLabel: { color: DARK.subtext, fontSize: 11, marginBottom: 2 },
  rangeChipValue: { color: DARK.text, fontSize: 15, fontWeight: '600' },
  rangeSep: { color: DARK.subtext, fontSize: 18 },

  // Balance card
  balanceCard: {
    backgroundColor: DARK.surface, borderRadius: 12, padding: 20, marginBottom: 16,
  },
  balanceLabel: { color: DARK.subtext, fontSize: 12, marginBottom: 4 },
  balanceAmount: { fontSize: 34, fontWeight: 'bold', marginBottom: 14 },
  tilesRow: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1, backgroundColor: DARK.card, borderRadius: 8, padding: 12,
    borderWidth: 2, borderColor: 'transparent',
  },
  tileActiveIncome:  { borderColor: DARK.income },
  tileActiveExpense: { borderColor: DARK.expense },
  tileLabel:  { color: DARK.subtext, fontSize: 12 },
  tileAmount: { fontSize: 17, fontWeight: '600', marginTop: 4 },

  // Chart card
  chartCard: {
    backgroundColor: DARK.surface, borderRadius: 12, padding: 16, marginBottom: 16,
  },

  // Category list
  sectionTitle: { color: DARK.text, fontSize: 16, fontWeight: '600', marginBottom: 10 },
  emptyText: { color: DARK.subtext, textAlign: 'center', marginTop: 16 },
  catRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DARK.surface,
    borderRadius: 8, padding: 12, marginBottom: 8,
  },
  dot:       { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  catName:   { flex: 1, color: DARK.text, fontSize: 14 },
  catCount:  { color: DARK.subtext, fontSize: 12, marginRight: 10 },
  catAmount: { fontSize: 14, fontWeight: '600' },

  // Month picker modal
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  pickerBox: {
    backgroundColor: DARK.surface, borderRadius: 16, padding: 20, width: '100%',
  },
  pickerTitle: {
    color: DARK.subtext, fontSize: 12, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  pickerYearRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  pickerNavBtn: { padding: 8 },
  pickerNavText: { color: DARK.accent, fontSize: 20, fontWeight: '700' },
  pickerYearText: { color: DARK.text, fontSize: 20, fontWeight: '700' },
  monthGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12,
  },
  monthCell: {
    width: '22%', paddingVertical: 12,
    borderRadius: 8, backgroundColor: DARK.card, alignItems: 'center',
  },
  monthCellSelected:  { backgroundColor: DARK.accent },
  monthCellText:      { color: DARK.subtext, fontSize: 14 },
  monthCellTextSelected: { color: DARK.bg, fontWeight: '700' },
  pickerClose: { alignItems: 'center', paddingTop: 4, paddingBottom: 2 },
  pickerCloseText: { color: DARK.subtext, fontSize: 14 },
});
