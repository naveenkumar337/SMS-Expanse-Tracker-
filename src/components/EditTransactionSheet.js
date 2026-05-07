// src/components/EditTransactionSheet.js

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { colors, SPENT_FOR_OPTIONS, BANK_OPTIONS, PAYMENT_MODE_OPTIONS } from '../utils/theme';

export default function EditTransactionSheet({ visible, transaction, onSave, onClose }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (transaction) setForm({ ...transaction });
  }, [transaction]);

  if (!transaction) return null;

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ ...form, bankPayment: `${form.bank} — ${form.paymentMode}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Edit Transaction</Text>

            {/* Parsed from badge */}
            <View style={styles.parsedBadge}>
              <Text style={styles.parsedText}>
                Auto-parsed · {form.bank} · {form.date}
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Purpose */}
              <View style={styles.group}>
                <Text style={styles.label}>Purpose</Text>
                <TextInput
                  style={styles.input}
                  value={form.purpose}
                  onChangeText={v => update('purpose', v)}
                  placeholder="e.g. Food & Dining"
                  placeholderTextColor={colors.textHint}
                />
              </View>

              {/* Cost */}
              <View style={styles.group}>
                <Text style={styles.label}>Cost (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={String(form.cost || '')}
                  onChangeText={v => update('cost', v)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textHint}
                />
              </View>

              {/* Date */}
              <View style={styles.group}>
                <Text style={styles.label}>Date</Text>
                <TextInput
                  style={styles.input}
                  value={form.date}
                  onChangeText={v => update('date', v)}
                  placeholder="DD MMM YYYY"
                  placeholderTextColor={colors.textHint}
                />
              </View>

              {/* Bank & Payment Mode */}
              <View style={styles.group}>
                <Text style={styles.label}>Bank &amp; Payment Mode</Text>
                <View style={styles.row}>
                  <View style={[styles.pickerWrap, { flex: 1, marginRight: 6 }]}>
                    {BANK_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.pill, form.bank === opt && styles.pillActive]}
                        onPress={() => update('bank', opt)}
                      >
                        <Text style={[styles.pillText, form.bank === opt && styles.pillTextActive]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={[styles.row, { marginTop: 6, flexWrap: 'wrap' }]}>
                  {PAYMENT_MODE_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.pill, form.paymentMode === opt && styles.pillActive, { marginBottom: 6 }]}
                      onPress={() => update('paymentMode', opt)}
                    >
                      <Text style={[styles.pillText, form.paymentMode === opt && styles.pillTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.hint}>Auto-detected · tap to change if incorrect</Text>
              </View>

              {/* Spent For */}
              <View style={styles.group}>
                <Text style={styles.label}>Spent for</Text>
                <View style={[styles.row, { flexWrap: 'wrap' }]}>
                  {SPENT_FOR_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.pill, form.spentFor === opt && styles.pillActive, { marginBottom: 6 }]}
                      onPress={() => update('spentFor', opt)}
                    >
                      <Text style={[styles.pillText, form.spentFor === opt && styles.pillTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Buttons */}
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
                  <Text style={styles.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSave} onPress={handleSave} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.btnSaveText}>Save to Sheet</Text>
                  }
                </TouchableOpacity>
              </View>

              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 12 },
  parsedBadge: {
    backgroundColor: colors.successLight,
    borderRadius: 8, padding: 8,
    marginBottom: 14,
  },
  parsedText: { fontSize: 12, color: colors.success },
  group: { marginBottom: 14 },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: 5 },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 12, color: colors.textSecondary },
  pillTextActive: { color: '#fff' },
  hint: { fontSize: 10, color: colors.textHint, marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnCancel: {
    flex: 1, padding: 12,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  btnCancelText: { fontSize: 14, color: colors.textSecondary },
  btnSave: {
    flex: 1, padding: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  btnSaveText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
