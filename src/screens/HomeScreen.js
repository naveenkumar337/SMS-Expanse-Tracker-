// src/screens/HomeScreen.js

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, SectionList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { colors } from '../utils/theme';
import TransactionItem from '../components/TransactionItem';
import EditTransactionSheet from '../components/EditTransactionSheet';
import AddCashSheet from '../components/AddCashSheet';
import { readAndParseBankSMS } from '../services/smsReader';
import { startSmsListener } from '../services/smsListener';
import { 
  getTransactions, 
  addTransaction, 
  updateTransaction as updateTransactionDB,
  subscribeToTransactions,
  DuplicateTransactionError,
} from '../services/transactions';
import { supabase } from '../services/supabase';

// Required for dayjs(dateString, 'DD MMM YYYY') to actually respect the format
// argument below — without this plugin, dayjs silently ignores the format and
// falls back to native Date parsing, which is not guaranteed to understand
// "DD MMM YYYY" strings consistently across JS engines (e.g. Hermes vs V8).
dayjs.extend(customParseFormat);

const FILTERS = ['All', 'Today', 'This Week', 'Cash', 'HDFC', 'Canara'];

export default function HomeScreen({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('All');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [showAddCash, setShowAddCash] = useState(false);
  const [loading, setLoading] = useState(true);
  // Tracks the deterministic SMS-derived ids (transactions.smsId / DB column sms_id)
  // that have already been imported — NOT the Supabase row `id` (UUID), since the
  // SMS parser never produces UUIDs. Comparing against smsId is what makes dedup work.
  const existingIds = useRef(new Set());
  // Guards against the very first `useFocusEffect` firing (which happens at
  // mount, roughly alongside the effect below) from starting a sync before
  // `loadTransactions()` has finished populating `existingIds` — without this,
  // every cold start would re-scan and re-attempt-insert every SMS in the
  // window (harmless thanks to the DB unique constraint, but wasteful).
  const isFirstFocus = useRef(true);

  // ── Load initial data, then run the first SMS sync only once existingIds
  // is populated (see isFirstFocus above) ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      await loadTransactions();
      syncSMS();
    })();

    // Set up real-time subscription
    const subscription = subscribeToTransactions((payload) => {
      const transformData = (data) => ({
        id: data.id,
        smsId: data.sms_id,
        purpose: data.purpose,
        cost: data.amount,
        date: data.date,
        spentFor: data.spent_for,
        bank: data.bank,
        paymentMode: data.payment_mode,
        bankPayment: `${data.bank || ''} — ${data.payment_mode || ''}`,
        merchant: data.merchant,
        rawSMS: data.raw_sms,
        isCash: data.is_cash,
        synced: true,
      });

      if (payload.eventType === 'INSERT') {
        setTransactions(prev => [transformData(payload.new), ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        setTransactions(prev => 
          prev.map(t => t.id === payload.new.id ? transformData(payload.new) : t)
        );
      } else if (payload.eventType === 'DELETE') {
        setTransactions(prev => 
          prev.filter(t => t.id !== payload.old.id)
        );
      }
    });

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const loadTransactions = async () => {
    try {
      const data = await getTransactions();
      setTransactions(data);
      data.forEach(t => {
        if (t.smsId) existingIds.current.add(t.smsId);
      });
    } catch (err) {
      Alert.alert('Load failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Real-time SMS listener (instant capture while app process is alive) ───────
  // Note: the actual insert into `transactions` state happens via the Supabase
  // realtime subscription above (INSERT event) — addTransaction() here triggers
  // that automatically. We only use onNewTransaction for a lightweight UI ping,
  // to avoid double-adding the same transaction to the list.
  useEffect(() => {
    const stopListener = startSmsListener({
      existingIds: existingIds.current,
      onNewTransaction: () => {
        setSyncMsg('New transaction detected');
        setTimeout(() => setSyncMsg(''), 3000);
      },
      onError: (err) => {
        console.warn('SMS listener error:', err.message);
      },
    });

    return () => stopListener();
  }, []);

  // ── Auto-sync SMS on focus (subsequent focuses only — see isFirstFocus) ──────
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        // Skip: the mount effect above already runs the initial sync once
        // loadTransactions() has populated existingIds. Calling syncSMS()
        // here too would race ahead of that with a still-empty dedup set.
        isFirstFocus.current = false;
        return;
      }
      syncSMS();
    }, [])
  );

  // ── Sync SMS → Parse → Save new ones ─────────────────────────────────────────
  const syncSMS = async () => {
    setSyncing(true);
    setSyncMsg('Reading SMS...');
    try {
      // existingIds holds smsId values (deterministic hash from smsParser.js),
      // so this correctly skips SMS that were already imported in a previous sync.
      const { newOnes } = await readAndParseBankSMS(existingIds.current);

      if (newOnes.length === 0) {
        setSyncMsg('All up to date');
        setTimeout(() => setSyncMsg(''), 3000);
        return;
      }

      setSyncMsg(`Saving ${newOnes.length} new transactions...`);

      let savedCount = 0;
      for (const txn of newOnes) {
        // Mark as seen up-front so a duplicate later in this same loop
        // (e.g. two identical SMS) isn't attempted twice.
        existingIds.current.add(txn.id);
        try {
          await addTransaction(txn);
          savedCount++;
        } catch (err) {
          if (err instanceof DuplicateTransactionError) {
            // Already imported in a previous sync (DB unique constraint caught it) — skip silently.
            continue;
          }
          throw err;
        }
      }

      setSyncMsg(savedCount > 0 ? `${savedCount} new transactions added` : 'All up to date');
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
    try {
      const added = await addTransaction(cashTxn);
      setTransactions(prev => [added, ...prev]);
      setShowAddCash(false);
    } catch (err) {
      Alert.alert('Save failed', err.message);
    }
  };

  // ── Edit save ────────────────────────────────────────────────────────────────
  const handleSave = async (updated) => {
    try {
      const updatedTxn = await updateTransactionDB(updated.id, updated);
      setTransactions(prev =>
        prev.map(t => t.id === updated.id ? updatedTxn : t)
      );
      setEditTarget(null);
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
    if (filter === 'HDFC') return t.bank === 'HDFC';
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
          <TouchableOpacity onPress={() => syncSMS()} disabled={syncing}>
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
            <RefreshControl refreshing={syncing} onRefresh={() => syncSMS()} colors={[colors.primary]} />
          }
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* FAB row */}
      <View style={styles.fabRow}>
        <TouchableOpacity style={styles.fab} onPress={() => syncSMS()} disabled={syncing}>
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
