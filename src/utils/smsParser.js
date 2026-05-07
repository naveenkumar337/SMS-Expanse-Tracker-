// src/utils/smsParser.js
// Parses HDFC and Canara Bank SMS messages to extract transaction details

import dayjs from 'dayjs';

// ─── Merchant → Purpose mapping ───────────────────────────────────────────────
const MERCHANT_CATEGORIES = {
  // Food & Dining
  swiggy: 'Food & Dining',
  zomato: 'Food & Dining',
  dominos: 'Food & Dining',
  'pizza hut': 'Food & Dining',
  kfc: 'Food & Dining',
  mcdonalds: 'Food & Dining',
  starbucks: 'Food & Dining',
  restaurant: 'Food & Dining',
  cafe: 'Food & Dining',
  hotel: 'Food & Dining',

  // Shopping
  amazon: 'Shopping',
  flipkart: 'Shopping',
  myntra: 'Shopping',
  ajio: 'Shopping',
  meesho: 'Shopping',
  nykaa: 'Shopping',
  snapdeal: 'Shopping',
  reliance: 'Shopping',
  dmart: 'Shopping',
  bigbazaar: 'Shopping',
  'big bazaar': 'Shopping',

  // Fuel & Transport
  petrol: 'Fuel & Transport',
  diesel: 'Fuel & Transport',
  hp: 'Fuel & Transport',
  'indian oil': 'Fuel & Transport',
  iocl: 'Fuel & Transport',
  bharat: 'Fuel & Transport',
  bpcl: 'Fuel & Transport',
  ola: 'Fuel & Transport',
  uber: 'Fuel & Transport',
  rapido: 'Fuel & Transport',
  irctc: 'Fuel & Transport',
  railway: 'Fuel & Transport',
  metro: 'Fuel & Transport',

  // Medical
  apollo: 'Medical',
  pharmacy: 'Medical',
  medical: 'Medical',
  hospital: 'Medical',
  clinic: 'Medical',
  pharma: 'Medical',
  medplus: 'Medical',
  netmeds: 'Medical',

  // Utilities
  electricity: 'Utilities',
  bescom: 'Utilities',
  msedcl: 'Utilities',
  tata power: 'Utilities',
  water: 'Utilities',
  gas: 'Utilities',
  broadband: 'Utilities',
  airtel: 'Utilities',
  jio: 'Utilities',
  bsnl: 'Utilities',
  vodafone: 'Utilities',
  vi: 'Utilities',
  recharge: 'Utilities',

  // Entertainment
  netflix: 'Entertainment',
  hotstar: 'Entertainment',
  amazon prime: 'Entertainment',
  spotify: 'Entertainment',
  youtube: 'Entertainment',
  bookmyshow: 'Entertainment',
  pvr: 'Entertainment',
  inox: 'Entertainment',

  // Education
  udemy: 'Education',
  coursera: 'Education',
  byju: 'Education',
  school: 'Education',
  college: 'Education',
  university: 'Education',
  fees: 'Education',

  // Grocery
  bigbasket: 'Grocery',
  grofers: 'Grocery',
  blinkit: 'Grocery',
  zepto: 'Grocery',
  grocery: 'Grocery',
  supermarket: 'Grocery',
};

// ─── Detect purpose from merchant name ─────────────────────────────────────────
export function detectPurpose(merchantName) {
  if (!merchantName) return '';
  const lower = merchantName.toLowerCase();
  for (const [keyword, category] of Object.entries(MERCHANT_CATEGORIES)) {
    if (lower.includes(keyword)) return category;
  }
  return '';
}

// ─── Detect bank from SMS sender or body ───────────────────────────────────────
export function detectBank(sender, body) {
  const s = (sender + ' ' + body).toLowerCase();
  if (s.includes('hdfc')) return 'HDFC';
  if (s.includes('canara') || s.includes('cnrb')) return 'Canara';
  return 'Other';
}

// ─── Detect payment mode from SMS body ─────────────────────────────────────────
export function detectPaymentMode(body) {
  const b = body.toLowerCase();

  // UPI checks first (more specific)
  if (b.includes('rupay') && (b.includes('upi') || b.includes('vpa'))) return 'Rupay UPI';
  if (b.includes('upi') || b.includes('vpa') || b.includes('bhim')) return 'UPI';

  // Card checks
  if (b.includes('credit card') || b.includes('cc ') || b.includes('creditcard')) return 'Credit Card';
  if (b.includes('debit card') || b.includes('dc ') || b.includes('debitcard')) return 'Debit Card';

  // Net banking
  if (b.includes('netbanking') || b.includes('net banking') || b.includes('neft') || b.includes('imps') || b.includes('rtgs')) return 'Net Banking';

  // Fallback — check for card number patterns like XX1234
  if (/xx\d{4}/i.test(b)) {
    if (b.includes('credit')) return 'Credit Card';
    return 'Debit Card';
  }

  return 'Debit Card';
}

// ─── Extract amount ─────────────────────────────────────────────────────────────
export function extractAmount(body) {
  // Matches: Rs.500, Rs 500, INR 500, INR500, debited for 500.00, amt 500
  const patterns = [
    /(?:rs\.?|inr\.?|₹)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i,
    /(?:debited|debit|spent|paid|payment of|amount of|amt\.?)\s*(?:rs\.?|inr\.?|₹)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)/i,
    /(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*(?:rs\.?|inr\.?|₹)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const raw = match[1].replace(/,/g, '');
      const amount = parseFloat(raw);
      if (!isNaN(amount) && amount > 0) return amount;
    }
  }
  return null;
}

// ─── Extract merchant name ──────────────────────────────────────────────────────
export function extractMerchant(body) {
  // Patterns: "at MERCHANT", "to MERCHANT", "towards MERCHANT"
  const patterns = [
    /(?:at|to|towards|for)\s+([A-Za-z][A-Za-z0-9\s\.\-&']{2,30})(?:\s+on|\s+for|\s+via|\s*\.|\s*,|$)/i,
    /(?:merchant[:\s]+)([A-Za-z][A-Za-z0-9\s\.\-&']{2,30})/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      return match[1].trim().replace(/\s+/g, ' ');
    }
  }
  return '';
}

// ─── Check if SMS is a bank transaction ────────────────────────────────────────
export function isBankTransaction(sender, body) {
  const s = (sender + ' ' + body).toLowerCase();

  // Must be from known bank senders
  const bankSenders = ['hdfc', 'canara', 'cnrb', 'hdfcbk', 'canarabank'];
  const isBank = bankSenders.some(b => s.includes(b));
  if (!isBank) return false;

  // Must contain debit/transaction keywords
  const txnKeywords = ['debited', 'debit', 'spent', 'payment', 'paid', 'transaction', 'purchase', 'withdrawn'];
  const hasTxn = txnKeywords.some(k => s.includes(k));

  // Must contain amount pattern
  const hasAmount = /(?:rs\.?|inr\.?|₹)\s*\d+/i.test(body);

  return hasTxn && hasAmount;
}

// ─── Main parse function ────────────────────────────────────────────────────────
export function parseSMS(sms) {
  const { sender = '', body = '', date } = sms;

  if (!isBankTransaction(sender, body)) return null;

  const bank = detectBank(sender, body);
  const paymentMode = detectPaymentMode(body);
  const amount = extractAmount(body);
  const merchant = extractMerchant(body);
  const purpose = detectPurpose(merchant);

  if (!amount) return null;

  return {
    id: `${date}_${amount}_${Math.random().toString(36).substr(2, 6)}`,
    purpose,
    merchant,
    cost: amount,
    date: dayjs(date).format('DD MMM YYYY'),
    rawDate: date,
    bank,
    paymentMode,
    bankPayment: `${bank} — ${paymentMode}`,
    spentFor: 'Self',
    rawSMS: body,
    synced: false,
  };
}

// ─── Parse multiple SMS messages ────────────────────────────────────────────────
export function parseAllSMS(smsList) {
  const results = [];
  for (const sms of smsList) {
    const parsed = parseSMS(sms);
    if (parsed) results.push(parsed);
  }
  // Sort newest first
  return results.sort((a, b) => b.rawDate - a.rawDate);
}
