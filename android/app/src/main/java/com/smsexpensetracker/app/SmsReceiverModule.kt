package com.smsexpensetracker.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.provider.Telephony
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Listens for incoming SMS in real time (while the app process is alive,
 * foreground or backgrounded) and forwards sender/body/timestamp to JS via
 * the "onSmsReceived" event. This complements the periodic 90-day inbox scan
 * in smsReader.js, which acts as a catch-up fallback for anything missed
 * while the app process was not running.
 */
class SmsReceiverModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var receiver: BroadcastReceiver? = null

  override fun getName() = "SmsReceiverModule"

  @ReactMethod
  fun startListening() {
    if (receiver != null) return // already listening

    receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        try {
          val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
          if (messages.isNullOrEmpty()) return

          // A single logical SMS may arrive as multiple PDUs (long messages) —
          // they share the same sender/timestamp and must be concatenated.
          val sender = messages[0].originatingAddress ?: ""
          val timestamp = messages[0].timestampMillis
          val body = messages.joinToString(separator = "") { it.messageBody ?: "" }

          val params = Arguments.createMap().apply {
            putString("sender", sender)
            putString("body", body)
            putDouble("date", timestamp.toDouble())
          }

          reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onSmsReceived", params)
        } catch (e: Exception) {
          // Swallow — a malformed broadcast shouldn't crash the app.
        }
      }
    }

    val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      reactContext.registerReceiver(receiver, filter)
    }
  }

  @ReactMethod
  fun stopListening() {
    receiver?.let {
      try {
        reactContext.unregisterReceiver(it)
      } catch (e: Exception) {
        // Already unregistered — ignore.
      }
    }
    receiver = null
  }

  override fun invalidate() {
    super.invalidate()
    stopListening()
  }
}
