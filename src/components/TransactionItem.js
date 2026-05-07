// src/components/TransactionItem.js

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, PURPOSE_ICONS, getSpentForColor } from '../utils/theme';

export default function TransactionItem({ transaction, onEdit }) {
  const isCash = transaction.isCash || transaction.bankPayment === 'Cash';
  const icon = isCash ? '💵' : (PURPOSE_ICONS[transaction.purpose] || PURPOSE_ICONS['']);
  const spentColor = getSpentForColor(transaction.spentFor);

  return (
    <View style={[styles.container, isCash && styles.cashRow]}>
      <View style={[styles.iconWrap, isCash && styles.cashIconWrap]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {transaction.merchant || transaction.purpose || 'Transaction'}
        </Text>
        <Text style={styles.time}>
          {transaction.date}{isCash ? ' · Manual entry' : ''}
        </Text>
        <View style={styles.tagRow}>
          <View style={[styles.tag, { backgroundColor: spentColor.bg }]}>
            <Text style={[styles.tagText, { color: spentColor.text }]}>
              {transaction.spentFor}
            </Text>
          </View>
          {isCash ? (
            <View style={styles.cashTag}>
              <Text style={styles.cashTagText}>💵 Cash</Text>
            </View>
          ) : (
            <View style={styles.payTag}>
              <Text style={styles.payTagText}>{transaction.bankPayment}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.amount}>₹{Number(transaction.cost).toLocaleString('en-IN')}</Text>
        <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(transaction)}>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
        {!transaction.synced && <View style={styles.unsyncDot} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
    gap: 10,
  },
  cashRow: { backgroundColor: '#f9fff9' },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
  },
  cashIconWrap: { backgroundColor: '#E8F5E9' },
  icon: { fontSize: 16 },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  time: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  tagRow: { flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  tagText: { fontSize: 10, fontWeight: '500' },
  cashTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: '#E8F5E9' },
  cashTagText: { fontSize: 10, color: '#2e7d32', fontWeight: '500' },
  payTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.warningLight },
  payTagText: { fontSize: 10, color: colors.warning, fontWeight: '500' },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 13, fontWeight: '700', color: colors.danger },
  editBtn: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    borderWidth: 0.5, borderColor: colors.primary,
  },
  editText: { fontSize: 10, color: colors.primary },
  unsyncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
});
