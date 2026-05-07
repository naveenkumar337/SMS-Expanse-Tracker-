// src/components/AddCashSheet.js

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import dayjs from 'dayjs';
import { colors, SPENT_FOR_OPTIONS } from '../utils/theme';

const DEFAULT_FORM = {
  purpose: '',
  cost: '',
  date: dayjs().format('DD MMM YYYY'),
  spentFor: 'Self',
};

export default function AddCashSheet({ visible, onSave, onClose }) {
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.purpose.trim()) e.purpose = 'Purpose is required';
    if (!form.cost || isNaN(Number(form.cost)) || Number(form.cost) <= 0)
      e.cost = 'Enter a valid amount';
    if (!form.date.trim()) e.date = 'Date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const txn = {
        id: `cash_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        purpose: form.purpose.trim(),
        cost: parseFloat(form.cost),
        date: form.date.trim(),
        rawDate: Date.now(),
        spentFor: form.spentFor,
        bank: 'Cash',
        paymentMode: 'Cash',
        bankPayment: 'Cash',
        merchant: form.purpose.trim(),
        rawSMS: '',
        isCash: true,
        synced: false,
      };
      await onSave(txn);
      setForm({ ...DEFAULT_FORM });
      setErrors({});
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setForm({ ...DEFAULT_FORM });
    setErrors({});
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Add Cash Transaction</Text>
            <Text style={styles.subtitle}>Manually record a cash payment</Text>

            <View style={styles.cashBadge}>
              <Text style={styles.cashBadgeText}>
                💵  This will be saved as Cash in Google Sheets
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Purpose */}
              <View style={styles.group}>
                <Text style={styles.label}>Purpose <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, errors.purpose && styles.inputError]}
                  value={form.purpose}
                  onChangeText={v => update('purpose', v)}
                  placeholder="e.g. Grocery, Auto fare, Tea stall..."
                  placeholderTextColor={colors.textHint}
                />
                {errors.purpose ? <Text style={styles.errorText}>{errors.purpose}</Text> : null}
              </View>

              {/* Cost */}
              <View style={styles.group}>
                <Text style={styles.label}>Cost (₹) <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, errors.cost && styles.inputError]}
                  value={form.cost}
                  onChangeText={v => update('cost', v)}
                  keyboardType="numeric"
                  placeholder="Enter amount"
                  placeholderTextColor={colors.textHint}
                />
                {errors.cost ? <Text style={styles.errorText}>{errors.cost}</Text> : null}
              </View>

              {/* Date */}
              <View style={styles.group}>
                <Text style={styles.label}>Date <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, errors.date && styles.inputError]}
                  value={form.date}
                  onChangeText={v => update('date', v)}
                  placeholder="DD MMM YYYY"
                  placeholderTextColor={colors.textHint}
                />
                {errors.date ? <Text style={styles.errorText}>{errors.date}</Text> : null}
              </View>

              {/* Spent For */}
              <View style={styles.group}>
                <Text style={styles.label}>Spent for</Text>
                <View style={styles.pillRow}>
                  {SPENT_FOR_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.pill, form.spentFor === opt && styles.pillActive]}
                      onPress={() => update('spentFor', opt)}
                    >
                      <Text style={[styles.pillText, form.spentFor === opt && styles.pillTextActive]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btnCancel} onPress={handleClose}>
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '90%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: 12 },
  cashBadge: { backgroundColor: colors.successLight, borderRadius: 8, padding: 9, marginBottom: 14 },
  cashBadgeText: { fontSize: 12, color: colors.success },
  group: { marginBottom: 14 },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: 5 },
  required: { color: colors.danger },
  input: {
    backgroundColor: '#f5f5f5', borderRadius: 8,
    borderWidth: 0.5, borderColor: colors.border,
    padding: 10, fontSize: 14, color: colors.textPrimary,
  },
  inputError: { borderColor: colors.danger },
  errorText: { fontSize: 11, color: colors.danger, marginTop: 3 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 0.5,
    borderColor: colors.border, backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 12, color: colors.textSecondary },
  pillTextActive: { color: '#fff' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnCancel: {
    flex: 1, padding: 12, borderRadius: 10,
    borderWidth: 0.5, borderColor: colors.border, alignItems: 'center',
  },
  btnCancelText: { fontSize: 14, color: colors.textSecondary },
  btnSave: {
    flex: 1, padding: 12, borderRadius: 10,
    backgroundColor: colors.success, alignItems: 'center',
  },
  btnSaveText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
