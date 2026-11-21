package ly.call.comms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Declines a call on the server when the user declines on the phone's own call screen while the
 * app is closed (no JavaScript running), so the caller stops ringing at once.
 *
 * expo-callkit-telecom fires the package-internal ACTION_CALL_EVENT broadcast only for events
 * that could not reach a live JS listener. Its `payload` holds the session, whose incoming-call
 * event carries our server's `serverCallId` and, in `metadata`, a one-call `declineUrl` and
 * `declineToken` (see backend/src/modules/push/declineToken.js). Nothing else is sent.
 *
 * The package line is rewritten to the app's package by plugins/withCallEndedReceiver.js; the
 * manifest entry comes from the expo-callkit-telecom plugin (`androidEventReceiver`).
 */
class CallEndedReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "CallEndedReceiver"
        private const val TIMEOUT_MS = 8_000
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getStringExtra("eventName") != "onCallEnded") return

        val payload = parse(intent.getStringExtra("payload")) ?: return
        val incoming = payload.optJSONObject("session")?.optJSONObject("incomingCallEvent") ?: return
        val callId = incoming.optString("serverCallId", "")
        val metadata = incoming.optJSONObject("metadata") ?: return
        val declineUrl = metadata.optString("declineUrl", "")
        val token = metadata.optString("declineToken", "")
        if (callId.isEmpty() || token.isEmpty()) return
        if (!declineUrl.startsWith("https://") && !declineUrl.startsWith("http://")) return

        // Keep the (possibly just cold-started) process alive for the request.
        val pending = goAsync()
        Thread {
            try {
                post(declineUrl, JSONObject().put("callId", callId).put("token", token).toString())
            } catch (e: Exception) {
                Log.w(TAG, "decline not sent: ${e.javaClass.simpleName}")
            } finally {
                pending.finish()
            }
        }.start()
    }

    private fun parse(json: String?): JSONObject? {
        if (json.isNullOrEmpty()) return null
        return try {
            JSONObject(json)
        } catch (e: Exception) {
            null
        }
    }

    private fun post(url: String, body: String) {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            Log.i(TAG, "decline sent, status $status")
        } finally {
            connection.disconnect()
        }
    }
}
