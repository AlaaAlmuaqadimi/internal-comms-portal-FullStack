# Calls API (Phase A + Phase B signalling)

Phase A covers call authorization, call lifecycle, redaction and settings. It
does not add WebRTC signalling or change the mobile call UI yet; the relay-only
flag is the contract a later signalling phase consumes.

## Authorization policy

`src/modules/calls/callAuth.service.js` is a pure function with no database
access.

| Caller | Target | Result |
| --- | --- | --- |
| Active employee | Any active employee, any unit | allowed |
| Director (`root`) / Deputy (`deputy`) | Anyone, including each other | allowed |
| Non-leadership employee | Director or Deputy | denied `CALL_TARGET_FORBIDDEN` |
| Anyone | Inactive / deleted / unknown target | denied `CALL_TARGET_FORBIDDEN` |
| Anyone | Themselves | denied `CALL_TARGET_FORBIDDEN` |

Leadership is determined **only** by the employee's org unit `kind` being
`root` or `deputy`. There are no org-tree scope checks, unit-head rules, branch
rules, manager columns or admin exception endpoints.

All target denials return the same HTTP 403 body so a non-leadership caller
cannot tell an existing Director/Deputy from an unknown or inactive target.
Every denial writes an `audit_log` row with `action = 'call.denied'`; the
internal reason (`TARGET_LEADERSHIP`, `TARGET_INACTIVE`, `TARGET_NOT_FOUND`,
`SELF_CALL`, `RATE_LIMITED`, …) is in `metadata`.

`employee_contacts` is **not** read by any call code. It remains a favourites
list only.

## Endpoints

All routes require a Bearer token and are mounted under `/api/calls`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/` or `/invite` | Create a ringing call (rate limited per user) |
| GET | `/` or `/history` | Last 100 calls for the signed-in employee |
| GET | `/oversight` | Admin/auditor metadata-only feed for leadership calls |
| GET | `/:id` | One call, caller/callee view |
| POST | `/:id/accept` (alias `/answer`) | Callee answers |
| POST | `/:id/decline` (alias `/reject`) | Callee rejects; no notification |
| POST | `/:id/cancel` | Caller cancels while ringing |
| POST | `/:id/end` | Either participant ends an accepted call |
| POST | `/:id/missed` | Callee marks a ringing call as missed |

Call statuses are `ringing`, `accepted`, `rejected`, `missed`, `cancelled`,
`ended`, `busy` and `failed` (V019 aligns the legacy `answered`/`declined`
names). Phase A writes `ringing`, `accepted`, `rejected`, `missed`, `cancelled`
and `ended`; `busy` and `failed` are reserved for the Phase B signalling state
machine.


Invite body:

```json
{ "calleeEmployeeId": "<employee-uuid>", "callType": "audio" }
```

`targetEmployeeId` is accepted as an alias for `calleeEmployeeId`.

## Redaction and ICE

`src/modules/calls/callView.service.js` builds the per-viewer response.

- Ordinary calls are direct: `redacted: false`, `canCallBack: true`,
  `iceTransportPolicy: "all"`.
- When the Director/Deputy calls an ordinary employee, the **callee** sees only
  the configured label (`المدير العام` / `وكيل المصلحة`), no avatar, unit or
  employee id, `canCallBack: false`, and `iceTransportPolicy: "relay"`.
- Leadership-to-leadership calls are not redacted, but remain relay-only.
- The caller always sees the real callee.

The org-unit kind is snapshotted in `calls.metadata` when the call is created,
so a later org-tree move cannot de-anonymize an old call.

### Relay-only ICE and its limits

Leadership calls are **relay-only**: the call view returns
`iceTransportPolicy: "relay"`, so a leadership participant's media is expected
to traverse a TURN relay rather than a direct peer-to-peer path. That hides the
participants' IP addresses from each other, but it does **not** mean the server
can never decrypt the call. WebRTC media is end-to-end encrypted with DTLS-SRTP,
and the DTLS handshake exchanges fingerprints through the signalling channel.

The honest statement of the guarantee is therefore:

> Media is encrypted between the two peers. The signalling server relays the
> DTLS fingerprints; if that server is malicious or compromised, it can
> substitute fingerprints and become a man-in-the-middle. Relay-only transport
> reduces IP exposure but is not a defence against a malicious signalling
> server.

The planned Phase F mitigation is either cryptographic fingerprint signing
(each client signs its DTLS fingerprint with a key the other side can verify) or
a short verification code that the two participants compare out of band. Until
one of those lands, this document must not claim that the server is technically
unable to decrypt calls.

## Admin/auditor oversight

`GET /api/calls/oversight` is available to the `admin` and `auditor` roles only
(`middleware/requireCallOversight.js`). It returns calls that involved the
Director or Deputy, selected from the org-unit-kind snapshot in
`calls.metadata`.

The response is **metadata only**:

```json
{
  "id": "<call-uuid>",
  "status": "ended",
  "callType": "audio",
  "initiatedAt": "2026-11-18T09:30:00.000Z",
  "answeredAt": "2026-11-18T09:30:05.000Z",
  "endedAt": "2026-11-18T09:31:12.000Z",
  "durationSeconds": 67,
  "endedReason": "ended",
  "metadata": {
    "callerOrgUnitKind": "root",
    "calleeOrgUnitKind": "section",
    "callerLeadership": true,
    "calleeLeadership": false,
    "relayOnly": true,
    "redaction": "leadership"
  }
}
```

It never returns names, avatars, employee ids, org-unit ids, SDP, ICE
candidates or phone numbers. Ordinary employees get `403 FORBIDDEN`. The
regular `GET /calls/:id` redacted view remains the only participant view, so an
oversight role cannot use this endpoint to de-anonymize a leadership call.

The redaction **label** is deliberately not snapshotted: it is read from
`app_settings` at view time (`GET /calls/:id`, `GET /calls`) and at
notification-creation time (`POST /calls/:id/missed`). There is no in-process
cache, so an administrator's edit applies to the next view and to notifications
created afterwards without a restart. A notification that was already created
keeps the text it was written with; that is the intended audit behaviour.

## Notifications

The only notification generated by calls is `missed_call`. It is created when
a ringing call is marked missed (`POST /:id/missed`, or the Phase B ring
timeout) and, since the Phase B foundation commit, when the caller cancels a
call that is still ringing. Rejections, busy calls, disconnects and completed
calls create no notification. A missed leadership call uses the same redacted
label instead of the caller's name.

> **Open decision:** the cancel → `missed_call` behaviour was introduced by the
> Phase B foundation commit and differs from Phase A, where cancellations
> created no notification. See decision 1 in `calls-phase-b-plan.md`.

The `notifications.metadata` payload is exactly
`{ "callId": "<uuid>", "label": "<already-redacted display name>" }`. It never
contains employee ids, org-unit kinds or the original name.

## Settings

`V018__call_settings.sql` creates `app_settings` (`key`, `value`, `updated_by`,
`updated_at`) and seeds:

- `call.redacted_label.director` = `المدير العام`
- `call.redacted_label.deputy` = `وكيل المصلحة`

The seed does not overwrite an administrator's edit on a migration re-run.
Settings are readable at `GET /api/settings/app` and editable by an
administrator at `PATCH /api/settings/app`:

```json
{ "settings": { "call.redacted_label.director": "المدير العام" } }
```

`GET /api/settings/app` is allowlisted: it returns only
`call.redacted_label.director` and `call.redacted_label.deputy`, in both the
`settings` object and the `items` array. Any other key that is present in
`app_settings` is omitted until it is added to
`PUBLIC_APP_SETTING_KEYS` in `appSetting.service.js`. This is a deliberate
allowlist rather than a filter over today's rows, so a future internal setting
cannot leak just by being inserted into the table.

## Rate limiting and tests

`CALL_INVITE_RATE_WINDOW_MINUTES` (default 1) and `CALL_INVITE_RATE_MAX`
(default 10) control the per-user invitation limiter. A rate-limited invite is
also audited as `call.denied` with reason `RATE_LIMITED`.

```bash
npm run test:calls --prefix backend      # pure policy/redaction tests, no DB
npm run test:calls:db --prefix backend   # disposable DB integration test
```

## Signalling (Phase B, backend)

Off unless `CALL_SIGNALING_ENABLED=true`. With the flag off, socket.io is not
loaded and `POST /api/calls/signaling/ticket` returns
`404 CALL_SIGNALING_DISABLED`; everything above keeps working unchanged.

1. `POST /api/calls/signaling/ticket` (Bearer) → `{ ticket, expiresAt,
   namespace, path, iceServers, turnConfigured }`. The ticket is single use and
   valid for `SIGNALING_TICKET_TTL_SECONDS`.
2. Connect with socket.io-client to `<api>/calls` using
   `{ path: '/api/calls/socket', auth: { ticket } }`.
3. Use the events below. Every client event takes an acknowledgement callback
   and answers `{ ok: true, ... }` or `{ ok: false, code, message }` with the
   same codes as REST.

| Client → server | Payload |
| --- | --- |
| `call:invite` | `{ calleeEmployeeId }` (audio only) |
| `call:accept` / `call:reject` / `call:cancel` / `call:end` | `{ callId }` |
| `call:sync` | `{}` → `{ calls }` (ringing and accepted calls) |
| `signal:offer` / `signal:answer` | `{ callId, data: { type, sdp } }` |
| `signal:ice` | `{ callId, data: { candidate, sdpMid, sdpMLineIndex } \| null }` |
| `signal:sas` | `{ callId, data: { commit } }`, callee only (64 hex chars) |

| Server → client | Meaning |
| --- | --- |
| `call:incoming` | ring (callee view, redacted when required) |
| `call:outgoing` | the caller's other devices learn about a new outgoing call |
| `call:accepted` | for the callee's other devices it also means "answered elsewhere" |
| `call:rejected`, `call:cancelled`, `call:missed`, `call:ended` | terminal states |
| `call:busy` | to the caller only; the callee is told nothing |
| `signal:offer`, `signal:answer`, `signal:ice`, `signal:sas` | `{ callId, data }` from the other participant |

Rules enforced by the server:

- invites go through the same policy, audit and per-user rate limit as REST;
  busy is checked only after the policy allowed the call;
- the caller offers, the callee answers, both send ICE, only while the call is
  `accepted`; any other sender gets the same `CALL_FORBIDDEN`;
- on relay-only (leadership) calls the server drops non-relay ICE candidates
  and strips non-relay `a=candidate` lines from SDP;
- relayed payloads carry only `callId` and the sanitized `data`; SDP and ICE
  are never stored or logged;
- ring timeout (`CALL_RING_TIMEOUT_SECONDS`) → `missed` with
  `ended_reason = 'timeout'` and one `missed_call`; the boot sweep applies the
  same to calls that expired while the server was down;
- when an employee's last socket disconnects, their accepted calls end after
  `CALL_DISCONNECT_GRACE_SECONDS` with `ended_reason = 'disconnected'` unless
  they reconnect and send `call:sync`;
- REST actions are pushed to connected sockets too, so both paths stay in step.

ICE servers come from `STUN_URLS`, `TURN_URLS` and `TURN_SHARED_SECRET`
(coturn `use-auth-secret`) or fixed `TURN_USERNAME` / `TURN_CREDENTIAL`
(hosted TURN). Leadership calls cannot connect until TURN is configured;
`turnConfigured` tells the client.

### Encryption and the security code

Audio is always encrypted end to end by WebRTC (DTLS-SRTP, keys created on the
phones, new keys every call). Neither this server nor a TURN relay can decrypt
it. What the server *could* do, if it were compromised, is swap the DTLS
fingerprints inside the SDP and sit in the middle. The security code makes that
visible:

1. The callee sends `signal:sas` with `commit = SHA-256(prefix | callId |
   its DTLS fingerprint)` before the caller sends the offer.
2. The caller waits up to 8 s for it, then offers. A commitment that arrives
   after the offer is ignored.
3. After the answer, the caller checks the answer's fingerprint against the
   commitment (`mismatch` warning if it differs) and both phones show the same
   6-digit code derived from the two fingerprints.
4. The two people read the code to each other; if it differs, they hang up.

Because the man in the middle must fix its fingerprints before seeing ours,
its chance of producing matching codes is about one in a million per call.
The server only checks that `commit` is 64 lowercase hex characters; it never
sees fingerprints in clear or the code. Implementation and tests:
`mobile/src/calls/securityCode.js`, `mobile/scripts/security-code-test.mjs`.

Signalling itself must run over HTTPS/WSS in production: over plain HTTP the
login and tokens can be read on the network (the audio stays encrypted).

Single API instance only: tickets, timers and rooms live in process memory.

```bash
npm run test:calls:signaling --prefix backend      # pure, no DB, no npm deps
npm run test:calls:signaling:db --prefix backend   # sockets + disposable DB
```

## Manual test kit

For clicking through the API by hand:

- `backend/docs/calls.postman_collection.json` — Postman/Thunder Client collection
- `backend/docs/calls.postman_environment.json` — base URL, usernames, token slots
- `backend/docs/calls-manual-test.md` — step-by-step guide and expected results
- `npm run seed:calls --prefix backend` — dev-only demo accounts (never part of
  the migration chain; it refuses to run when `NODE_ENV=production`)
