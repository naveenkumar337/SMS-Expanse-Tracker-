// src/screens/LoginScreen.js

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Image, Linking,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '../utils/theme';
import { signInWithGoogle, getCurrentUser, supabase, AUTH_REDIRECT_URI } from '../services/supabase';

WebBrowser.maybeCompleteAuthSession();

// Supabase's default OAuth flow ("implicit") returns access_token/refresh_token
// in the URL *fragment* (after '#'), not the query string (after '?'). Some
// error responses instead use a '?' query string. This helper checks both,
// without relying on the DOM URL/URLSearchParams APIs (which only parse the
// '?' portion and can behave inconsistently under Hermes).
function extractParamsFromUrl(url) {
  const params = {};
  const paramsString = url.split('#')[1] || url.split('?')[1] || '';
  paramsString.split('&').forEach(pair => {
    if (!pair) return;
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
  });
  return params;
}

export default function LoginScreen({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    checkExistingSession();

    // Handle the case where the OAuth browser redirects back into the app
    // while it's already running (e.g. backgrounded, not fully closed).
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('auth/callback')) {
        handleAuthCallback(url);
      }
    });

    return () => subscription.remove();
  }, []);

  const checkExistingSession = async () => {
    try {
      const user = await getCurrentUser();
      if (user) {
        onLoginSuccess(user);
      }
    } catch (err) {
      console.log('No existing session');
    } finally {
      setChecking(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { url } = await signInWithGoogle();
      // Opens the Google OAuth page in an in-app browser and waits for the
      // redirect back to AUTH_REDIRECT_URI, returning that final URL directly
      // (this is the current, supported replacement for the old/removed
      // `AuthSession.startAsync`).
      const result = await WebBrowser.openAuthSessionAsync(url, AUTH_REDIRECT_URI);

      if (result.type === 'success' && result.url) {
        await handleAuthCallback(result.url);
      } else {
        Alert.alert('Login cancelled', 'Please try again to continue.');
      }
    } catch (err) {
      Alert.alert('Login failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthCallback = async (url) => {
    try {
      const params = extractParamsFromUrl(url);

      if (params.access_token && params.refresh_token) {
        // Supabase doesn't auto-detect the redirect URL in React Native, so
        // the session must be established explicitly. This is what actually
        // triggers the 'SIGNED_IN' event that App.js listens for.
        const { data, error } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (error) throw error;

        const user = data?.user || (await getCurrentUser());
        onLoginSuccess(user);
      } else if (params.error) {
        Alert.alert('Login failed', params.error_description || params.error);
      }
    } catch (err) {
      console.error('Auth callback error:', err);
      Alert.alert('Login failed', err.message);
    }
  };

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.appIcon}>💳</Text>
        <Text style={styles.title}>SMS Expense Tracker</Text>
        <Text style={styles.subtitle}>
          Track your HDFC & Canara bank transactions automatically from SMS
        </Text>

        <View style={styles.featureList}>
          {[
            '📩 Auto-reads bank SMS',
            '📊 Saves to secure database',
            '✏️ Edit & categorise transactions',
            '👨‍👩‍👧 Track who you spent for',
          ].map(f => (
            <Text key={f} style={styles.feature}>{f}</Text>
          ))}
        </View>

        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.googleBtnText}>Sign in with Google</Text>
          }
        </TouchableOpacity>

        <Text style={styles.note}>
          Your data stays in your own secure database. We never store it elsewhere.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  appIcon: { fontSize: 52, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  subtitle: {
    fontSize: 14, color: colors.textSecondary,
    textAlign: 'center', marginTop: 8, lineHeight: 20,
  },
  featureList: { marginTop: 20, marginBottom: 24, width: '100%' },
  feature: { fontSize: 14, color: colors.textPrimary, marginBottom: 8 },
  googleBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 10, width: '100%', alignItems: 'center',
  },
  googleBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  note: {
    fontSize: 11, color: colors.textHint,
    textAlign: 'center', marginTop: 14, lineHeight: 16,
  },
});
