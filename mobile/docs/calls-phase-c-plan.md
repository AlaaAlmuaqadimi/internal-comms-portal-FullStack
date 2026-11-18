# Calls Phase C — Mobile audio calls plan

Status: **C2 implemented** (signalling, ringing, answer/decline/cancel/hang-up,
busy, missed; no audio yet). C1, C3 and C4 are next. Builds on the Phase B backend (`feature/calls-phase-b-signaling`,
all signalling tests green on 2026-11-18).

## 1. Goal and scope

Two employees can make a real 1:1 audio call from the app **while the app is
open** (foreground), using the Phase B socket for signalling and WebRTC for
audio.

In scope:

- signalling client (ticket + socket.io) with safe reconnects;
- WebRTC audio session (microphone, mute, speaker, hang up);
- incoming-call screen inside the app, outgoing ringing state, active call;
- wiring the Directory and Calls screens to start real calls;
- redaction respected in every piece of UI;
- falling back to today's REST-only behaviour when signalling is off.

Out of scope (later phases):

- calls while the app is in the background, closed or the phone is locked:
  push notifications, Android ConnectionService / iOS CallKit (Phase D);
- group calls (Phase E);
- multi-instance signalling, network-change ICE restart, DTLS fingerprint
  verification (Phase F).

A call that rings while the callee's app is closed simply times out on the
server and becomes the existing `missed_call` notification.

## 2. Hard prerequisites

1. **Development build, not Expo Go.** `react-native-webrtc` is native code and
   cannot run in Expo Go. The project already has `expo-dev-client` and an
   EAS `development` profile; testers must install that build. The
   `start:go*` scripts will keep working for every other screen, but calls
   will show "not available in this build".
2. **Version check first (task C1).** Install with
   `npx expo install react-native-webrtc @config-plugins/react-native-webrtc`
   so Expo picks matching versions, then make one development build. The
   public compatibility table we found stops at Expo SDK 54; support for
   SDK 58 / React Native 0.88 (New Architecture) must be proven by that build
   before any other work.
3. **Backend flag on in dev:** `CALL_SIGNALING_ENABLED=true`.
4. **TURN for leadership calls.** Director/Deputy calls are relay-only and
   will not connect without TURN (`turnConfigured: false` in the ticket
   response). Ordinary calls on the same Wi-Fi work without it.
5. **iOS needs a Mac or EAS cloud build and an Apple developer account.** See
   decision 3.

## 3. New dependencies

| Package | Why |
| --- | --- |
| `socket.io-client` | Phase B signalling |
| `react-native-webrtc` | peer connection + microphone |
| `@config-plugins/react-native-webrtc` | permissions and native settings on prebuild |
| `react-native-incall-manager` *(decision 1)* | earpiece/speaker routing, proximity sensor, keep screen awake |

`app.json` additions: the webrtc config plugin, Android `RECORD_AUDIO` and
`MODIFY_AUDIO_SETTINGS`, iOS `NSMicrophoneUsageDescription` in Arabic
("يحتاج التطبيق إلى الميكروفون لإجراء المكالمات الصوتية.").

## 4. Architecture

```
AuthProvider
 └─ CallProvider            (new, src/context/CallContext.js)
     ├─ signaling.js        socket + tickets, events in/out
     ├─ callSession.js      one RTCPeerConnection per active call
     ├─ callMachine.js      pure state machine (unit tested)
     └─ IncomingCallScreen  shown from anywhere in the app
```

### 4.1 `src/services/signaling.js`

- `api.calls.signalingTicket()` → `POST /api/calls/signaling/ticket`.
- Connect with `io(`${API_BASE_URL}/calls`, { path: '/api/calls/socket',
  transports: ['websocket'], auth: (cb) => fetchTicket().then(cb) })`.
  **`auth` must be a function**: tickets are single use, so every reconnect
  needs a fresh one.
- A 404 `CALL_SIGNALING_DISABLED` from the ticket endpoint → stay in REST-only
  mode (today's behaviour) and retry on the next app foreground.
- Connect on login, disconnect on logout; on every (re)connect and on
  `AppState` → `active`, send `call:sync` and reconcile.
- Wraps emits in `emitWithAck` with a timeout and maps `{ ok: false, code }`
  to the existing `ApiError` so screens show the same Arabic messages as REST.

### 4.2 `src/services/callSession.js`

- `new RTCPeerConnection({ iceServers, iceTransportPolicy })`, where
  `iceTransportPolicy` comes from **the call view** (`relay` for leadership
  calls), never from a local guess.
- Audio only: `mediaDevices.getUserMedia({ audio: true, video: false })`.
- Caller creates the offer after `call:accepted`; callee answers on
  `signal:offer`; both trickle ICE through `signal:ice`; candidates that
  arrive before the remote description are queued.
- `mute()`, `setSpeaker()`, `close()`; `close()` always stops the microphone
  track, even on errors.
- If ICE fails (`iceConnectionState === 'failed'`) the client sends `call:end`
  and shows "تعذّر الاتصال". ICE restart is Phase F.

### 4.3 `src/context/callMachine.js` (pure)

States: `idle → outgoing → connecting → active → ended`, and
`idle → incoming → connecting → active → ended`.

Inputs are server events (`call:incoming`, `call:accepted`, `call:rejected`,
`call:cancelled`, `call:missed`, `call:busy`, `call:ended`), user actions
(start, accept, reject, cancel, hang up) and session events (connected,
failed). Rules:

- only one call at a time; a second `call:incoming` while busy is ignored
  (the server already answers busy);
- `call:accepted` on a device that did not accept = "answered elsewhere" → stop
  ringing, go `idle`;
- every terminal state shows a 2-second summary, then `idle`.

Being pure, it gets a node test (`npm run test:calls` in `mobile/`) like the
backend policy tests.

### 4.4 Screens

| Screen | Change |
| --- | --- |
| `IncomingCallScreen` (new) | Full-screen modal: name, avatar, accept / reject. Ringtone + vibration via the existing `services/sound.js`. |
| `CallActiveScreen` | Driven by `CallContext` instead of `route.params.contact`: real status, duration from `answeredAt`, mute, speaker, hang up. |
| `DirectoryScreen`, `CallsScreen` | Call button → `startCall(employeeId)`; shows busy / forbidden / rejected messages. |

### 4.5 Redaction in the UI

- The screens render **only** the server's call view. For `redacted: true` the
  name is the label (`المدير العام` / `وكيل المصلحة`), no avatar, no unit, and
  no call-back button anywhere (incoming screen, summary, history), because
  `canCallBack` is false.
- Nothing about the other party is cached beyond that view; no employee id is
  stored for a redacted call.
- Logs never include SDP, ICE candidates or the call view.

## 5. Delivery steps

| Step | Content | Done when |
| --- | --- | --- |
| C1 | Version spike: install webrtc + config plugin, one Android dev build that opens the mic | build installs and records audio on a real phone |
| C2 | `signaling.js`, `callMachine.js` + tests, `CallContext`, incoming screen, wiring — **no audio yet** | invite/ring/accept/reject/cancel/busy/missed work between two phones |
| C3 | `callSession.js`: WebRTC audio, mute, speaker | two phones on the same Wi-Fi talk to each other |
| C4 | Leadership calls over TURN, polish, Arabic strings, manual test sheet | Director → employee works over TURN, callee sees only the label |

## 6. Testing

- **Automated:** `callMachine` node tests (pure, no device).
- **Manual, two real Android phones** (emulators have poor microphone support):
  ordinary call; reject; cancel; no answer → missed notification; busy;
  employee → Director refused; Director → employee redacted (needs TURN);
  answer on one of two devices of the same user; turn Wi-Fi off mid-call
  (call ends after the 30 s grace).
- A checklist file `mobile/docs/calls-manual-test.md` comes with C4.

## 7. Risks

- **Expo 58 / RN 0.88 compatibility** of `react-native-webrtc` — unknown until C1.
- **No TURN** — leadership calls cannot be tested end-to-end.
- **Foreground only** — users may expect calls on a locked phone; that is
  Phase D and is a large piece of work on its own.
- **DTLS caveat** from `backend/docs/calls.md` still applies: media is
  encrypted peer to peer, but a compromised signalling server could
  man-in-the-middle until Phase F.

## 8. Decisions needed

1. **Audio routing:** add `react-native-incall-manager` (earpiece by default,
   speaker toggle, proximity sensor), or start with speaker only and no extra
   package?
2. **Who can test on two real Android phones** with the dev build?
3. **iOS in Phase C, or Android first?** iOS needs a Mac or EAS cloud builds
   and an Apple developer account.
4. **Ringtone:** reuse one of the existing sounds in `assets/sounds/`, or add a
   dedicated ringtone?

## 9. C2 — what was built and how to test it

Files: `src/calls/callMachine.js`, `src/services/signaling.js`,
`src/context/CallContext.js`, `src/components/calls/CallOverlay.js`,
`src/screens/main/IncomingCallScreen.js`, `CallActiveScreen.js` (now driven by
the context), Directory/Calls call buttons, `api.calls.signalingTicket()`.
The `CallActive` stack route is gone: the call is a full-screen overlay above
any screen. `AUDIO_ENABLED = false` in `CallContext.js` until C3.

Works in **Expo Go** (socket.io-client is plain JavaScript).

1. Backend: `CALL_SIGNALING_ENABLED=true` in `backend/.env`, `npm run dev`.
2. Mobile: `npm install`, then `npm run test:calls` (24 pure checks).
3. Two phones (or one phone + an emulator), two different employees.
4. Check:
   - A calls B → B rings (sound + vibration) on any screen; A sees «جارٍ الاتصال…»;
   - B answers → both show the timer; either hangs up → both see the summary;
   - B declines → A sees «رُفضت المكالمة»;
   - A cancels while ringing → B stops ringing;
   - nobody answers for 45 s → both see «لم يتم الرد», B gets a missed-call notification;
   - C calls A while A is in a call → C sees «الموظف في مكالمة أخرى», A sees nothing;
   - employee → Director: refused with the generic message;
   - Director → employee: the employee sees only «المدير العام», no photo, no unit;
   - same account on two phones: answer on one, the other stops ringing;
   - backend flag off: the call button shows «خدمة المكالمات المباشرة غير مفعّلة».
