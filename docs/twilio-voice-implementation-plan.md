# Browser click-to-call — implementation-ready plan (dedicated GarageOS sales number)

Scope (V1): a REMOTE seller opens an assigned prospect, clicks **Call**, speaks through the computer, saves the outcome, continues to the next prospect. Human-initiated, one call at a time per seller. **No predictive dialing, no automatic bulk calling, no recording, no inbound, no voicemail drops.** Builds on PR #171 (`evaluatePhoneEligibility`, `callingWindow`, `CrmPhoneSuppression`). Background and rationale: `docs/twilio-voice-sales-softphone-audit.md` §6–§8 and `docs/phone-first-calling-policy.md`.

## Blockers before implementation starts (owner)
1. PR #171 merged and deployed; derived phone columns refreshed (`scripts/phone-first-refresh.ts`).
2. **No new seller is needed.** The existing seller (FIELD mode) already has Field sales **and** Remote sales; the ~10,133 national prospects it owns stay where they are and form its calling queue. (Capability model: `docs/seller-capabilities.md`.)
3. DNCL telemarketer registration done; counsel has closed the open legal rows (BC/MB stay held until then).
4. Twilio Console (cannot be done by code here): create subaccount "GarageOS Sales Voice"; buy a Canadian **Voice-capable local number** in it; create an **API Key** (standard) in that subaccount; create a **TwiML App** with Voice URL `POST <prod>/api/voice/outbound` and Status Callback `POST <prod>/api/voice/status`; Voice → Geo Permissions: Canada only; usage alert + daily/monthly spend cap. The existing 438 SMS number is not used (shared tenant infrastructure; capability unverified).
5. Env (names only, Production only): `TWILIO_VOICE_ACCOUNT_SID` (the subaccount), `TWILIO_VOICE_API_KEY_SID`, `TWILIO_VOICE_API_KEY_SECRET`, `TWILIO_VOICE_TWIML_APP_SID`, `TWILIO_VOICE_CALLER_ID`, `TWILIO_VOICE_AUTH_TOKEN` (subaccount token, only to validate webhook signatures), `PHONE_HELD_PROVINCES` (optional). Existing `PROVIDER_SIDE_EFFECTS=enabled` still gates anything that costs money.

## Isolation from tenant SMS
Separate subaccount, number, API key, TwiML App and routes under `/api/voice/*`. No Voice URL is ever set on a tenant number; `/api/webhooks/twilio/{inbound,status}` are not modified. Voice credentials live in `TWILIO_VOICE_*` only; `src/lib/communications/twilio.ts` is reused for the signature validator but takes the Voice token explicitly.

## PR 2 — Voice backend (flag off by default)
Migration (additive):
```
enum CrmCallState { PENDING RINGING IN_PROGRESS COMPLETED BUSY NO_ANSWER FAILED CANCELED ABANDONED }
model CrmCallSession {
  id String @id @default(cuid())
  idempotencyKey String @unique              // client-generated per click
  prospectId → CrmProspect; contactId? → CrmContact
  staffId → PlatformSalesStaff; userId
  destinationE164 String; destinationSource String   // "PROSPECT_PHONE" | "CONTACT_PHONE"
  callerIdE164 String
  state CrmCallState @default(PENDING)
  parentCallSid String? @unique; childCallSid String? @unique
  requestedAt, ringingAt?, answeredAt?, endedAt?, durationSec Int?, finalStatus String?
  dispositionCode String?; activityId String? @unique → CrmActivity
  eligibilitySnapshot Json; localTimeAtDial String
  openProspectKey String? @unique            // = prospectId while open, NULL when closed  → two reps can never hold the same shop
  openStaffKey String? @unique               // = staffId while open                      → one live call per seller
}
model CrmCallEvent { id; sessionId → CrmCallSession; callSid; status; sequence Int; receivedAt; payload Json; @@unique([callSid, status, sequence]) }
model CrmVoiceSettings { id "default"; enabled Boolean @default(false); callerIdE164?; dailyCallCapPerSeller Int @default(150); cooldownMinutes Int @default(240); maxCallSeconds Int @default(1800) }
```
Files:
- `src/lib/voice/config.ts` — reads `TWILIO_VOICE_*`, fail-closed when unset or `CrmVoiceSettings.enabled = false` or `PROVIDER_SIDE_EFFECTS != enabled`.
- `src/domain/voice/state.ts` — pure transition table (PENDING→RINGING→IN_PROGRESS→terminal; terminal states never regress; late/out-of-order events ignored).
- `src/lib/voice/session.ts` — `startCallSession(actor, {prospectId, contactId?, idempotencyKey})` in one transaction: `requireCrmActor("place_sales_calls")` (new capability: REMOTE REP/MANAGER and Super Admin with a REMOTE profile); load the prospect via `requireScopedProspect`; refuse unless the actor owns the prospect (or has manager scope), the prospect is REMOTE-held (`territoryState = NATIONAL`, outside FIELD-held territory) and inside the actor's coverage; freshly run `refreshPhoneEligibility({prospectIds})` + `evaluatePhoneEligibility` (status must be CALLABLE) and `callingWindow(province, now).open`; check cooldown, daily cap, kill switch; insert the session (unique keys reject a second open call by the seller or on the prospect; same idempotency key returns the existing session). Destination = the E.164 resolved server-side from the CRM row, never from the browser.
- `src/app/api/voice/token/route.ts` — POST, session auth, issues a 10-minute AccessToken (`VoiceGrant { outgoingApplicationSid, incomingAllow: false }`, identity `staff:<staffId>`), signed with the API key; `Cache-Control: no-store`; per-user rate limit.
- `src/app/api/voice/outbound/route.ts` — TwiML App Voice URL. Validates `X-Twilio-Signature` (exact public URL + form body, subaccount token). Reads only `sessionId` (custom param) and `CallSid`; loads the session; re-runs eligibility; if anything is no longer valid, returns `<Say>` + `<Hangup/>` and marks the session ABANDONED. Otherwise `<Dial callerId=CALLER_ID answerOnBridge="true" timeLimit="1800"><Number statusCallback=".../api/voice/status" statusCallbackEvent="initiated ringing answered completed">E164</Number></Dial>`. Stores `parentCallSid`.
- `src/app/api/voice/status/route.ts` — validates signature; `INSERT … ON CONFLICT DO NOTHING` into `CrmCallEvent`; applies the state machine; stores `childCallSid`, timestamps, duration; closes `openProspectKey/openStaffKey` on terminal states; always 200 for valid signatures (retries are idempotent).
- `src/actions/sales-calls.ts` — `finishCall(sessionId, disposition)`: writes `CrmActivity` (type CALL, outcome mapped from disposition, `idempotencyKey = sessionId`), `touchProspect`, optional `CrmTask` (CALL/FOLLOW_UP) and `CrmMeeting`, DNC (`applyDoNotContact` → phone suppression), wrong number (`CrmPhoneSuppression` NUMBER, reason WRONG_NUMBER), "not a repair shop" (existing repair-fit human decision), consent capture. Everything in one transaction with `CrmAuditEvent` rows.
- Reaper in `src/app/api/webhooks/cron/sales/route.ts`: sessions open > 35 min are reconciled against the Call resource (REST read) and closed.
- Tests: signature rejection; destination never taken from params; forged `sessionId` of another seller; DNC/held-province/FIELD/unverified-fit blocked at webhook time even if allowed at click time; duplicate click; two sellers on one shop (DB unique); status replay and out-of-order; cooldown/caps; kill switch; reaper. Run with Twilio mocked; no live calls.

## PR 3 — Softphone and calling queue
- Dependency `@twilio/voice-sdk` (2.x). Header `Permissions-Policy: microphone=(self)` for `/platform/sales/:path*` in `next.config.ts` (no CSP exists today; if one is added later it must allow Twilio's signaling/media endpoints).
- `src/app/(site)/platform/sales/calling/page.tsx` — queue of the seller's own CALLABLE prospects (`phoneEligibility = CALLABLE`, assigned to the seller, REMOTE, not in cooldown, local window open now), ordered: due follow-up tasks first, then window-open provinces, then never-called, then oldest attempt. A prospect whose window is closed shows "opens at HH:MM local" and is skipped, never hidden or discarded.
- Language: derived at queue time (QC → FR, NB bilingual, else EN; contact override; seller `leadLanguages` first). `preferredLanguage` is UNKNOWN on every current record, so the card shows the derived language as a suggestion only.
- `src/components/sales-calling/{Softphone,CallCard,DispositionPanel,AudioDevicePicker,useVoiceDevice}.tsx` — `Device` created on first Call click (not on page load) with a fresh token; `tokenWillExpire` refresh; microphone permission pre-check with a clear error; input-device selector persisted per browser; mute, hang-up, DTMF; `beforeunload` guard while a call is live; `device.destroy()` on unmount. After hang-up the **disposition panel is mandatory** before "Next".
- Dispositions → effect: NO_ANSWER, VOICEMAIL (rep leaves a live spoken message; no recording), GATEKEEPER, CALL_BACK (creates CALL task at the chosen date/time), INTERESTED (task or meeting + opportunity stage via existing `StageControl` logic), NOT_INTERESTED, WRONG_NUMBER (suppress number), NOT_A_REPAIR_SHOP (human fit exclusion), DO_NOT_CALL (business DNC, all channels), EMAIL_CONSENT (contact + decision-maker flag + `CrmSendingBasis EXPRESS_CONSENT` with exact scope text read, time, rep, session id). "Save & next" advances; there is no auto-advance dial.
- Opening script card shows the CRTC disclosure: seller name, GarageOS, purpose, callback number.
- i18n EN/FR in `src/lib/admin-locale/sales-calling.ts`. Tests: render + authz (like `field-planner-locale-authz`), disposition → activity/task/meeting/basis/DNC integration on the scratch DB.

## PR 4 — Pilot
1 seller, 2 low-risk provinces (e.g., AB, SK), ≤ 25 calls/day, weekday daytime only, owner-attended. Go criteria: 100 % of calls have a session and Call SID; 0 calls to DNC/held/FIELD; status callbacks reconciled; spend within the alert; DNC round-trip proven (say "do not call" → business and number suppressed immediately, queue refuses). Then widen seller count and provinces.

## Fraud, spend and safety
Kill switch default off; geo permissions Canada only; Twilio usage alert + spend cap; token endpoint refuses non-REMOTE/inactive staff; per-seller daily cap and per-prospect cooldown; `timeLimit` on every Dial; sessions are the only way to dial and carry the eligibility snapshot as evidence; all Voice code paths additionally require `PROVIDER_SIDE_EFFECTS=enabled`.

## Cost (unchanged assumptions)
≈ US$0.018/billed minute (PSTN ≈ 0.014 US/Canada route + browser client leg ≈ 0.004; Canada page not read — verify) → 100 / 500 / 1,000 calls at 2.5 billed min ≈ US$4.50 / 22.50 / 45; plus number rental (≈ US$1–2/month, unverified). No recording, no AMD, no Voice Insights in V1.
