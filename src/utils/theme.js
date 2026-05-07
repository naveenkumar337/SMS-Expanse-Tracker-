// src/utils/theme.js

export const colors = {
  primary: '#1a73e8',
  primaryDark: '#1558b0',
  primaryLight: '#e8f0fe',
  danger: '#c62828',
  success: '#2e7d32',
  successLight: '#E8F5E9',
  warning: '#f57f17',
  warningLight: '#FFF8E1',
  background: '#f5f5f5',
  surface: '#ffffff',
  border: '#e0e0e0',
  textPrimary: '#212121',
  textSecondary: '#757575',
  textHint: '#9e9e9e',

  // Spent For tag colors
  self: { bg: '#E3F2FD', text: '#1565c0' },
  wife: { bg: '#FCE4EC', text: '#880e4f' },
  brother: { bg: '#E8F5E9', text: '#2e7d32' },
  parents: { bg: '#FFF3E0', text: '#e65100' },
  other: { bg: '#F3E5F5', text: '#6a1b9a' },
};

export const SPENT_FOR_OPTIONS = ['Self', 'Wife', 'Brother', 'Parents', 'Other'];
export const BANK_OPTIONS = ['HDFC', 'Canara', 'Other'];
export const PAYMENT_MODE_OPTIONS = ['Credit Card', 'Debit Card', 'Rupay UPI', 'UPI', 'Net Banking'];

export const PURPOSE_ICONS = {
  'Food & Dining': '🍔',
  'Shopping': '🛒',
  'Fuel & Transport': '⛽',
  'Medical': '💊',
  'Utilities': '💡',
  'Entertainment': '🎬',
  'Education': '📚',
  'Grocery': '🥦',
  '': '💳',
};

export function getSpentForColor(spentFor) {
  const map = {
    Self: colors.self,
    Wife: colors.wife,
    Brother: colors.brother,
    Parents: colors.parents,
    Other: colors.other,
  };
  return map[spentFor] || colors.self;
}
