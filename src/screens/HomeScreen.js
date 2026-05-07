// src/screens/HomeScreen.js

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, SectionList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { colors } from '../utils/theme';
import TransactionItem from '../components/TransactionItem';
import EditTransactionSheet from '../components/EditTransactionSheet';
import AddCashSheet from '../components/AddCashSheet';
import { readAndParseBankSMS } from '../services/smsReader';
import { appendTransaction, updateTransaction, fetchTransactions } from '../services/googleSheets';
import { loadAccessToken } from '../services/googleSheets';

const FILTERS = ['All', 'Today', 'This Week', 'Cash', 'HDFC', 'Canara'];

export default function HomeScreen() {
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('All');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [showAddCash, setShowAddCash] = useState(false);
  const [showAddCash, setShowAddCash] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const existingIds = useRef(new Set());

  // ── Load token and initial data ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const token = await loadAccessToken();
      setAccessToken(token);
      if (token) {
        await loadSheetTransactions(token);
      }
      setLoading(false);
    })();
  }, []);

  // ── Auto-sync SMS on focus ───────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (accessToken) syncSMS(accessToken);
    }, [accessToken])
  );

  // ── Load from Google Sheet ───────────────────────────────────────────────────
  const loadSheetTransactions = async (token) => {
    try {
      const sheetTxns = await fetchTransactions(token);
      setTransactions(sheetTxns);
      sheetTxns.forEach(t => existingIds.current.add(t.id));
    } catch (err) {
      // Sheet might be empty on first run — that's fine
    }
  };

  // ── Sync SMS → Parse → Save new ones ─────────────────────────────────────────
  const syncSMS = async (token) => {
    setSyncing(true);
    setSyncMsg('Reading SMS...');
    try {
      const { newOnes } = await readAndParseBankSMS(existingIds.current);

      if (newOnes.length === 0) {
        setSyncMsg('All up to date');
        setTimeout(() => setSyncMsg(''), 3000);
        return;
      }

      setSyncMsg(`Saving ${newOnes.length} new transactions...`);

      for (const txn of newOnes) {
        await appendTransaction(token, txn);
        existingIds.current.add(txn.id);
      }

      setTransactions(prev => {
        const updated = [...newOnes.map(t => ({ ...t, synced: true })), ...prev];
        return updated;
      });

      setSyncMsg(`${newOnes.length} new transactions added`);
      setTimeout(() => setSyncMsg(''), 4000);
    } catch (err) {
      setSyncMsg('Sync failed');
      Alert.alert('Sync Error', err.message);
      setTimeout(() => setSyncMsg(''), 4000);
    } finally {
      setSyncing(false);
    }
  };

  // ── Add cash transaction ─────────────────────────────────────────────────────
  const handleAddCash = async (cashTxn) => {
    if (!accessToken) return;
    try {
      await appendTransaction(accessToken, cashTxn);
      setTransactions(prev => [{ ...cashTxn, synced: true }, ...prev]);
      setShowAddCash(false);
    } catch (err) {
      Alert.alert('Save failed', err.message);
    }
  };

  // ── Edit save ────────────────────────────────────────────────────────────────
  const handleSave = async (updated) => {
    if (!accessToken) return;
    try {
      await updateTransaction(accessToken, updated.rowIndex ?? 0, updated);
      setTransactions(prev =>
        prev.map(t =>
          t.id === updated.id ? { ...updated, bankPayment: `${updated.bank} — ${updated.paymentMode}` } : t
        )
      );
      setEditTarget(null);
    } catch (err) {
      Alert.alert('Save failed', err.message);
    }
  };

  // ── Add cash transaction ─────────────────────────────────────────────────────
  const handleAddCash = async (txn) => {
    if (!accessToken) return;
    try {
      await appendTransaction(accessToken, txn);
      setTransactions(prev => [{ ...txn, synced: true }, ...prev]);
      setShowAddCash(false);
    } catch (err) {
      Alert.alert('Save failed', err.message);
    }
  };

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const filtered = transactions.filter(t => {
    if (filter === 'All') return true;
    if (filter === 'Today') return t.date === dayjs().format('DD MMM YYYY');
    if (filter === 'This Week') {
      return dayjs(t.date, 'DD MMM YYYY').isAfter(dayjs().subtract(7, 'day'));
    }
    if (filter === 'Cash') return t.isCash || t.bankPayment === 'Cash';
    if (filter === 'Cash') return t.isCash || t.bankPayment === 'Cash';
    if (filter === 'Canara') return t.bank === 'Canara';
    return true;
  });

  // ── Group by date for SectionList ────────────────────────────────────────────
  const grouped = filtered.reduce((acc, t) => {
    const key = t.date || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const sections = Object.entries(grouped).map(([date, data]) => ({ title: date, data }));

  // ── Summary stats ────────────────────────────────────────────────────────────
  const todayStr = dayjs().format('DD MMM YYYY');
  const todayTotal = transactions
    .filter(t => t.date === todayStr)
    .reduce((sum, t) => sum + Number(t.cost), 0);
  const monthTotal = transactions
    .filter(t => dayjs(t.date, 'DD MMM YYYY').month() === dayjs().month())
    .reduce((sum, t) => sum + Number(t.cost), 0);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading transactions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SMS Expense Tracker</Text>
          <Text style={styles.headerSub}>{dayjs().format('MMMM YYYY')} · {transactions.length} transactions</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.addCashHeaderBtn} onPress={() => setShowAddCash(true)}>
            <Text style={styles.addCashHeaderText}>+ Cash</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => syncSMS(accessToken)} disabled={syncing}>
            {syncing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.refreshIcon}>🔄</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync status bar */}
      {syncMsg ? (
        <View style={styles.syncBar}>
          <View style={styles.syncDot} />
          <Text style={styles.syncMsg}>{syncMsg}</Text>
        </View>
      ) : null}

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <View style={styles.sumCard}>
          <Text style={styles.sumLabel}>This month</Text>
          <Text style={[styles.sumVal, { color: colors.danger }]}>₹{monthTotal.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.sumCard}>
          <Text style={styles.sumLabel}>Today</Text>
          <Text style={[styles.sumVal, { color: colors.danger }]}>₹{todayTotal.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.sumCard}>
          <Text style={styles.sumLabel}>Transactions</Text>
          <Text style={styles.sumVal}>{transactions.length}</Text>
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[
              styles.chip,
              filter === f && styles.chipActive,
              f === 'Cash' && filter !== f && styles.chipCash,
            ]}
            onPress={() => setFilter(f)}
          >
            <Text style={[
              styles.chipText,
              filter === f && styles.chipTextActive,
              f === 'Cash' && filter !== f && styles.chipCashText,
            ]}>{f === 'Cash' ? '💵 Cash' : f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Transaction list */}
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>No transactions yet</Text>
          <Text style={styles.emptyText}>Tap the refresh button to scan your SMS inbox</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionItem transaction={item} onEdit={setEditTarget} />
          )}
          renderSectionHeader={({ section: { title, data } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{title}</Text>
              <Text style={styles.sectionCount}>{data.length} txn</Text>
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={syncing} onRefresh={() => syncSMS(accessToken)} colors={[colors.primary]} />
          }
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* FAB row */}
      <View style={styles.fabRow}>
        <TouchableOpacity style={styles.fab} onPress={() => syncSMS(accessToken)} disabled={syncing}>
          <Text style={styles.fabText}>{syncing ? 'Scanning...' : '🔄 Scan SMS'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabCash} onPress={() => setShowAddCash(true)}>
          <Text style={styles.fabText}>💵 Add Cash</Text>
        </TouchableOpacity>
      </View>

      {/* Edit sheet */}
      <EditTransactionSheet
        visible={!!editTarget}
        transaction={editTarget}
        onSave={handleSave}
        onClose={() => setEditTarget(null)}
      />

      {/* Add Cash sheet */}
      <AddCashSheet
        visible={showAddCash}
        onSave={handleAddCash}
        onClose={() => setShowAddCash(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.textSecondary, fontSize: 14 },

  header: {
    backgroundColor: colors.primary,
    paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addCashHeaderBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  addCashHeaderText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  refreshIcon: { fontSize: 22 },

  syncBar: {
    backgroundColor: colors.primaryDark,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 7, gap: 8,
  },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4caf50' },
  syncMsg: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },

  summaryRow: {
    flexDirection: 'row', gap: 8, padding: 10,
    backgroundColor: '#f0f4ff',
  },
  sumCard: {
    flex: 1, backgroundColor: colors.surface,
    borderRadius: 8, padding: 10,
    borderWidth: 0.5, borderColor: colors.border,
  },
  sumLabel: { fontSize: 10, color: colors.textSecondary },
  sumVal: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },

  filterRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 12,
    paddingVertical: 8, backgroundColor: colors.surface,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 0.5,
    borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  chipCash: { backgroundColor: '#E8F5E9', borderColor: '#a5d6a7' },
  chipCashText: { color: '#2e7d32' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: colors.background,
  },
  sectionTitle: { fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontSize: 11, color: colors.textHint },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 6 },

  fabRow: { flexDirection: 'row', gap: 8, margin: 12 },
  fab: {
    flex: 1, padding: 14,
    backgroundColor: colors.primary,
    borderRadius: 12, alignItems: 'center',
  },
  fabCash: {
    flex: 1, padding: 14,
    backgroundColor: colors.success,
    borderRadius: 12, alignItems: 'center',
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
