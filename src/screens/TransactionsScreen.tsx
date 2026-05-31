import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TouchableHighlight,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getTransactions, deleteTransaction } from '../database/queries';
import { Transaction, TransactionsStackParamList } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', text: '#FFFFFF',
  subtext: '#AAAAAA', income: '#4CAF50', expense: '#F44336', manual: '#FFB74D',
};

type NavProp = NativeStackNavigationProp<TransactionsStackParamList, 'TransactionsList'>;

const formatCurrency = (amount: number) =>
  amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NavProp>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTransactions(await getTransactions());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
      {
        text: 'Bearbeiten',
        onPress: () => navigation.navigate('AddTransaction', { transaction: item }),
      },
      { text: 'Löschen', style: 'destructive', onPress: () => confirmDelete(item) },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#BB86FC" size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => navigation.navigate('AddTransaction', {})}
      >
        <Text style={styles.addBtnText}>+ Buchung hinzufügen</Text>
      </TouchableOpacity>

      <FlatList
        data={transactions}
        keyExtractor={item => String(item.id)}
        ListEmptyComponent={<Text style={styles.empty}>Keine Buchungen vorhanden</Text>}
        renderItem={({ item }) => {
          const manual = item.isManual === 1;
          return (
            <TouchableHighlight
              underlayColor="#333"
              onLongPress={() => handleLongPress(item)}
              style={[styles.item, manual && styles.manualItem]}
            >
              <>
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
              </>
            </TouchableHighlight>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' },
  addBtn: {
    margin: 12, backgroundColor: '#1E1E1E', borderRadius: 10,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#BB86FC',
  },
  addBtnText: { color: '#BB86FC', fontWeight: '600' },
  empty: { color: DARK.subtext, textAlign: 'center', marginTop: 40 },
  item: {
    marginHorizontal: 12, marginTop: 8, borderRadius: 10,
    backgroundColor: DARK.surface, overflow: 'hidden',
  },
  manualItem: {
    borderWidth: 1,
    borderColor: DARK.manual,
    borderStyle: 'dashed',
  },
  manualBadge: {
    backgroundColor: '#3D2E00',
    paddingHorizontal: 10, paddingVertical: 3,
    alignSelf: 'flex-start',
    borderBottomRightRadius: 8,
  },
  manualBadgeText: { color: DARK.manual, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  info: { flex: 1 },
  desc: { color: DARK.text, fontSize: 14, fontWeight: '500' },
  meta: { color: DARK.subtext, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '600' },
});
