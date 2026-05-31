import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  TextInput, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getCategories, addCategory, updateCategory, deleteCategory } from '../database/queries';
import { Category } from '../types';

const DARK = {
  bg: '#121212', surface: '#1E1E1E', card: '#2C2C2C',
  text: '#FFFFFF', subtext: '#AAAAAA', accent: '#BB86FC',
};

const PRESET_COLORS = [
  '#4CAF50', '#F44336', '#FF9800', '#2196F3', '#9C27B0',
  '#00BCD4', '#607D8B', '#9E9E9E', '#E91E63', '#FF5722',
];

const TYPE_LABELS: Record<string, string> = {
  expense: 'Ausgabe', income: 'Einnahme', both: 'Beides',
};

const EMPTY_FORM = {
  name: '', color: PRESET_COLORS[0],
  type: 'expense' as Category['type'], keywords: '',
};

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [kwInput, setKwInput] = useState('');

  const load = useCallback(async () => {
    setCategories(await getCategories());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setKwInput('');
    setModalVisible(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({ name: cat.name, color: cat.color, type: cat.type, keywords: cat.keywords ?? '' });
    setKwInput('');
    setModalVisible(true);
  };

  const kwList = (): string[] =>
    form.keywords.split(',').map(k => k.trim()).filter(Boolean);

  const addKw = () => {
    const kw = kwInput.trim().toLowerCase();
    if (!kw) return;
    const existing = kwList();
    if (!existing.includes(kw)) {
      setForm(f => ({ ...f, keywords: [...existing, kw].join(', ') }));
    }
    setKwInput('');
  };

  const removeKw = (kw: string) => {
    setForm(f => ({ ...f, keywords: kwList().filter(k => k !== kw).join(', ') }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Fehler', 'Name eingeben'); return; }
    const data = {
      name: form.name.trim(),
      color: form.color,
      icon: editing?.icon ?? 'ellipsis-horizontal',
      type: form.type,
      keywords: form.keywords,
      amount_rules: editing?.amount_rules ?? '',
    };
    if (editing) {
      await updateCategory(editing.id, data);
    } else {
      await addCategory({ ...data, keywords: data.keywords });
    }
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
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item }) => {
          const kws = (item.keywords ?? '').split(',').map(k => k.trim()).filter(Boolean);
          return (
            <TouchableOpacity
              style={styles.item}
              onPress={() => openEdit(item)}
              onLongPress={() => handleDelete(item)}
            >
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <View style={styles.itemInfo}>
                <View style={styles.itemRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.typeLabel}>{TYPE_LABELS[item.type]}</Text>
                </View>
                {kws.length > 0 ? (
                  <Text style={styles.kwPreview} numberOfLines={1}>
                    {kws.join(' · ')}
                  </Text>
                ) : (
                  <Text style={styles.kwEmpty}>Keine Stichworte</Text>
                )}
              </View>
              <Text style={styles.editHint}>›</Text>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={styles.fab} onPress={openCreate}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {editing ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Name */}
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={name => setForm(f => ({ ...f, name }))}
                placeholder="Kategoriename"
                placeholderTextColor={DARK.subtext}
              />

              {/* Color */}
              <Text style={styles.fieldLabel}>Farbe</Text>
              <View style={styles.colorRow}>
                {PRESET_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, form.color === c && styles.colorSelected]}
                    onPress={() => setForm(f => ({ ...f, color: c }))}
                  />
                ))}
              </View>

              {/* Type */}
              <Text style={styles.fieldLabel}>Typ</Text>
              <View style={styles.typeRow}>
                {(['expense', 'income', 'both'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, form.type === t && { backgroundColor: form.color }]}
                    onPress={() => setForm(f => ({ ...f, type: t }))}
                  >
                    <Text style={styles.typeBtnText}>{TYPE_LABELS[t]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Keywords */}
              <Text style={styles.fieldLabel}>Stichworte für Auto-Erkennung</Text>
              <Text style={styles.fieldHint}>
                Buchungen, die eines dieser Stichworte enthalten, werden beim Import automatisch dieser Kategorie zugeordnet.
              </Text>

              {/* Current keywords as chips */}
              {kwList().length > 0 && (
                <View style={styles.kwChipRow}>
                  {kwList().map(kw => (
                    <TouchableOpacity key={kw} style={styles.kwChip} onPress={() => removeKw(kw)}>
                      <Text style={styles.kwChipText}>{kw}</Text>
                      <Text style={styles.kwRemove}> ×</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Add keyword */}
              <View style={styles.kwInputRow}>
                <TextInput
                  style={styles.kwInput}
                  value={kwInput}
                  onChangeText={setKwInput}
                  placeholder="Stichwort eingeben..."
                  placeholderTextColor={DARK.subtext}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={addKw}
                />
                <TouchableOpacity style={styles.kwAddBtn} onPress={addKw}>
                  <Text style={styles.kwAddBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>
                    {editing ? 'Speichern' : 'Hinzufügen'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  dot: { width: 14, height: 14, borderRadius: 7, marginRight: 12, flexShrink: 0 },
  itemInfo: { flex: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { color: DARK.text, fontSize: 15, fontWeight: '500' },
  typeLabel: { color: DARK.subtext, fontSize: 11 },
  kwPreview: { color: DARK.accent, fontSize: 12, marginTop: 3, opacity: 0.8 },
  kwEmpty: { color: DARK.subtext, fontSize: 12, marginTop: 3, fontStyle: 'italic' },
  editHint: { color: DARK.subtext, fontSize: 18, marginLeft: 8 },

  fab: {
    position: 'absolute', bottom: 24, right: 24, backgroundColor: DARK.accent,
    width: 56, height: 56, borderRadius: 28, justifyContent: 'center',
    alignItems: 'center', elevation: 6,
  },
  fabText: { color: '#000', fontSize: 28, fontWeight: 'bold', lineHeight: 32 },

  modalOverlay: { flex: 1, backgroundColor: '#000000BB', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: DARK.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '90%',
  },
  modalTitle: { color: DARK.text, fontSize: 18, fontWeight: '700', marginBottom: 16 },

  fieldLabel: { color: DARK.subtext, fontSize: 12, marginBottom: 6, marginTop: 14 },
  fieldHint: { color: DARK.subtext, fontSize: 11, marginBottom: 8, lineHeight: 16, fontStyle: 'italic' },

  input: {
    backgroundColor: DARK.card, color: DARK.text, borderRadius: 10,
    padding: 12, fontSize: 15,
  },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorSelected: { borderWidth: 3, borderColor: '#fff' },

  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: { flex: 1, backgroundColor: DARK.card, borderRadius: 8, padding: 10, alignItems: 'center' },
  typeBtnText: { color: DARK.text, fontSize: 13 },

  kwChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  kwChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2A1F4A', borderRadius: 12,
    paddingVertical: 4, paddingHorizontal: 10,
    borderWidth: 1, borderColor: DARK.accent,
  },
  kwChipText: { color: DARK.accent, fontSize: 13 },
  kwRemove: { color: DARK.accent, fontSize: 13 },

  kwInputRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  kwInput: {
    flex: 1, backgroundColor: DARK.card, color: DARK.text,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
  },
  kwAddBtn: {
    backgroundColor: DARK.accent, borderRadius: 8,
    width: 42, alignItems: 'center', justifyContent: 'center',
  },
  kwAddBtnText: { color: '#000', fontSize: 22, fontWeight: '700' },

  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 },
  cancelBtn: { padding: 10 },
  cancelBtnText: { color: DARK.subtext, fontSize: 16 },
  saveBtn: { backgroundColor: DARK.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
