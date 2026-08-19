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
  'tata power': 'Utilities',
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
  'amazon prime': 'Entertainment',
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

  // "Sent Rs.X From <Bank> A/C ... To <recipient>" is HDFC's standard UPI
  // transfer confirmation format. It doesn't literally contain the word
  // "UPI" in the body, but is a UPI transfer unless a card is mentioned.
  if (b.includes('sent') && b.includes('a/c') && !b.includes('card')) return 'UPI';

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
  // UPI VPA handles (e.g. "to VPA swiggy@ybl", "swiggy@icici") are the most common
  // real-world format for HDFC/Canara UPI debit SMS — check this first.
  const vpaPattern = /(?:vpa\s+)?([a-zA-Z0-9.\-_]+)@[a-zA-Z0-9.\-_]+/i;
  const vpaMatch = body.match(vpaPattern);
  if (vpaMatch) {
    let handle = vpaMatch[1].trim();
    // Merchant VPAs are often "name.randomid" (e.g. Paytm's dynamic
    // "paytm.s16r1h3@pty") — the leading segment is the readable merchant
    // name; everything after the dot is a per-transaction identifier that's
    // meaningless to show to the user.
    if (handle.includes('.')) {
      const [firstSegment] = handle.split('.');
      if (firstSegment.length >= 3) handle = firstSegment;
    }
    return handle;
  }

  // Patterns: "at MERCHANT", "to MERCHANT", "towards MERCHANT"
  // Lazy quantifier + lookahead so we stop at "on <date>"/punctuation instead of
  // greedily swallowing trailing text like "AMAZON on 18-08-26".
  const patterns = [
    /(?:at|to|towards|for)\s+([A-Za-z][A-Za-z0-9\s\.\-&']{1,30}?)(?=\s+on\s+\d|\s+for\s|\s+via\s|\s*\.|\s*,|\s*$)/i,
    /(?:merchant[:\s]+)([A-Za-z][A-Za-z0-9\s\.\-&']{1,30}?)(?=\s+on\s+\d|\s*\.|\s*,|\s*$)/i,
  ];

  // Generic bank/fraud-reporting boilerplate that these SMS templates append
  // (e.g. "...Dial 1930 to report cyber fraud- Canara Bank") can otherwise be
  // mistakenly captured by the "to/at/for MERCHANT" pattern above, since it's
  // just scanning the whole message for the first plausible-looking match.
  const boilerplateWords = ['report', 'fraud', 'dial', 'block', 'suspect', 'cyber', 'call', 'blockupi', 'complain'];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const candidate = match[1].trim().replace(/\s+/g, ' ');
      const isBoilerplate = boilerplateWords.some(w => candidate.toLowerCase().includes(w));
      if (!isBoilerplate) return candidate;
    }
  }
  return '';
}

// ─── Simple deterministic string hash (not cryptographic, just stable) ─────────
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // force 32-bit int
  }
  return Math.abs(hash).toString(36);
}

// ─── Check if SMS is a bank transaction ────────────────────────────────────────
export function isBankTransaction(sender, body) {
  const s = (sender + ' ' + body).toLowerCase();

  // Must be from known bank senders
  const bankSenders = ['hdfc', 'canara', 'cnrb', 'hdfcbk', 'canarabank'];
  const isBank = bankSenders.some(b => s.includes(b));
  if (!isBank) return false;

  // Must contain debit/transaction keywords
  // 'sent' and 'txn' cover HDFC's "Sent Rs.X From..." UPI transfer format
  // and "Txn Rs.X On <Bank> Card..." card-transaction format, both of which
  // don't use any of the other more generic keywords below.
  const txnKeywords = ['debited', 'debit', 'spent', 'payment', 'paid', 'transaction', 'purchase', 'withdrawn', 'sent', 'txn'];
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

  // Deterministic ID (no randomness) so the same SMS always produces the same
  // ID across repeated syncs — this is required for duplicate detection to work.
  const id = `${date}_${amount}_${simpleHash(body)}`;

  return {
    id,
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
