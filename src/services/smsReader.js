// src/services/smsReader.js
// Reads SMS from Android device with permission handling

import { PermissionsAndroid, Platform } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import { parseAllSMS } from '../utils/smsParser';
import dayjs from 'dayjs';

// ─── Request SMS permission ─────────────────────────────────────────────────────
export async function requestSMSPermission() {
  if (Platform.OS !== 'android') return false;

  try {
    // READ_SMS is needed for the historical inbox scan (readSMSFromDevice).
    // RECEIVE_SMS is needed separately, only for the real-time listener
    // (SmsReceiverModule) to receive the SMS_RECEIVED broadcast from the OS.
    // We request both together (Android bundles them into one "SMS" dialog),
    // but only gate this function's return value on READ_SMS — the historical
    // scan must keep working even if a user denies RECEIVE_SMS specifically
    // (and vice versa), instead of failing outright if either one is denied.
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ]);

    return results[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('SMS permission error:', err);
    return false;
  }
}

// ─── Read SMS from device ───────────────────────────────────────────────────────
export function readSMSFromDevice(daysBack = 60) {
  return new Promise((resolve, reject) => {
    const minDate = dayjs().subtract(daysBack, 'day').valueOf();

    const filter = {
      box: 'inbox',
      minDate,
      // Filter by known bank sender addresses
      address: '', // empty = all senders; we filter in parser
    };

    SmsAndroid.list(
      JSON.stringify(filter),
      (fail) => reject(new Error(fail)),
      (count, smsList) => {
        try {
          const parsed = JSON.parse(smsList);
          // Map to standard format
          const messages = parsed.map(sms => ({
            sender: sms.address || '',
            body: sms.body || '',
            date: sms.date || Date.now(),
          }));
          resolve(messages);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// ─── Main function: read + parse bank SMS ───────────────────────────────────────
export async function readAndParseBankSMS(existingIds = new Set()) {
  const hasPermission = await requestSMSPermission();
  if (!hasPermission) {
    throw new Error('SMS permission denied. Please allow SMS access in app settings.');
  }

  const rawMessages = await readSMSFromDevice(60); // last 60 days
  const transactions = parseAllSMS(rawMessages);

  // Filter out already-known transactions
  const newTransactions = transactions.filter(t => !existingIds.has(t.id));

  return { all: transactions, newOnes: newTransactions };
}
