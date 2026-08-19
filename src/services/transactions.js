// src/services/transactions.js
// Transaction CRUD operations using Supabase

import { supabase } from './supabase';

// ─── Custom error for duplicate SMS-derived transactions ───────────────────────────
export class DuplicateTransactionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DuplicateTransactionError';
  }
}

// ─── Get all transactions for current user ────────────────────────────────────────

export const getTransactions = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  // Transform database format to app format
  return data.map(txn => ({
    id: txn.id,
    smsId: txn.sms_id,
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
    synced: true,
    rowIndex: data.indexOf(txn),
  }));
};

// ─── Add new transaction ───────────────────────────────────────────────────────────

export const addTransaction = async (transaction) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      // sms_id is the deterministic id produced by smsParser.js (same SMS -> same id).
      // For manually-added cash transactions this is just their own generated id,
      // which is fine since it's unique and not re-submitted on every sync.
      sms_id: transaction.id || null,
      amount: transaction.cost,
      date: transaction.date,
      merchant: transaction.merchant,
      purpose: transaction.purpose,
      bank: transaction.bank,
      payment_mode: transaction.paymentMode,
      spent_for: transaction.spentFor || 'Self',
      raw_sms: transaction.rawSMS,
      is_cash: transaction.isCash || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation -> this SMS was already imported (race condition
    // or stale existingIds cache). Treat as a benign duplicate, not a hard failure.
    if (error.code === '23505') {
      throw new DuplicateTransactionError('Transaction already exists');
    }
    throw error;
  }
  
  // Transform to app format
  return {
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
  };
};

// ─── Update existing transaction ───────────────────────────────────────────────────

export const updateTransaction = async (transactionId, updates) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('transactions')
    .update({
      amount: updates.cost,
      date: updates.date,
      merchant: updates.merchant,
      purpose: updates.purpose,
      bank: updates.bank,
      payment_mode: updates.paymentMode,
      spent_for: updates.spentFor || 'Self',
      updated_at: new Date().toISOString()
    })
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw error;
  
  // Transform to app format
  return {
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
  };
};

// ─── Delete transaction ───────────────────────────────────────────────────────────

export const deleteTransaction = async (transactionId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', user.id);

  if (error) throw error;
  return true;
};

// ─── Real-time subscription for transactions ───────────────────────────────────────

export const subscribeToTransactions = (callback) => {
  return supabase
    .channel('transactions')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'transactions'
    }, callback)
    .subscribe();
};

// ─── Check if transaction exists (for duplicate prevention) ───────────────────────

export const transactionExists = async (transactionId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') return false; // PGRST116 = not found
  return !!data;
};