// src/components/PeriodViewSheet.js

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { colors } from '../utils/theme';
import TransactionItem from './TransactionItem';

dayjs.extend(customParseFormat);

export default function PeriodViewSheet({ visible, transactions, onEdit, onDelete, onClose }) {
  const [period, setPeriod] = useState('week'); // 'week' or 'month'
  const [filteredTransactions, setFilteredTransactions] = useState([]);

  useEffect(() => {
    if (!visible) return;

    const now = dayjs();
    let filtered = [];

    if (period === 'week') {
      const weekStart = now.startOf('week');
      const weekEnd = now.endOf('week');
      filtered = transactions.filter(t => {
        const txnDate = dayjs(t.date, 'DD MMM YYYY');
        return txnDate.isValid() && txnDate.isAfter(weekStart) && txnDate.isBefore(weekEnd);
      });
    } else if (period === 'month') {
      const monthStart = now.startOf('month');
      const monthEnd = now.endOf('month');
      filtered = transactions.filter(t => {
        const txnDate = dayjs(t.date, 'DD MMM YYYY');
        return txnDate.isValid() && txnDate.isAfter(monthStart) && txnDate.isBefore(monthEnd);
      });
    }

    // Sort by date descending
    filtered.sort((a, b) => {
      const da = dayjs(a.date, 'DD MMM YYYY');
      const db = dayjs(b.date, 'DD MMM YYYY');
      if (!da.isValid() || !db.isValid()) return 0;
      return db.valueOf() - da.valueOf();
    });

    setFilteredTransactions(filtered);
  }, [visible, period, transactions]);

  const totalExpense = filteredTransactions
    .filter(t => t.type !== 'income')
    .reduce((sum, t) => sum + Number(t.cost), 0);

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.cost), 0);

  const periodLabel = period === 'week' 
    ? `${dayjs().startOf('week').format('DD MMM')} - ${dayjs().endOf('week').format('DD MMM')}`
    : dayjs().format('MMMM YYYY');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Transaction View</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Period Toggle */}
          <View style={styles.periodToggle}>
            <TouchableOpacity
              style={[styles.periodBtn, period === 'week' && styles.periodBtnActive]}
              onPress={() => setPeriod('week')}
            >
              <Text style={[styles.periodBtnText, period === 'week' && styles.periodBtnTextActive]}>
                This Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.periodBtn, period === 'month' && styles.periodBtnActive]}
              onPress={() => setPeriod('month')}
            >
              <Text style={[styles.periodBtnText, period === 'month' && styles.periodBtnTextActive]}>
                This Month
              </Text>
            </TouchableOpacity>
          </View>

          {/* Summary */}
          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Period</Text>
              <Text style={styles.summaryValue}>{periodLabel}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Transactions</Text>
              <Text style={styles.summaryValue}>{filteredTransactions.length}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Expense</Text>
              <Text style={[styles.summaryValue, { color: colors.danger }]}>
                ₹{totalExpense.toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Income</Text>
              <Text style={[styles.summaryValue, { color: colors.income }]}>
                ₹{totalIncome.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>

          {/* Transaction List */}
          <ScrollView style={styles.list}>
            {filteredTransactions.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>No transactions for this period</Text>
              </View>
            ) : (
              filteredTransactions.map((txn) => (
                <TransactionItem key={txn.id} transaction={txn} onEdit={onEdit} onDelete={onDelete} />
              ))
            )}
          </ScrollView>
        </View>
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
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
  closeBtn: { fontSize: 24, color: colors.textSecondary },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  periodBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: colors.primary },
  periodBtnText: { fontSize: 14, color: colors.textSecondary },
  periodBtnTextActive: { color: '#fff', fontWeight: '600' },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#f0f4ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  summaryItem: {
    flexBasis: '45%',
    flexGrow: 1,
  },
  summaryLabel: { fontSize: 11, color: colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
  list: { flex: 1 },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
});