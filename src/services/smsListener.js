// src/services/smsListener.js
// Real-time SMS listener — bridges the native SmsReceiverModule (Android
// BroadcastReceiver for SMS_RECEIVED) to JS, parses incoming bank SMS as they
// arrive, and saves new transactions immediately instead of waiting for the
// next manual/focus-triggered sync.
//
// Note: this only fires while the app process is alive (foreground or
// backgrounded). If the app process has been fully killed by the OS or the
// user, those messages are still picked up by the periodic 90-day inbox scan
// in smsReader.js the next time the app is opened — that scan is the fallback
// safety net, this listener is the "instant" path.

import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { parseSMS } from '../utils/smsParser';
import { addTransaction, DuplicateTransactionError } from './transactions';

const { SmsReceiverModule } = NativeModules;

let eventSubscription = null;

/**
 * Start listening for incoming SMS and auto-save recognized bank transactions.
 *
 * @param {Object} options
 * @param {Set<string>} options.existingIds - shared dedup set (smsId values already known)
 * @param {(txn: object) => void} [options.onNewTransaction] - called with the saved transaction
 * @param {(err: Error) => void} [options.onError] - called on unexpected errors
 * @returns {() => void} stop function — call to unsubscribe
 */
export function startSmsListener({ existingIds, onNewTransaction, onError } = {}) {
  if (Platform.OS !== 'android') return () => {};
  if (!SmsReceiverModule) {
    // Native module not available (e.g. running in Expo Go, which can't load
    // custom native code) — silently no-op rather than crashing.
    console.warn('SmsReceiverModule native module not found. Rebuild the app after adding it.');
    return () => {};
  }

  SmsReceiverModule.startListening();

  eventSubscription = DeviceEventEmitter.addListener('onSmsReceived', async (event) => {
    try {
      const sms = {
        sender: event?.sender || '',
        body: event?.body || '',
        date: event?.date || Date.now(),
      };

      const parsed = parseSMS(sms);
      if (!parsed) return; // not a recognized bank debit transaction

      if (existingIds?.has(parsed.id)) return; // already known (shouldn't normally happen for a fresh SMS)
      existingIds?.add(parsed.id);

      try {
        const saved = await addTransaction(parsed);
        onNewTransaction?.(saved);
      } catch (err) {
        if (err instanceof DuplicateTransactionError) return; // race-safe no-op
        throw err;
      }
    } catch (err) {
      onError?.(err);
    }
  });

  return stopSmsListener;
}

export function stopSmsListener() {
  eventSubscription?.remove();
  eventSubscription = null;
  if (Platform.OS === 'android' && SmsReceiverModule) {
    SmsReceiverModule.stopListening();
  }
}
