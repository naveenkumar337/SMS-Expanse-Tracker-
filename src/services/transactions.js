// src/services/transactions.js
// Transaction CRUD operations, via the session-checked Postgres RPCs
// (get_transactions/add_transaction/update_transaction/delete_transaction/
// transaction_exists) defined in supabase-migration-custom-auth.sql. Every
// call passes the locally-stored (user_id, token) pair so the RPC can
// verify the caller is actually logged in as that user before touching
// their rows — see auth.js for how that session is obtained/persisted.

import { supabase } from './supabase';
import { getStoredSession } from './auth';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

// Needed to reliably parse the "DD MMM YYYY" display-format date string (see
// HomeScreen.js for the same plugin requirement) when deriving `txn_date`,
// the proper sortable DATE column, from either a raw timestamp (new
// SMS-parsed/cash transactions) or an edited display-date string.
dayjs.extend(customParseFormat);

// Converts either a raw timestamp (number) or a "DD MMM YYYY" display string
// into a 'YYYY-MM-DD' string for the sortable `txn_date` DB column.
function toTxnDate(rawDateOrDisplayString) {
  if (rawDateOrDisplayString == null) return null;
  const d = typeof rawDateOrDisplayString === 'number'
    ? dayjs(rawDateOrDisplayString)
    : dayjs(rawDateOrDisplayString, 'DD MMM YYYY');
  return d.isValid() ? d.format('YYYY-MM-DD') : null;
}

// Resolves the current session, throwing the same "User not authenticated"
// error the old Supabase-Auth-based code used to throw in this situation.
async function requireSession() {
  const session = await getStoredSession();
  if (!session) throw new Error('User not authenticated');
  return session;
}

function rpcErrorMessage(error, fallback) {
  return error?.message?.replace(/^.*?:\s*/, '') || fallback;
}

// ─── Custom error for duplicate SMS-derived transactions ───────────────────────────
export class DuplicateTransactionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DuplicateTransactionError';
  }
}

// Transform DB row format to app format
function fromDbRow(txn) {
  return {
    id: txn.id,
    smsId: txn.sms_id,
    type: txn.type || 'expense',
    purpose: txn.purpose,
    cost: txn.amount,
    date: txn.date,
    spentFor: txn.spent_for,
    bank: txn.bank,
    paymentMode: txn.payment_mode,
    bankPayment: `${txn.bank || ''} — ${txn.payment_mode || ''}`,
    merchant: txn.merchant,
    rawSMS: txn.raw_sms,
    isCash: txn.is_cash,
    receiptUrl: txn.receipt_url,
    synced: true,
  };
}

// ─── Get all transactions for current user ────────────────────────────────────────

export const getTransactions = async () => {
  const session = await requireSession();

  const { data, error } = await supabase.rpc('get_transactions', {
    p_user_id: session.id,
    p_token: session.token,
  });
  if (error) throw new Error(rpcErrorMessage(error, 'Failed to load transactions'));

  return (data || []).map(fromDbRow);
};

// ─── Add new transaction ───────────────────────────────────────────────────────────

export const addTransaction = async (transaction) => {
  const session = await requireSession();

  const { data, error } = await supabase.rpc('add_transaction', {
    p_user_id: session.id,
    p_token: session.token,
    // sms_id is the deterministic id produced by smsParser.js (same SMS -> same id).
    // For manually-added cash transactions this is just their own generated id,
    // which is fine since it's unique and not re-submitted on every sync.
    p_sms_id: transaction.id || null,
    p_type: transaction.type || 'expense',
    p_amount: transaction.cost,
    p_date: transaction.date,
    p_txn_date: toTxnDate(transaction.rawDate ?? transaction.date),
    p_merchant: transaction.merchant,
    p_purpose: transaction.purpose,
    p_bank: transaction.bank,
    p_payment_mode: transaction.paymentMode,
    p_spent_for: transaction.spentFor || 'Self',
    p_raw_sms: transaction.rawSMS,
    p_is_cash: transaction.isCash || false,
    p_receipt_url: transaction.receiptUrl || null,
  });

  if (error) {
    // 23505 = unique_violation -> this SMS was already imported (race condition
    // or stale existingIds cache). Treat as a benign duplicate, not a hard failure.
    if (error.code === '23505') {
      throw new DuplicateTransactionError('Transaction already exists');
    }
    throw new Error(rpcErrorMessage(error, 'Failed to save transaction'));
  }

  const row = Array.isArray(data) ? data[0] : data;
  return fromDbRow(row);
};

// ─── Update existing transaction ───────────────────────────────────────────────────

export const updateTransaction = async (transactionId, updates) => {
  const session = await requireSession();

  const { data, error } = await supabase.rpc('update_transaction', {
    p_user_id: session.id,
    p_token: session.token,
    p_id: transactionId,
    p_type: updates.type || 'expense',
    p_amount: updates.cost,
    p_date: updates.date,
    p_txn_date: toTxnDate(updates.date),
    p_merchant: updates.merchant,
    p_purpose: updates.purpose,
    p_bank: updates.bank,
    p_payment_mode: updates.paymentMode,
    p_spent_for: updates.spentFor || 'Self',
    p_receipt_url: updates.receiptUrl ?? null,
  });

  if (error) throw new Error(rpcErrorMessage(error, 'Failed to update transaction'));

  const row = Array.isArray(data) ? data[0] : data;
  return fromDbRow(row);
};

// ─── Delete transaction ───────────────────────────────────────────────────────────

export const deleteTransaction = async (transactionId) => {
  const session = await requireSession();

  const { error } = await supabase.rpc('delete_transaction', {
    p_user_id: session.id,
    p_token: session.token,
    p_id: transactionId,
  });

  if (error) throw new Error(rpcErrorMessage(error, 'Failed to delete transaction'));
  return true;
};

// ─── Check if transaction exists (for duplicate prevention) ───────────────────────

export const transactionExists = async (transactionId) => {
  const session = await getStoredSession();
  if (!session) return false;

  const { data, error } = await supabase.rpc('transaction_exists', {
    p_user_id: session.id,
    p_token: session.token,
    p_id: transactionId,
  });

  if (error) return false;
  return !!data;
};
