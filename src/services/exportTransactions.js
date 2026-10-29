// src/services/exportTransactions.js
// Exports transactions within a date range to a real .xlsx file, saved
// directly to a user-chosen folder (e.g. Downloads) — no share sheet.

import * as XLSX from 'xlsx';
// The modern `expo-file-system` main API dropped `StorageAccessFramework` —
// it only exists under the `/legacy` subpath now (confirmed against the
// installed package's exports map and type definitions).
import { StorageAccessFramework } from 'expo-file-system/legacy';
import dayjs from 'dayjs';
import { supabase } from './supabase';
import { getStoredSession } from './auth';

// Exports all transactions with `txn_date` in [startDate, endDate] (inclusive)
// to a .xlsx workbook. Queries Supabase directly for the range rather than
// relying on already-loaded in-memory state, so the export isn't limited to
// whatever happens to be loaded/paginated in the UI.
export async function exportTransactionsToExcel(startDate, endDate) {
  const session = await getStoredSession();
  if (!session) throw new Error('User not authenticated');

  const startStr = dayjs(startDate).format('YYYY-MM-DD');
  const endStr = dayjs(endDate).format('YYYY-MM-DD');

  const { data, error } = await supabase.rpc('get_transactions_range', {
    p_user_id: session.id,
    p_token: session.token,
    p_start: startStr,
    p_end: endStr,
  });

  if (error) throw new Error(error.message?.replace(/^.*?:\s*/, '') || 'Export failed');
  if (!data || data.length === 0) {
    throw new Error('No transactions found in the selected date range.');
  }

  const rows = data.map(txn => ({
    Date: txn.date,
    Merchant: txn.merchant || '',
    Purpose: txn.purpose || '',
    Type: txn.type === 'income' ? 'Income' : 'Expense',
    Amount: txn.amount,
    Bank: txn.bank || '',
    'Payment Mode': txn.payment_mode || '',
    'Spent For': txn.spent_for || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

  // Prompts the user once to pick/grant a folder (e.g. Downloads) — a native
  // folder picker, not a share sheet. After granting, the app can write
  // files there directly on subsequent exports without asking again for the
  // same folder (Android persists the grant).
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) {
    throw new Error('Folder access was not granted, so the file could not be saved.');
  }

  const fileName = `Transactions_${startStr}_to_${endStr}`;
  const fileUri = await StorageAccessFramework.createFileAsync(
    permissions.directoryUri,
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  await StorageAccessFramework.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });

  return { fileUri, count: data.length };
}
