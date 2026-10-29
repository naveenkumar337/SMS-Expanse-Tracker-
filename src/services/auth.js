// src/services/auth.js
// Custom email/password authentication against the `users` table, via the
// signup_user/login_user/logout_user Postgres RPCs defined in
// supabase-migration-custom-auth.sql. Password hashing/verification happens
// entirely inside Postgres (pgcrypto) — the app never sees a password hash,
// only the resulting session token.
//
// There is no Supabase-Auth session here, so the logged-in state is just
// { id, name, email, phone, token } persisted locally with expo-secure-store
// and sent back on every subsequent transactions RPC call to prove identity.

import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

const SESSION_KEY = 'sms_expense_tracker_session';

// Reads the friendly message out of a Postgres RAISE EXCEPTION.
function rpcErrorMessage(error, fallback) {
  return error?.message?.replace(/^.*?:\s*/, '') || fallback;
}

export const signUp = async ({ name, email, phone, password }) => {
  const { data, error } = await supabase.rpc('signup_user', {
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_password: password,
  });
  if (error) throw new Error(rpcErrorMessage(error, 'Sign up failed'));

  const row = Array.isArray(data) ? data[0] : data;
  const session = {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    token: row.session_token,
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  return session;
};

export const signIn = async ({ email, password }) => {
  const { data, error } = await supabase.rpc('login_user', {
    p_email: email,
    p_password: password,
  });
  if (error) throw new Error(rpcErrorMessage(error, 'Login failed'));

  const row = Array.isArray(data) ? data[0] : data;
  const session = {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    token: row.session_token,
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  return session;
};

export const signOut = async () => {
  const session = await getStoredSession();
  if (session) {
    // Best-effort: invalidate the token server-side too. Ignore errors so a
    // flaky network doesn't prevent the user from logging out locally.
    try {
      await supabase.rpc('logout_user', { p_user_id: session.id, p_token: session.token });
    } catch (err) {
      console.warn('logout_user RPC failed (ignored):', err.message);
    }
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
};

// Returns the persisted { id, name, email, phone, token } session, or null.
export const getStoredSession = async () => {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
};
