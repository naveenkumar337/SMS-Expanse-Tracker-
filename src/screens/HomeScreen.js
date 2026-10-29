// src/screens/HomeScreen.js

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, SectionList, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { colors, BANK_OPTIONS, PAYMENT_MODE_OPTIONS, SPENT_FOR_OPTIONS } from '../utils/theme';
import TransactionItem from '../components/TransactionItem';
import EditTransactionSheet from '../components/EditTransactionSheet';
import AddCashSheet from '../components/AddCashSheet';
import ExportSheet from '../components/ExportSheet';
import PeriodViewSheet from '../components/PeriodViewSheet';
import FilterSheet from '../components/FilterSheet';
import { readAndParseBankSMS } from '../services/smsReader';
import { startSmsListener } from '../services/smsListener';
import { 
  getTransactions, 
  addTransaction, 
  updateTransaction as updateTransactionDB,
  deleteTransaction,
  DuplicateTransactionError,
} from '../services/transactions';
import { signOut } from '../services/auth';

// Required for dayjs(dateString, 'DD MMM YYYY') to actually respect the format
// argument below — without this plugin, dayjs silently ignores the format and
// falls back to native Date parsing, which is not guaranteed to understand
// "DD MMM YYYY" strings consistently across JS engines (e.g. Hermes vs V8).
dayjs.extend(customParseFormat);

const FILTERS = ['All', 'Today', 'This Week', 'This Month', 'Income', 'Expense', 'Cash', 'More...'];

// Sorts transactions recent -> past by their actual date (not insertion
// order). Used whenever the in-memory list is mutated (real-time INSERT,
// manual cash add) so a transaction never jumps to the top of the list
// purely because it was the most recently added, rather than the most recent
// by date — mirrors the DB-level `txn_date` ordering in getTransactions().
const sortByDateDesc = (list) =>
  [...list].sort((a, b) => {
    const da = dayjs(a.date, 'DD MMM YYYY');
    const db = dayjs(b.date, 'DD MMM YYYY');
    if (!da.isValid() || !db.isValid()) return 0;
    return db.valueOf() - da.valueOf();
  });

export default function HomeScreen({ user, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('All');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [showAddCash, setShowAddCash] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPeriodView, setShowPeriodView] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
  // NOTE: this used to also open a Supabase real-time subscription on the
  // `transactions` table, kept in sync purely by Postgres RLS filtering rows
  // to `auth.uid()`. Now that sign-in is custom (no Supabase-Auth session —
  // see src/services/auth.js), the table has no client-facing RLS policies
  // at all (access is only via the session-checked RPCs in
  // supabase-migration-custom-auth.sql), so that subscription can no longer
  // deliver anything. The list is instead kept in sync purely from the
  // optimistic updates below (syncSMS/handleAddCash/handleSave), which is
  // sufficient for this single-device app.
  useEffect(() => {
    (async () => {
      await loadTransactions();
      syncSMS();
    })();
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
  // Update the visible list directly from the save result — same reasoning
  // as in syncSMS() below: the Supabase real-time subscription's websocket
  // handshake is async and may still be connecting (e.g. right after app
  // launch) when a new SMS arrives and gets saved, in which case its INSERT
  // event would never reach this session and the transaction would stay
  // invisible until the app is fully reopened, even though it was already
  // saved correctly. The `some(...)` guard avoids a duplicate entry if the
  // real-time event does also arrive for the same row.
  useEffect(() => {
    const stopListener = startSmsListener({
      existingIds: existingIds.current,
      onNewTransaction: (saved) => {
        setTransactions(prev =>
          prev.some(t => t.id === saved.id) ? prev : sortByDateDesc([saved, ...prev])
        );
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
          const saved = await addTransaction(txn);
          savedCount++;
          // Update the visible list directly from the save result rather than
          // relying solely on the real-time subscription's INSERT event.
          // The real-time channel's websocket handshake is async and can
          // still be connecting when this sync runs (e.g. right at app
          // startup) — if it isn't live yet when this insert happens, the
          // event is never delivered to this session, so the new
          // transaction would otherwise stay invisible until the next full
          // reload even though it's already safely saved in the database.
          // The `some(...)` guard avoids a duplicate list entry in case the
          // real-time event *does* also arrive for the same row.
          setTransactions(prev =>
            prev.some(t => t.id === saved.id) ? prev : sortByDateDesc([saved, ...prev])
          );
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
      setTransactions(prev =>
        prev.some(t => t.id === added.id) ? prev : sortByDateDesc([added, ...prev])
      );
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
        sortByDateDesc(prev.map(t => t.id === updated.id ? updatedTxn : t))
      );
      setEditTarget(null);
    } catch (err) {
      Alert.alert('Save failed', err.message);
    }
  };

  // ── Delete transaction ────────────────────────────────────────────────────────
  const handleDelete = async (transaction) => {
    Alert.alert(
      'Delete Transaction',
      `Are you sure you want to delete this transaction?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(transaction.id);
              setTransactions(prev => prev.filter(t => t.id !== transaction.id));
            } catch (err) {
              Alert.alert('Delete failed', err.message);
            }
          },
        },
      ]
    );
  };

  // ── Logout ───────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } finally {
            onLogout?.();
          }
        },
      },
    ]);
  };

  // ── Filter + search logic ────────────────────────────────────────────────────
  const filtered = transactions.filter(t => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        (t.merchant || '').toLowerCase().includes(q) ||
        (t.purpose || '').toLowerCase().includes(q) ||
        (t.bank || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    if (filter === 'All') return true;
    if (filter === 'Today') return t.date === dayjs().format('DD MMM YYYY');
    if (filter === 'This Week') {
      return dayjs(t.date, 'DD MMM YYYY').isAfter(dayjs().subtract(7, 'day'));
    }
    if (filter === 'This Month') {
      return dayjs(t.date, 'DD MMM YYYY').month() === dayjs().month();
    }
    if (filter === 'Income') return t.type === 'income';
    if (filter === 'Expense') return t.type !== 'income';
    if (filter === 'Cash') return t.isCash || t.bankPayment === 'Cash';
    if (filter === 'More...') return true; // Handled by FilterSheet
    // Handle dynamic filters from FilterSheet
    if (BANK_OPTIONS.includes(filter)) return t.bank === filter;
    if (PAYMENT_MODE_OPTIONS.includes(filter)) return t.paymentMode === filter;
    if (SPENT_FOR_OPTIONS.includes(filter)) return t.spentFor === filter;
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
  // "This month"/"Today" stay expense-only (this is fundamentally an expense
  // tracker) — income is surfaced separately via its own card + filter chip
  // rather than netted into these figures.
  const todayStr = dayjs().format('DD MMM YYYY');
  const isExpense = t => t.type !== 'income';
  const todayTotal = transactions
    .filter(t => t.date === todayStr && isExpense(t))
    .reduce((sum, t) => sum + Number(t.cost), 0);
  const monthTotal = transactions
    .filter(t => dayjs(t.date, 'DD MMM YYYY').month() === dayjs().month() && isExpense(t))
    .reduce((sum, t) => sum + Number(t.cost), 0);
  const monthIncomeTotal = transactions
    .filter(t => dayjs(t.date, 'DD MMM YYYY').month() === dayjs().month() && t.type === 'income')
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
          <TouchableOpacity onPress={() => setShowPeriodView(true)}>
            <Text style={styles.refreshIcon}>📅</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowFilterSheet(true)}>
            <Text style={styles.refreshIcon}>🔽</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSearchVisible(v => !v)}>
            <Text style={styles.refreshIcon}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowExport(true)}>
            <Text style={styles.refreshIcon}>📤</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => syncSMS()} disabled={syncing}>
            {syncing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.refreshIcon}>🔄</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.refreshIcon}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar (toggled via the header search icon) */}
      {searchVisible ? (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by merchant, purpose, or bank..."
            placeholderTextColor={colors.textHint}
            autoFocus
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

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
          <Text style={styles.sumLabel}>Income</Text>
          <Text style={[styles.sumVal, { color: colors.income }]}>₹{monthIncomeTotal.toLocaleString('en-IN')}</Text>
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
            <TransactionItem transaction={item} onEdit={setEditTarget} onDelete={handleDelete} />
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

      {/* Export sheet */}
      <ExportSheet
        visible={showExport}
        onClose={() => setShowExport(false)}
      />

      {/* Period view sheet */}
      <PeriodViewSheet
        visible={showPeriodView}
        transactions={transactions}
        onEdit={setEditTarget}
        onDelete={handleDelete}
        onClose={() => setShowPeriodView(false)}
      />

      {/* Filter sheet */}
      <FilterSheet
        visible={showFilterSheet}
        currentFilter={filter}
        onFilterSelect={setFilter}
        onClose={() => setShowFilterSheet(false)}
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
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10,
    backgroundColor: '#f0f4ff',
  },
  sumCard: {
    flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface,
    borderRadius: 8, padding: 10,
    borderWidth: 0.5, borderColor: colors.border,
  },
  sumLabel: { fontSize: 10, color: colors.textSecondary },
  sumVal: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 8,
    borderWidth: 0.5, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 14, color: colors.textPrimary,
  },
  searchClear: { fontSize: 16, color: colors.textSecondary, paddingHorizontal: 4 },

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
