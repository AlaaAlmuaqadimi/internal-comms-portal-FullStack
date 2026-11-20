# Calls Phase B — Signalling plan

Status: **backend implemented** on `feature/calls-phase-b-signaling` with the
defaults below; decisions 1, 2 and 4 still need confirmation. Base branch: `feature/calls-phase-b` (`bb557e6`, "Phase B foundation").

## 1. Scope

Phase B adds a real-time signalling server so two employees can set up a 1:1
audio call. It reuses the Phase A REST lifecycle and authorization unchanged.

In scope (backend only):

- socket.io server attached to the existing HTTP server, behind
  `CALL_SIGNALING_ENABLED` (default `false`);
- short-lived signalling tickets;
- live call events (invite, accept, reject, cancel, end, busy, missed);
- relaying SDP offer/answer and ICE candidates between the two participants;
- ring timeout, boot sweep and disconnect grace;
- signalling tests.

Out of scope (later phases):

- mobile socket client, WebRTC audio, incoming-call UI (Phase C);
- push notifications / native incoming-call screen (Phase D);
- group calls (Phase E);
- multi-instance signalling and DTLS fingerprint verification (Phase F).

## 2. What already exists on the base branch

| Item | File |
| --- | --- |
| `calls.ring_expires_at` + index | `database/migrations/V020__call_signaling.sql` |
| `ring_expires_at` written on invite | `call.service.js` → `inviteCall` |
| Helpers for the socket layer | `call.service.js` → `loadCallById`, `listActiveCallViews`, `getCallViewForEmployee`, `isEmployeeBusy`, `listAcceptedCallIdsForEmployee` |
| Single missed-call writer | `callNotifications.service.js` |
| Feature flag and timings | `config/env.js` → `env.callSignaling`, `.env.example` |
| Error codes | `CALL_SIGNALING_DISABLED`, `CALL_SIGNAL_NOT_ENABLED` |
| Dependencies | `socket.io` (runtime), `socket.io-client` (dev) |

Not yet written: the socket server, the ticket endpoint, the ring timer, the
boot sweep, disconnect handling and any signalling test.

## 3. Principles

1. **The database is the source of truth.** Every state change goes through the
   same `call.service.js` functions the REST API uses, with the same
   `WHERE status = ...` guards. The socket layer only authenticates, calls the
   service, and fans out events. A REST call and a socket event can never
   disagree about a call.
2. **Same rules, same responses.** Socket denials use the same codes as REST
   (`CALL_TARGET_FORBIDDEN` for every target-side denial) and write the same
   `call.denied` audit rows.
3. **No identity leaks through signalling.** Events addressed to a redacted
   callee carry only the callee's `buildCallView` output and the `callId`.
   No employee ids, names, org-unit data or socket ids of the other party.
4. **Nothing sensitive is stored or logged.** SDP and ICE payloads are relayed
   in memory only: never written to the database, the audit log or morgan.
5. **Off by default.** With the flag off, the server behaves exactly like
   Phase A.

## 4. Connection and authentication

- `POST /api/calls/signaling/ticket` (Bearer auth, rate limited by
  `SIGNALING_TICKET_RATE_WINDOW_MINUTES` / `SIGNALING_TICKET_RATE_MAX`)
  returns `{ ticket, expiresAt, iceServers }`.
  - The ticket is 32 random bytes (base64url), single-use, valid for
    `SIGNALING_TICKET_TTL_SECONDS` (120 s). Only its SHA-256 is kept, in an
    in-process map (single instance until Phase F).
  - With the flag off the endpoint returns `404 CALL_SIGNALING_DISABLED`.
- The client connects to the namespace `/calls` with
  `auth: { ticket }`. The handshake middleware consumes the ticket and loads
  the employee. An inactive or deleted employee is rejected.
- Why a ticket and not the access token: the JWT never travels in the
  handshake (which proxies may log), and a stolen ticket is useless after one
  use or two minutes.
- Each socket joins the room `emp:<employeeId>`, so several devices of the same
  employee all receive events.

## 5. Events

All client → server events use socket.io acknowledgements:
`ack({ ok: true, call })` or `ack({ ok: false, code, message })`.

| Client → server | Payload | Service call |
| --- | --- | --- |
| `call:invite` | `{ calleeEmployeeId, callType: 'audio' }` | `inviteCall` (+ busy check) |
| `call:accept` | `{ callId }` | `acceptCall` |
| `call:reject` | `{ callId }` | `declineCall` |
| `call:cancel` | `{ callId }` | `cancelCall` |
| `call:end` | `{ callId }` | `endCall` |
| `call:sync` | `{}` | `listActiveCallViews` |
| `signal:offer` / `signal:answer` / `signal:ice` | `{ callId, data }` | relay only |

| Server → client | Sent to | Payload |
| --- | --- | --- |
| `call:incoming` | callee room | callee's call view (redacted when required) |
| `call:accepted` | both rooms | each side's own view |
| `call:answered-elsewhere` | callee's other devices | `{ callId }` |
| `call:rejected` / `call:cancelled` / `call:ended` / `call:missed` / `call:busy` | both rooms | each side's own view |
| `signal:offer` / `signal:answer` / `signal:ice` | the other participant | `{ callId, data }` |

Signal relay rules:

- only the two participants of the call may send signals for it;
- `signal:*` is accepted only while the call is `accepted`;
- payload size is capped (SDP 16 KB, ICE candidate 2 KB) and the event rate is
  limited per socket;
- **relay-only calls**: for any call whose view says
  `iceTransportPolicy: "relay"`, the server drops ICE candidates that are not
  `typ relay` and strips non-relay `a=candidate` lines from SDP. The client
  setting alone is not trusted.

## 6. Timers and recovery

- **Ring timeout.** On invite, a timer fires at `ring_expires_at`. It runs the
  existing guarded `ringing → missed` update, calls
  `createMissedCallNotification` once, and emits `call:missed`. If the call
  already left `ringing`, the update matches 0 rows and nothing happens.
- **Boot sweep.** On start, ringing rows with
  `ring_expires_at < now` (or `initiated_at + timeout` for pre-V020 rows) are
  marked missed with one notification each. Ringing rows still in the future
  get their timer re-armed.
- **Disconnect grace.** When an employee's last socket disconnects, each of
  their `accepted` calls gets a `CALL_DISCONNECT_GRACE_SECONDS` (30 s) timer.
  A reconnect plus `call:sync` cancels it; otherwise the call is ended with
  `ended_reason = 'disconnected'` and `call:ended` is emitted to the other side.
- **Busy.** If the callee already has a `ringing` or `accepted` call, the new
  call is written with status `busy` and the caller gets `call:busy`. The callee
  is not notified (see decision 2).

## 7. Files to add or change

| File | Change |
| --- | --- |
| `src/modules/calls/signaling/ticket.service.js` | issue / consume tickets |
| `src/modules/calls/signaling/signaling.server.js` | attach socket.io, handshake, rooms, event handlers |
| `src/modules/calls/signaling/relay.js` | pure signal validation and relay-only filtering |
| `src/modules/calls/signaling/timers.js` | ring timers, boot sweep, disconnect grace |
| `src/modules/calls/call.routes.js` | `POST /signaling/ticket` (before `/:id`) |
| `src/server.js` | attach signalling when the flag is on; close it on shutdown |
| `scripts/call-signaling-test.js` | pure tests for `relay.js` and ticket logic |
| `scripts/call-signaling-db-test.js` | socket.io-client end-to-end test against a disposable DB |
| `package.json` | `test:calls:signaling`, `test:calls:signaling:db` |
| `docs/calls.md` | signalling section once the code lands |

No new migration is planned: `ended_reason` is `VARCHAR(64)` (V005), so
`'disconnected'` fits without a schema change.

## 8. Tests

Pure (no DB, run with `npm run test:calls:signaling`):

- relay-only filtering drops host/srflx candidates and SDP lines;
- payload size and shape limits;
- ticket single use and expiry.

DB + sockets (disposable DB, `npm run test:calls:signaling:db`):

- invite → incoming → accept → offer/answer/ice → end, both sides;
- employee → Director over the socket: `CALL_TARGET_FORBIDDEN`, identical to an
  unknown target, audited;
- Director → employee: callee event is redacted, no ids anywhere in payloads;
- reject creates no notification;
- ring timeout creates exactly one `missed_call`; a late accept fails;
- boot sweep marks expired rows missed once;
- busy callee;
- a third employee cannot send signals for someone else's call;
- flag off: ticket endpoint 404, no socket server.

## 9. Decisions (defaults taken in the implementation)

1. **Cancel → missed-call notification.** The base WIP commit changed
   `cancelCall` so that a caller cancelling while ringing now creates a
   `missed_call` for the callee. Phase A and `calls.md` say cancellations create
   no notification. Keep the new behaviour (and update `calls.md` and the DB
   test), or revert to Phase A?
2. **Busy.** Should a busy call create a `missed_call` for the callee, or
   nothing? The plan assumes nothing.
3. **Multiple devices.** Ring all of the callee's devices, first accept wins,
   other devices get `call:answered-elsewhere`. OK?
4. **TURN server.** Leadership calls are relay-only, so they cannot connect at
   all without a TURN server, and none is configured today. Proposal: coturn
   with time-limited credentials (`TURN_URLS`, `TURN_SHARED_SECRET`,
   `TURN_CREDENTIAL_TTL_SECONDS`), returned in the ticket response. Who hosts it?
5. **Ticket vs. token.** The plan uses one-time tickets (matching the env
   variables already added). Confirm.

Defaults used in the code until confirmed:

| # | Default |
| --- | --- |
| 1 | Kept the foundation commit's behaviour (cancel while ringing creates `missed_call`); `calls.md` flags it as open. |
| 2 | Busy creates no notification and the callee is not told. |
| 3 | All devices ring; `call:accepted` reaches the callee's other devices as "answered elsewhere". |
| 4 | TURN is configurable (`TURN_URLS`, `TURN_SHARED_SECRET`); nothing is hosted yet. |
| 5 | One-time tickets. |

Implementation notes that differ from the draft:

- the ring timeout writes `ended_reason = 'timeout'` (status `missed`);
- there is no separate `call:answered-elsewhere` event (see decision 3);
- a caller who is already in a call gets `409 CALL_INVALID_STATE` (audited as
  `CALLER_BUSY`);
- the plan's file names became `signaling/ticketStore.js`,
  `signaling/callTimers.js`, `signaling/rateWindow.js`,
  `signaling/iceServers.js`, `signaling/relay.js` and
  `signaling/signaling.server.js`.
