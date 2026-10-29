// src/components/FilterSheet.js

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView, TextInput,
} from 'react-native';
import { colors, BANK_OPTIONS, PAYMENT_MODE_OPTIONS, SPENT_FOR_OPTIONS } from '../utils/theme';

export default function FilterSheet({ visible, currentFilter, onFilterSelect, onClose }) {
  const [customFilter, setCustomFilter] = useState('');
  const [selectedBank, setSelectedBank] = useState(null);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState(null);
  const [selectedSpentFor, setSelectedSpentFor] = useState(null);

  useEffect(() => {
    if (visible) {
      // Reset custom filters when opening
      setCustomFilter('');
      setSelectedBank(null);
      setSelectedPaymentMode(null);
      setSelectedSpentFor(null);
    }
  }, [visible]);

  const handleApplyCustomFilter = () => {
    if (selectedBank) {
      onFilterSelect(selectedBank);
    } else if (selectedPaymentMode) {
      onFilterSelect(selectedPaymentMode);
    } else if (selectedSpentFor) {
      onFilterSelect(selectedSpentFor);
    } else if (customFilter) {
      onFilterSelect(customFilter);
    }
    onClose();
  };

  const quickFilters = [
    { label: 'All', value: 'All' },
    { label: 'Today', value: 'Today' },
    { label: 'This Week', value: 'This Week' },
    { label: 'This Month', value: 'This Month' },
    { label: 'Income', value: 'Income' },
    { label: 'Expense', value: 'Expense' },
    { label: 'Cash', value: 'Cash' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Advanced Filters</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Quick Filters */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick Filters</Text>
              <View style={styles.filterGrid}>
                {quickFilters.map(filter => (
                  <TouchableOpacity
                    key={filter.value}
                    style={[
                      styles.filterChip,
                      currentFilter === filter.value && styles.filterChipActive,
                    ]}
                    onPress={() => {
                      onFilterSelect(filter.value);
                      onClose();
                    }}
                  >
                    <Text style={[
                      styles.filterChipText,
                      currentFilter === filter.value && styles.filterChipTextActive,
                    ]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Bank Filter */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Bank</Text>
              <View style={styles.filterGrid}>
                {BANK_OPTIONS.map(bank => (
                  <TouchableOpacity
                    key={bank}
                    style={[
                      styles.filterChip,
                      selectedBank === bank && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedBank(bank)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      selectedBank === bank && styles.filterChipTextActive,
                    ]}>
                      {bank}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Payment Mode Filter */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Mode</Text>
              <View style={styles.filterGrid}>
                {PAYMENT_MODE_OPTIONS.map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.filterChip,
                      selectedPaymentMode === mode && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedPaymentMode(mode)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      selectedPaymentMode === mode && styles.filterChipTextActive,
                    ]}>
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Spent For Filter */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Spent For</Text>
              <View style={styles.filterGrid}>
                {SPENT_FOR_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.filterChip,
                      selectedSpentFor === option && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedSpentFor(option)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      selectedSpentFor === option && styles.filterChipTextActive,
                    ]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Custom Filter */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Custom Filter</Text>
              <TextInput
                style={styles.customInput}
                value={customFilter}
                onChangeText={setCustomFilter}
                placeholder="Enter custom filter..."
                placeholderTextColor={colors.textHint}
              />
            </View>

            {/* Apply Button */}
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={handleApplyCustomFilter}
            >
              <Text style={styles.applyBtnText}>Apply Custom Filter</Text>
            </TouchableOpacity>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 10 },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 13, color: colors.textSecondary },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  customInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  applyBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  applyBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});