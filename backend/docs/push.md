# Incoming-call pushes (Phase D, backend)

Goal: the callee's phone rings even when the app is closed. The socket from
Phase B only reaches phones with the app open, so the server also sends a
data-only push through Firebase Cloud Messaging (FCM). FCM is used only as a
delivery channel: all data stays in MySQL.

## What travels through Google

| Push | Data | When |
| --- | --- | --- |
| `incoming_call` | `callId`, `expiresAt` (ring deadline), `relayOnly` | a call starts ringing |
| `call_stop` | `callId`, `status` | that ring ends (answered anywhere, declined, cancelled, missed, ended) |

No audio, SDP, ICE or employee ids. The caller's name is added only with
`PUSH_SHOW_CALLER_NAME=true`, and then it is the callee's view of the name, so
a leadership caller shows only the redacted label. Pushes are high priority
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

## Implementation

- `src/modules/push/fcm.js`: FCM HTTP v1 client without firebase-admin
  (service-account JWT → OAuth token cached ~1 h, one retry on 401).
- `src/modules/push/callPush.js`: who gets which push; no duplicate rings, no
  late rings, `call_stop` only for calls that rang.
- `src/modules/push/push.service.js`: `push_tokens` table and sending; never
  throws, never logs tokens or credentials.
- Hooked into the signalling fan-out (`signaling.server.js`), in the
  background, after the socket events.

```bash
npm run test:push --prefix backend   # pure, no DB, no network, no npm deps
```
