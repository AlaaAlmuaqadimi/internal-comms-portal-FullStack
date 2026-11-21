# Incoming-call pushes (Phase D, backend)

Goal: the callee's phone rings even when the app is closed. The socket from
Phase B only reaches phones with the app open, so the server also sends a
data-only push through Firebase Cloud Messaging (FCM). FCM is used only as a
delivery channel: all data stays in MySQL.

## What travels through Google

| Push (`messageType`) | Data | When |
| --- | --- | --- |
| `incomingCall` | `incomingCall`: JSON string `{ eventId, serverCallId, hasVideo, startedAt, caller: { id, displayName }, metadata: { expiresAt, relayOnly, redacted } }` | a call starts ringing |
| `callEnded` | `callEnded`: JSON string `{ eventId, serverCallId, reason }` | that ring ends: answered (`answeredElsewhere`), declined (`declinedElsewhere`), cancelled / ended (`remoteEnded`), missed (`unanswered`) |

Both are parsed natively by expo-callkit-telecom on Android (before JS runs):
`incomingCall` shows the system call screen, `callEnded` dismisses it.

`callEnded` hangs up a call on that phone **without checking its state**, so
after an answer it must not reach the phone that answered. The app sends its
own push token in the accept (`call:accept` → `{ callId, pushToken }`); the
server excludes that token. Without a token no `callEnded` is sent after an
answer (other phones stop on the socket event, or at the ring timeout).

No audio, SDP, ICE or employee ids: `caller.id` is a fixed opaque value and
`displayName` is "مكالمة داخلية" unless `PUSH_SHOW_CALLER_NAME=true`, and then
it is the callee's view of the name, so a leadership caller shows only the
redacted label. Pushes are high priority
with a TTL equal to the time left to ring (max 120 s), so a late push never
rings an old call. The phone must still check `expiresAt` and ask the server
(`call:sync`) before showing anything.

## Setup

1. Firebase console → project → Project settings → Service accounts →
   Generate new private key. Save the JSON as
   `backend/secrets/firebase-service-account.json` (git-ignored; never commit
   or share it).
2. `backend/.env`: `PUSH_ENABLED=true` (and optionally
   `FCM_SERVICE_ACCOUNT_FILE`, `PUSH_SHOW_CALLER_NAME`).
3. `npm run migrate --prefix backend` (V021 creates `push_tokens`).
4. Restart the backend; the log shows `[push] FCM enabled for project ...`.

## API

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/push/tokens` | `{ token, platform: 'android' \| 'ios' }` | after sign-in and whenever FCM rotates the token; moves a token to the current user |
| `DELETE` | `/api/push/tokens` | `{ token }` | on sign-out; only the owner's row is removed |

Both need the bearer token. At most 5 phones per employee are kept (newest
first). Tokens that FCM reports as `UNREGISTERED` are deleted automatically.

### Missed calls in the notification shade

When a ring that was pushed ends as `missed`, the callee's Android phones get,
after the `callEnded` push, an FCM **notification** message (Android shows it
by itself, even with the app closed): title "مكالمة فائتة", generic body
unless `PUSH_SHOW_CALLER_NAME=true` (then the callee-side name, redaction
kept), channel `missed-calls` (created by the app in
`mobile/src/services/deviceNotifications.js`), tag `missed-<callId>` so a call
appears once, TTL 24 h. iPhones are skipped: this needs a regular APNs alert
token, not the VoIP one.

### iPhone (APNs VoIP)

iPhones register an `APNS_VOIP` token (`platform: ios`, stored with provider
`apns_voip`, migration V022). Ring pushes go to them through Apple as PushKit
VoIP pushes (`src/modules/push/apns.js`, node:http2, ES256 provider token):

- topic `<APNS_BUNDLE_ID>.voip`, `apns-push-type: voip`, priority 10,
  expiration = ring deadline;
- payload `{ "incomingCall": { ...same event as Android, as an object } }`;
- **stop pushes are never sent to iPhones**: Apple requires every VoIP push to
  show a CallKit call, so a "stop ringing" VoIP push would ring instead. On
  iPhone the app is woken by the ring push, so it stops on the socket event or
  at the ring timeout, and a decline reaches the server from the app itself.
- 410 / `Unregistered` deletes the token; `BadDeviceToken` and
  `DeviceTokenNotForTopic` keep it (usually sandbox/production or bundle id
  set wrong on the server).

Setup (after the Apple Developer account exists): create a key with "Apple
Push Notifications service (APNs)", put the `.p8` in `backend/secrets/`
(git-ignored, `*.p8` too), set `APNS_KEY_ID`, `APNS_TEAM_ID`,
`APNS_BUNDLE_ID`; `APNS_PRODUCTION=false` for development builds, `true` for
TestFlight / App Store. Android and iPhone work independently: either can be
configured without the other.

### Declining on a closed app

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/push/decline` | `{ callId, token }` | no sign-in; rate limited per IP (30/min) |

With the app closed no JavaScript runs, so a decline on the phone's call
screen cannot use the socket. Each ring push carries `metadata.declineUrl`
and `metadata.declineToken` (base URL: `PUSH_PUBLIC_API_URL`, or in development
this machine's LAN IP found automatically; production must set it); the app's native
receiver (`mobile/plugins/CallEndedReceiver.kt`) posts them here and the call
is declined as if the app had sent `call:reject`.

The token is an HMAC (key derived from the JWT signing key) over the call id,
the callee's employee id and the ring deadline (+15 s). It declines only that
ringing call for that callee; an ended ring returns `declined: false`, a bad
token or unknown call returns 403.

## Implementation

- `src/modules/push/fcm.js`: FCM HTTP v1 client without firebase-admin
  (service-account JWT → OAuth token cached ~1 h, one retry on 401).
- `src/modules/push/callPush.js`: who gets which push; no duplicate rings, no
  late rings, `call_stop` only for calls that rang.
- `src/modules/push/push.service.js`: `push_tokens` table and sending; never
  throws, never logs tokens or credentials.
- `src/modules/push/apns.js`: APNs VoIP client for iPhones.
- `src/modules/push/declineToken.js` + `pushDecline.service.js`: decline
  links in ring pushes and `POST /api/push/decline`.
- Hooked into the signalling fan-out (`signaling.server.js`), in the
  background, after the socket events.

```bash
npm run test:push --prefix backend   # pure, no DB, no network, no npm deps
```
