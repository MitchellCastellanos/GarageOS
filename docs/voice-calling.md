# Browser calling (Twilio Voice) — design, gates, setup, first test call

Human-operated click-to-call from the Sales CRM using the existing corporate Twilio number (`TWILIO_FROM_NUMBER`, the 438 number). No predictive dialing, no auto-dial, no bulk calling, no recording. Every call needs a deliberate click.

## Flow
1. Seller opens `/platform/sales/calling` (capability `place_sales_calls`, held by every active seller; the existing FIELD + REMOTE seller included). The queue lists the seller's own assigned REMOTE prospects with `phoneEligibility = CALLABLE`, inside coverage, no email required, FIELD-held (Montréal) never listed.
2. **Call** → server action `startProspectCall(prospectId, idempotencyKey)`. The browser never supplies a number. The server checks, in order: kill switch → Twilio provisioned → DNCL registration recorded → live calling authorized → seller capability/ownership → REMOTE territory + coverage → DNC / number suppression / province hold / derived eligibility (recomputed live) → recipient-local calling hours → daily cap and cooldown → per-minute rate limit. It then creates a `CrmCallSession` whose open-call keys are **unique in the database** (one live call per seller, per prospect and per destination number), mints a single-purpose authorization (SHA-256 stored, 90 s) and a 5-minute Voice access token (outgoing only, identity `staff:<id>`).
3. The browser `Device.connect({ params: { sessionId, authToken } })` — nothing else.
4. Twilio calls the TwiML App Voice URL `POST /api/voice/outbound`. The route verifies `X-Twilio-Signature`, then **re-runs every gate on live data**, verifies the identity (`From = client:staff:<id>`), consumes the authorization atomically (replays get `<Hangup/>`), and answers `<Dial callerId=438… answerOnBridge timeLimit>` to the number stored in the session. Retries of the same `CallSid` receive the same answer.
5. `POST /api/voice/status` (TwiML App status callback + `<Number statusCallback>`) is signed, idempotent (`CrmCallEvent` unique `(CallSid, status, sequence)`), forward-only (terminal states are final) and frees the locks on end. `reconcileCall` and a stale-session reaper cover lost callbacks.
6. After the call the seller must record an outcome (`saveCallDisposition`): NO_ANSWER, VOICEMAIL, GATEKEEPER, CALL_BACK (+follow-up task), INTERESTED, NOT_INTERESTED, WRONG_NUMBER (suppresses the number), NOT_A_REPAIR_SHOP, DO_NOT_CALL (business DNC + number suppression, all channels). One CRM CALL activity per session. "Next" only selects the next prospect.

## Launch gates (Super Admin only, audited, closed by default) — `/platform/sales/settings/voice`
- **Enabled** (kill switch).
- **DNCL telemarketer registration** (reference + date) — required before any prospect call; clearing it revokes live-calling authorization.
- **Live calling authorized** (typed confirmation) — only after the legal items are closed.
- **Held provinces** (default BC, MB) — never dialled.
- **Test numbers** — numbers GarageOS controls. Test calls (Super Admin only) may go only to these and do not need the commercial gates.
- Limits: daily cap per seller, cooldown per prospect, max call length.
Nothing in code or tests flips a gate.

## Twilio setup (done by the ops workflow, no console work needed)
`Actions → Phone-first operations`: `twilio` (read-only inspection), `voice-provision` (apply) creates, **in the account that owns the corporate number**, one TwiML App (Voice URL `/api/voice/outbound`, status callback `/api/voice/status`) and one API key (secret stored AES-GCM-encrypted, never shown). It never edits the phone number, its SMS webhook, or any Messaging Service, and never touches tenant SMS provisioning. Outbound-only: the number needs no Voice URL.

## Your first authorized test call
1. Actions → *Phone-first operations* → stage `voice-provision`, apply = true (once).
2. Sign in as Super Admin → Sales → *Voice settings*: add your own mobile number under *Test numbers*, turn **Enabled** on. (Leave DNCL and *Live calling* off — test calls do not need them.)
3. Sales → *Calling* → *Test call* panel → choose your number → Call → allow the microphone → answer your phone; the caller ID is the 438 number.
4. Hang up. (A test call has no outcome form.)
