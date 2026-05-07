// src/services/googleSheets.js
// Handles all Google Sheets API operations

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

WebBrowser.maybeCompleteAuthSession();

// ─── CONFIG — Fill these after Google Cloud Console setup ──────────────────────
const GOOGLE_CLIENT_ID = '1093707675931-vos6b888k1mu0bn4fe26tlo3f72p3m6a.apps.googleusercontent.com';
const SPREADSHEET_ID = '1L6Rip2V6yHy3-_3-zx40OrRvKUrWQ7q4mTjNg454Z0w'; // from Sheet URL
const SHEET_NAME = 'Transactions';
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
];

const STORAGE_KEY_TOKEN = 'google_access_token';
const STORAGE_KEY_REFRESH = 'google_refresh_token';

// ─── Auth discovery ─────────────────────────────────────────────────────────────
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

// ─── Save / Load tokens ─────────────────────────────────────────────────────────
export async function saveTokens(accessToken, refreshToken) {
  await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, accessToken);
  if (refreshToken) {
    await SecureStore.setItemAsync(STORAGE_KEY_REFRESH, refreshToken);
  }
}

export async function loadAccessToken() {
  return await SecureStore.getItemAsync(STORAGE_KEY_TOKEN);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(STORAGE_KEY_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEY_REFRESH);
}

// ─── OAuth Login ────────────────────────────────────────────────────────────────
export function useGoogleAuth() {
  const redirectUri = AuthSession.makeRedirectUri();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      extraParams: { access_type: 'offline' },
    },
    discovery
  );

  return { request, response, promptAsync };
}

// ─── Exchange auth code for tokens ──────────────────────────────────────────────
export async function exchangeCodeForTokens(code, redirectUri) {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  return res.data; // { access_token, refresh_token, expires_in }
}

// ─── Ensure sheet headers exist ──────────────────────────────────────────────────
export async function ensureSheetHeaders(accessToken) {
  const headers = ['Purpose', 'Cost (₹)', 'Date', 'Spent For', 'Bank', 'Payment Mode', 'Merchant', 'Raw SMS', 'Added On'];

  // Check if first row has data
  const checkUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:I1`;
  const check = await axios.get(checkUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const existing = check.data.values?.[0];
  if (existing && existing[0] === 'Purpose') return; // headers already exist

  // Write headers
  await axios.put(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:I1?valueInputOption=RAW`,
    { values: [headers] },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

// ─── Append a transaction row ───────────────────────────────────────────────────
export async function appendTransaction(accessToken, txn) {
  await ensureSheetHeaders(accessToken);

  const row = [
    txn.purpose || '',
    txn.cost || 0,
    txn.date || '',
    txn.spentFor || 'Self',
    txn.bank || '',
    txn.paymentMode || '',
    txn.merchant || '',
    txn.rawSMS || '',
    new Date().toLocaleString('en-IN'),
  ];

  await axios.post(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:I:append?valueInputOption=USER_ENTERED`,
    { values: [row] },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

// ─── Update an existing row ─────────────────────────────────────────────────────
export async function updateTransaction(accessToken, rowIndex, txn) {
  // rowIndex is 0-based from app; +2 for header row + 1-based sheets index
  const sheetRow = rowIndex + 2;
  const range = `${SHEET_NAME}!A${sheetRow}:I${sheetRow}`;

  const row = [
    txn.purpose || '',
    txn.cost || 0,
    txn.date || '',
    txn.spentFor || 'Self',
    txn.bank || '',
    txn.paymentMode || '',
    txn.merchant || '',
    txn.rawSMS || '',
    new Date().toLocaleString('en-IN'),
  ];

  await axios.put(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
    { values: [row] },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

// ─── Fetch all transactions from sheet ──────────────────────────────────────────
export async function fetchTransactions(accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A2:I`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const rows = res.data.values || [];
  return rows.map((row, index) => ({
    rowIndex: index,
    purpose: row[0] || '',
    cost: parseFloat(row[1]) || 0,
    date: row[2] || '',
    spentFor: row[3] || 'Self',
    bank: row[4] || '',
    paymentMode: row[5] || '',
    bankPayment: `${row[4] || ''} — ${row[5] || ''}`,
    merchant: row[6] || '',
    rawSMS: row[7] || '',
    addedOn: row[8] || '',
    synced: true,
  }));
}
