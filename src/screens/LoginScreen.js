// src/screens/LoginScreen.js

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '../utils/theme';
import { useGoogleAuth, exchangeCodeForTokens, saveTokens } from '../services/googleSheets';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const { request, response, promptAsync } = useGoogleAuth();

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await promptAsync();
      if (result.type === 'success') {
        const { code } = result.params;
        const redirectUri = AuthSession.makeRedirectUri({ scheme: 'smsexpensetracker' });
        const tokens = await exchangeCodeForTokens(code, redirectUri);
        await saveTokens(tokens.access_token, tokens.refresh_token);
        onLoginSuccess(tokens.access_token);
      } else {
        Alert.alert('Login cancelled', 'Please try again to continue.');
      }
    } catch (err) {
      Alert.alert('Login failed', err.message);
    } finally {
      setLoading(false);
    }
  };

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
            '📊 Saves to Google Sheets',
            '✏️ Edit & categorise transactions',
            '👨‍👩‍👧 Track who you spent for',
          ].map(f => (
            <Text key={f} style={styles.feature}>{f}</Text>
          ))}
        </View>

        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleLogin}
          disabled={loading || !request}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.googleBtnText}>Sign in with Google</Text>
          }
        </TouchableOpacity>

        <Text style={styles.note}>
          Your data stays in your own Google Sheet. We never store it elsewhere.
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
