// src/services/supabase.js
// Supabase client configuration and authentication helpers

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Named imports from '@env' are always inlined by babel at build time by
// react-native-dotenv, regardless of whether the value comes from a local
// .env file or from CI/EAS-injected build environment variables. Accessing
// `process.env.X` directly (a plain MemberExpression) is only inlined when a
// matching key exists in an actual .env file, which caused SUPABASE_URL to
// resolve to `undefined` in cloud (EAS) builds where .env is gitignored and
// never uploaded — crashing the app on launch with "supabaseUrl is required".
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

// Without an explicit `storage` adapter, supabase-js falls back to
// `window.localStorage` (browser-only) or, when that's unavailable — as in
// React Native — a plain in-memory object. That in-memory session is lost
// the instant the JS engine restarts, i.e. every time the app is closed or
// killed, forcing a fresh login on every single launch. AsyncStorage
// persists it to disk so the session survives app restarts, and the user
// only needs to log in again after an explicit sign-out (or once the
// refresh token itself expires/is revoked).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // browser-only feature, not applicable in React Native
  },
});

// Shared with LoginScreen.js so the URL used to open the OAuth browser
// session and the one registered with Supabase always stay in sync.
export const AUTH_REDIRECT_URI = 'smsexpensetracker://auth/callback';

// ─── Authentication helper functions ─────────────────────────────────────────────

// Sign in with Google OAuth
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: AUTH_REDIRECT_URI,
      // Without this, Google silently reuses whatever session cookie already
      // exists in the in-app browser and skips the account chooser entirely —
      // 'select_account' forces Google to always show it, so the user can
      // pick a different account instead of being auto-signed-in as
      // whichever account was last used.
      queryParams: {
        prompt: 'select_account',
      },
    }
  });
  
  if (error) throw error;
  return data;
};

// Sign out current user
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

// Get current authenticated user
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

// Listen to authentication state changes
export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};

// Get current session
export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
};