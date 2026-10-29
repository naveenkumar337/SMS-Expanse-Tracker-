// src/components/ExportSheet.js
// Lets the user pick a start/end date range and export transactions in that
// range to a real .xlsx file, saved directly to a user-chosen folder.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Alert,
} from 'react-native';
import dayjs from 'dayjs';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { colors } from '../utils/theme';
import { exportTransactionsToExcel } from '../services/exportTransactions';

export default function ExportSheet({ visible, onClose }) {
  const [startDate, setStartDate] = useState(dayjs().subtract(30, 'day').toDate());
  const [endDate, setEndDate] = useState(new Date());
  const [exporting, setExporting] = useState(false);

  const pickDate = (which) => {
    const current = which === 'start' ? startDate : endDate;
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) return;
        if (which === 'start') setStartDate(selectedDate);
        else setEndDate(selectedDate);
      },
    });
  };

  const handleExport = async () => {
    if (dayjs(startDate).isAfter(dayjs(endDate))) {
      Alert.alert('Invalid range', 'Start date must be before the end date.');
      return;
    }
    setExporting(true);
    try {
      const { count } = await exportTransactionsToExcel(startDate, endDate);
      Alert.alert('Export complete', `Saved ${count} transaction${count === 1 ? '' : 's'} to the selected folder.`);
      onClose();
    } catch (err) {
      Alert.alert('Export failed', err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Export to Excel</Text>
          <Text style={styles.subtitle}>Choose a date range to export</Text>

          <View style={styles.group}>
            <Text style={styles.label}>From</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => pickDate('start')}>
              <Text style={styles.dateBtnText}>{dayjs(startDate).format('DD MMM YYYY')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>To</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => pickDate('end')}>
              <Text style={styles.dateBtnText}>{dayjs(endDate).format('DD MMM YYYY')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose} disabled={exporting}>
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnExport} onPress={handleExport} disabled={exporting}>
              {exporting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnExportText}>Export</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: 16 },
  group: { marginBottom: 14 },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: 5 },
  dateBtn: {
    backgroundColor: '#f5f5f5', borderRadius: 8,
    borderWidth: 0.5, borderColor: colors.border,
    padding: 12,
  },
  dateBtnText: { fontSize: 14, color: colors.textPrimary },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btnCancel: {
    flex: 1, padding: 12, borderRadius: 10,
    borderWidth: 0.5, borderColor: colors.border, alignItems: 'center',
  },
  btnCancelText: { fontSize: 14, color: colors.textSecondary },
  btnExport: {
    flex: 1, padding: 12, borderRadius: 10,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  btnExportText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
