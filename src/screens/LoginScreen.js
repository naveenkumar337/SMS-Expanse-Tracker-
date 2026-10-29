// src/screens/LoginScreen.js

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors } from '../utils/theme';
import { signIn, signUp, getStoredSession } from '../services/auth';

const PHONE_REGEX = /^\d{10}$/;

export default function LoginScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const session = await getStoredSession();
      if (session) onLoginSuccess(session);
    } finally {
      setChecking(false);
    }
  };

  const resetFields = () => {
    setName(''); setEmail(''); setPhone(''); setPassword(''); setConfirmPassword('');
  };

  const switchMode = (next) => {
    setMode(next);
    resetFields();
  };

  const validate = () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Email and password are required.');
      return false;
    }
    if (mode === 'signup') {
      if (!name.trim()) {
        Alert.alert('Missing details', 'Please enter your name.');
        return false;
      }
      if (!PHONE_REGEX.test(phone.trim())) {
        Alert.alert('Invalid phone number', 'Please enter a valid 10-digit phone number.');
        return false;
      }
      if (password.length < 6) {
        Alert.alert('Weak password', 'Password must be at least 6 characters.');
        return false;
      }
      if (password !== confirmPassword) {
        Alert.alert('Passwords do not match', 'Please make sure both passwords match.');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const session = mode === 'signup'
        ? await signUp({ name: name.trim(), email: email.trim(), phone: phone.trim(), password })
        : await signIn({ email: email.trim(), password });
      onLoginSuccess(session);
    } catch (err) {
      Alert.alert(mode === 'signup' ? 'Sign up failed' : 'Login failed', err.message);
    } finally {
      setLoading(false);
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.appIcon}>💳</Text>
          <Text style={styles.title}>SMS Expense Tracker</Text>
          <Text style={styles.subtitle}>
            Track your HDFC & Canara bank transactions automatically from SMS
          </Text>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => switchMode('login')}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
              onPress={() => switchMode('signup')}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {mode === 'signup' && (
              <TextInput
                style={styles.input}
                placeholder="Full name"
                placeholderTextColor={colors.textHint}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textHint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {mode === 'signup' && (
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor={colors.textHint}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textHint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {mode === 'signup' && (
              <TextInput
                style={styles.input}
                placeholder="Confirm password"
                placeholderTextColor={colors.textHint}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            )}
          </View>

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{mode === 'signup' ? 'Create account' : 'Log in'}</Text>
            }
          </TouchableOpacity>

          <Text style={styles.note}>
            Your data stays in your own secure database. We never store it elsewhere.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
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
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 4,
    width: '100%',
    marginTop: 20,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: '#fff' },
  form: { width: '100%', marginTop: 18 },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 10, width: '100%', alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  note: {
    fontSize: 11, color: colors.textHint,
    textAlign: 'center', marginTop: 16, lineHeight: 16,
  },
});
