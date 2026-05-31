import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getCategories, addCategory, deleteCategory } from '../database/queries';
import { Category } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', text: '#FFFFFF',
  subtext: '#AAAAAA', accent: '#BB86FC',
};

const PRESET_COLORS = [
  '#4CAF50', '#F44336', '#FF9800', '#2196F3', '#9C27B0',
  '#00BCD4', '#607D8B', '#9E9E9E', '#E91E63', '#FF5722',
];

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [newType, setNewType] = useState<'income' | 'expense' | 'both'>('expense');

  const load = useCallback(async () => {
    setCategories(await getCategories());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    if (!newName.trim()) { Alert.alert('Fehler', 'Name eingeben'); return; }
    await addCategory({ name: newName.trim(), color: newColor, icon: 'ellipsis-horizontal', type: newType });
    setNewName('');
    setModalVisible(false);
    load();
  };

  const handleDelete = (cat: Category) => {
    Alert.alert('Löschen', `"${cat.name}" löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive',
        onPress: async () => { await deleteCategory(cat.id); load(); },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={categories}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.item} onLongPress={() => handleDelete(item)}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.type}>{item.type}</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Neue Kategorie</Text>
            <TextInput
              style={styles.input} value={newName} onChangeText={setNewName}
              placeholder="Name" placeholderTextColor={DARK.subtext}
            />
            <View style={styles.colorRow}>
              {PRESET_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, newColor === c && styles.colorSelected]}
                  onPress={() => setNewColor(c)}
                />
              ))}
            </View>
            <View style={styles.typeRow}>
              {(['expense', 'income', 'both'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, newType === t && styles.typeBtnActive]}
                  onPress={() => setNewType(t)}
                >
                  <Text style={styles.typeBtnText}>
                    {t === 'expense' ? 'Ausgabe' : t === 'income' ? 'Einnahme' : 'Beides'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.cancel}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd}>
                <Text style={styles.confirm}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK.bg },
  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DARK.surface,
    marginHorizontal: 12, marginTop: 8, borderRadius: 10, padding: 14,
  },
  dot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
  name: { flex: 1, color: DARK.text, fontSize: 15 },
  type: { color: DARK.subtext, fontSize: 12 },
  fab: {
    position: 'absolute', bottom: 24, right: 24, backgroundColor: DARK.accent,
    width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6,
  },
  fabText: { color: '#000', fontSize: 28, fontWeight: 'bold', lineHeight: 32 },
  modalOverlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  modal: { backgroundColor: DARK.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { color: DARK.text, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: '#2C2C2C', color: DARK.text, borderRadius: 10,
    padding: 12, marginBottom: 14, fontSize: 15,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorSelected: { borderWidth: 3, borderColor: '#fff' },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeBtn: { flex: 1, backgroundColor: '#2C2C2C', borderRadius: 8, padding: 10, alignItems: 'center' },
  typeBtnActive: { backgroundColor: DARK.accent },
  typeBtnText: { color: DARK.text, fontSize: 13 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cancel: { color: DARK.subtext, fontSize: 16 },
  confirm: { color: DARK.accent, fontSize: 16, fontWeight: '700' },
});
