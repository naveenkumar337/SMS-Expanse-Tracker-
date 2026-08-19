// src/components/ErrorBoundary.js
// Top-level error boundary — catches uncaught JS errors during render/effects
// (e.g. a typo'd API call like the one that caused the "undefined is not a
// function" crash on LoginScreen) and shows a friendly recovery screen
// instead of a hard native crash.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../utils/theme';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    // Keep this lightweight — no crash reporting service is wired up yet.
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{error.message || String(error)}</Text>

          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 18, fontWeight: '700',
    color: colors.textPrimary, marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 13, color: colors.textSecondary,
    textAlign: 'center', marginBottom: 24,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 12, paddingHorizontal: 28,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
