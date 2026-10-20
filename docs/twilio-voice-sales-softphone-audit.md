# Twilio Voice sales softphone + national B2B calling — audit and implementation plan

> **Update 2026-10-20:** production Neon is now connected; real counts, the legal rules, the defects and the first fix are in `docs/phone-first-calling-policy.md`, which supersedes the "unknown" figures here.

Status: **read-only audit, 2026-10-20.** Nothing was implemented, migrated, purchased, configured, called or deployed. Source: `main` at `4244054` (PR #170).

## 0. What could and could not be verified

| Item | Result | Missing access |
|---|---|---|
| Code audit (Audit 1) | **Done** from the repo. | — |
| Production database counts (Audit 2) | **NOT PERFORMED. No numbers are reported.** | The production DB is Neon project `autumn-art-59701921` (`docs/operations-runbook.md`). This session has no `DATABASE_URL` and no Neon tool. The only DB tool connected is a Supabase project ("Garage OS", ref `saccjhin…`) that has **no `garageos` schema and no application tables** (storage/auth only), so it is not the CRM database. A read-only role + connection string (e.g. the existing `backup_ro` role) or someone running Appendix A is needed. |
| Twilio number capabilities (Audit 1.8) | **NOT VERIFIED.** | The Twilio tool in this session is documentation search only; no account API. Vercel Production holds `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (names only were read; no value was decrypted or printed). Owner must read the number's capabilities in Console, or provide a read-only API key (see §12). |
| CRTC / Twilio pages | Direct page fetches failed (DNS `ENOTFOUND` for crtc.gc.ca, lnnte-dncl.gc.ca, twilio.com). Compliance and pricing below come from search-result excerpts of official pages and the Twilio docs search tool. Every item is tagged **[verified-excerpt]**, **[unverified]** or **[legal review]**. |

## 1. Executive recommendation: **CONDITIONAL GO**

Build it; do not turn it on until three gates pass:

1. **Data gate.** Run Appendix A on production and learn the real call-ready count. The code shows today's pipeline *structurally cannot* have ingested phone-only REMOTE shops (§3), so the callable pool may be small until Phase A's import change plus a re-read of the source release (which this audit was told not to do).
2. **Compliance gate.** GarageOS registered with the National DNCL operator as a telemarketer (required even for exempt B2B calls); internal DNC list live; counsel sign-off on the mobile/sole-proprietor rule (§4).
3. **Twilio gate.** A voice-capable Canadian number dedicated to sales (not the tenant SMS number), API key, TwiML App, geo-permissions limited to CA, spend alert (§12).

The engineering is small and mostly reuse. The unknown is the size of the callable pool, not the softphone.

## 2. Existing code and infrastructure (Audit 1)

| # | Area | Where |
|---|---|---|
| 1 | CRM list/detail | `src/app/(site)/platform/sales/prospects/page.tsx`, `prospects/[id]/page.tsx` (phone shown at line ~89), queries `src/lib/sales-crm/queries.ts` (phone-digit search), components `src/components/sales-crm/*` (`ActivityComposer`, `ContactsPanel`, `TaskForm`, `OpportunityPanel`, `StageControl`) |
| 2 | Models | `prisma/schema.prisma`: `CrmProspect` (2600; `phone`, `phoneDigits` indexed, `doNotContact`, `territoryState`, `repairFit`, `assignedStaffId`, `preferredLanguage`), `CrmContact` (2701; `phone`, `doNotContact`, `isDecisionMaker`), `CrmActivity` (2839; type `CALL`, outcome enum, `idempotencyKey` unique per author), `CrmTask` (2870; type `CALL`), `CrmOpportunity` (one open per prospect), `CrmMeeting`, `CrmAuditEvent` |
| 3 | Authorization | `src/domain/sales-crm/access.ts` (capabilities; REP/MANAGER/SUPER_ADMIN; `assignedScopeWhere`), `src/lib/sales-crm/access.ts` (`requireCrmActor`, rejects demo impersonation; tenant roles never grant sales access) |
| 4 | Territory | `CrmTerritory` (3687), `SalesMode`, `PlatformSalesStaff.salesMode/coverageTerritoryKeys`; `src/domain/sales-crm/territory.ts` (`classifyTerritory` → LOCAL/NATIONAL/UNRESOLVED, `requiredMode`, `acquisitionState`, `evaluateColdEmail`); Greater Montréal seeded FIELD in migration `20261010090000`; FIELD_PRIORITY windows + `remoteReleasedAt` on the prospect |
| 5 | Lead Radar | staging `src/lib/lead-radar/staging.ts`, screen `src/domain/lead-radar/commercial-screen.ts`, import `src/lib/lead-radar/import-service.ts` (single path `applyImportBatch`), automation/assignment `src/lib/lead-radar/automation.ts`, engine `src/lib/sales-crm/assignment.ts`, source parse `src/domain/lead-radar/record.ts`; models `CrmDiscoveryCandidate/Rejection/Run`, `CrmOutreachEligibility`, `CrmDiscoveredContact`, `CrmCaslAssessment` |
| 6 | DNC / suppression | `CrmProspect.doNotContact(+At)` and `CrmContact.doNotContact` (set/lift in `src/actions/sales-prospects.ts` ~106–126; lifting clears all contacts). `CrmEmailSuppression` is **email-only** (`src/lib/sales-comms/suppression.ts`). Tenant `CommunicationSuppression` is per-shop SMS/email, unrelated. **There is no phone-level suppression.** |
| 7 | Call logging | `logActivity` in `src/actions/sales-activities.ts`: writes `CrmActivity` type CALL + outcome (`CONNECTED/VOICEMAIL/NO_ANSWER/WRONG_NUMBER/INTERESTED/NOT_INTERESTED/FOLLOW_UP_NEEDED`), touches prospect, recomputes opportunity scores. **It does not check DNC, archived status or territory mode** (`createTask` does check DNC/archived). |
| 8 | Twilio | npm `twilio ^6.1.0`; `src/lib/communications/twilio.ts` (root client, subaccount clients, `validateTwilioWebhook`, `twilioWebhookUrl`, write clients gated by `PROVIDER_SIDE_EFFECTS=enabled` via `src/lib/provider-policy.ts`); webhooks `src/app/api/webhooks/twilio/inbound` and `/status` (SMS only); per-shop numbers/subaccounts `src/lib/communications/sms-numbers.ts` (`ShopSmsNumber`); shared SMS number env `TWILIO_FROM_NUMBER` (a 438 number per `docs/launch-readiness.md`; its end-to-end path is *not validated*). **No Voice code, no API key, no TwiML App, no access-token code exists.** |
| 9 | Settings/flags | `CrmCommsSettings` (singleton, email kill switches, `legalName`, `mailingAddress`, `contactPhone`, send window hours); `PROVIDER_SIDE_EFFECTS`; `CRON_SECRET`, `LEAD_RADAR_CRON_SECRET` |
| 10 | Vercel | Node serverless; `maxDuration` ≤ 60 s on existing routes; `proxy.ts` matches only `/` (booking-domain rewrite) so API routes are unaffected; `next.config.ts` sets **no CSP and no Permissions-Policy**; `vercel.json` has 5 crons. Production env var *names* present: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `PROVIDER_SIDE_EFFECTS`, `CRON_SECRET`, `LEAD_RADAR_CRON_SECRET`, `DATABASE_URL(_POOLED)`. Absent: any Twilio API key, TwiML App SID, voice caller-ID variable. |

**Reusable:** auth/scope helpers, territory engine, DNC flags, activity/task/meeting entities, audit writer (`writeCrmAudit`), webhook signature validator and form reader, provider-side-effect gate, prospect detail/list UI, i18n pattern (`src/lib/admin-locale/*`), phone-digit dedupe (`phoneDigits`, `isTollFreeDigits`).

**Missing:** phone normalization/validation (current `phoneDigits` accepts any ≥10 digits; `toE164` in `src/lib/phone.ts` accepts anything beginning `+`), phone-classification evidence, phone-level suppression, telephone eligibility function, call-session store, token/voice/status routes, softphone UI, calling queue, calling-hours logic, spend/rate controls.

## 3. Import/pipeline defects affecting phone data (Audit 2 trace)

Confirmed from code (not from data):

1. **REMOTE shops without an email are rejected at the door.** `commercial-screen.ts:46`: a NATIONAL candidate with no valid email gets `REMOTE_NO_USABLE_EMAIL` and no lane. `staging.ts:124–135` then records only a `CrmDiscoveryRejection` tombstone (source id, reasons, fingerprint, province — **no phone, no name**) and never stages it; `import-service.ts:73` repeats the same screen for already-staged rows (`importState SKIPPED`, `SCREEN_REMOTE_NO_USABLE_EMAIL`). A phone-only national repair shop is therefore **never created as a `CrmProspect` and its phone is not retained anywhere** (the tombstone schema deliberately holds no phone). Recovery requires re-reading the source release — explicitly out of scope for this audit.
2. **Assignment skips them even if they exist.** `automation.ts:198` + `assignment.ts:77/86` (`skipRemoteNoEmail: true`, `loadRemoteNoEmailWhere` in `src/lib/lead-radar/remote-email.ts`): REMOTE prospects with no usable email are never auto-assigned. Any such prospect already in the CRM (manual/CSV import, older data) sits unassigned.
3. **Only one phone survives.** `record.ts:78 pickPhone` keeps the first syntactically valid of up to 6 source phones; others are dropped.
4. **Weak validation.** `cleanPhone` regex + `phoneDigits(≥10 digits)` accept non-NANP and malformed numbers; nothing checks NPA/NXX, toll-free (`isTollFreeDigits` exists only in the dedupe path), or Canadian area code.
5. **No line-type or provenance field.** The source (Overture place phone) is a business listing, but `CrmProspect` stores neither source nor classification of the phone.
6. **Other gates that apply to callers too (correct, keep):** `repairFit = VERIFIED_REPAIR` (HUMAN_REVIEW/EXCLUDED are never newly assigned), territory `UNRESOLVED` is never kept, ICP exclusions (chains/dealers), per-seller caps `maxActiveLeads/maxActiveRemoteLeads`, language compatibility `leadLanguages`.

Fix (Phase A): relax the REMOTE lane rule to "usable email **or** plausible Canadian phone", keep the email-send gates unchanged, store the phone and its provenance, and make the assignment email-skip apply only to email campaigns. Rejected tombstones should start keeping `phoneDigits` hash-free count only if privacy review allows; otherwise the next scheduled release read re-screens them naturally (the screen is designed to re-open on later releases).

## 4. Production counts (Audit 2) — **not obtained**

Appendix A contains a read-only SQL pack that answers every requested breakdown, with the A/B/C/D split defined precisely. No figure in this document is a production figure. The final-report fields are:

| Required figure | Value |
|---|---|
| REMOTE prospects with usable phone | **UNKNOWN — needs prod read access** |
| Confidently B2B call-eligible (bucket A) | **UNKNOWN; and today provably ≤ the count of listed-phone landline-class numbers, because no line-type evidence is stored (so A is empty by the "do not silently classify" rule until Phase A lookups run)** |
| Needs classification (B) / enrichment (C) | **UNKNOWN** |
| Phone data lost by pipeline | Mechanism confirmed (§3.1); volume unknown. Count of tombstones with `REMOTE_NO_USABLE_EMAIL` shows the *number* of shops lost (Appendix A, Q14) but not their phones. |

Bucket definitions used in the SQL: **A** call-ready = active, not merged, NATIONAL (or FIELD-released), VERIFIED_REPAIR, not DNC, valid Canadian NANP number, number sourced from a business listing, and line type confirmed non-mobile; **B** valid number, but line type/business status unclassified or mobile/VoIP; **C** no phone (or invalid) but website/address present; **D** excluded: DNC, archived/merged, FIELD-held, UNRESOLVED territory, EXCLUDED/HUMAN_REVIEW fit, shared/toll-free-only numbers.

## 5. Canadian telemarketing compliance (Audit 3)

Tags: **[V]** seen in an official-page excerpt via search; **[U]** from general knowledge, not seen this session; **[L]** counsel.

- **B2B exemption from National DNCL screening [V]** — CRTC guidance: business-to-business calls are exempt from Part II (National DNCL Rules) but remain subject to the Telemarketing Rules and ADAD Rules. Source: https://crtc.gc.ca/eng/phone/telemarketing/biz.htm, https://crtc.gc.ca/eng/archive/2009/2009-282.htm.
- **Registration still mandatory [V]** — "Telemarketers must register with the National DNCL before making unsolicited calls, even if the calls being made are exempt." https://crtc.gc.ca/eng/phone/telemarketing/tobligations/rules-regles.htm (also https://crtc.gc.ca/eng/phone/telemarketing/exempt.htm). Registration fees/ subscription for exempt callers: **[U]** confirm on lnnte-dncl.gc.ca.
- **Internal DNC list [V]** — maintain it; add a number within 14 days of a request; keep 3 years (excerpt says "3 years and 14 days"). https://crtc.gc.ca/eng/phone/telemarketing/reg.htm. Must also provide on request the policy in writing **[U]**. Design below makes the add *immediate*.
- **Identification [V]** — identify yourself and the purpose at the start of the call. Number display / callback details on request: **[U]**/**[L]**; design always displays the corporate number.
- **Calling hours — sources conflict.** A CRTC exemption-page excerpt says weekdays 9:00–21:30 and weekends 10:00–18:00 **[V-excerpt]**; the commonly cited Telemarketing Rules text is 9:30–21:30 weekdays and 9:30–17:00 weekends **[U]**. **Design rule: weekdays only, recipient-local 10:00–17:00 (inside every reading), enforced server-side.** Verify before widening.
- **Mobile numbers, sole proprietors, mixed numbers [L]** — the exemption is for calls to a *business consumer*; a personal mobile or home-office line of a sole proprietor is the risky case. Design: mobile/VoIP/unknown → bucket B (human review or not callable), never silently business.
- **Automatic dialing / prerecorded [V]** — ADAD Rules govern automatic dialers delivering recorded messages. V1: one-click, one call per rep, human speaks first, no auto-advance dialing, no predictive, no recorded messages. Predictive/abandoned-call specifics: **[L]** if ever added.
- **Recording and privacy [L]** — off by default (§6). If added: announce at call start, purpose limitation, retention schedule; Quebec Law 25 / PIPEDA apply to stored voice and call metadata. Twilio recording price noted in §13 for sizing only.
- **Call-log evidence/retention [L]** — keep call sessions ≥ 3 years + 14 days to match internal-DNC evidence; recommend 5 years; no recording means logs are the evidence.
- **Email consent captured by phone (CASL)** — oral express consent is possible but GarageOS bears the burden of proof. Reuse `CrmSendingBasis` (`EXPRESS_CONSENT`, `evidence`, `evidenceType`, `supportingFacts`, `sourceUrl`). Require: contact name/role, exact address, the scope read aloud (product emails from GarageOS), rep id, timestamp, call session id, script version, and send a confirmation email (no marketing) that the contact can confirm — recommended **[L]**.
- **Provincial [L/U]** — BC and Manitoba have telemarketer licensing aimed at consumer sales (https://www.consumerprotectionbc.ca/get-keep-licence/telemarketing/); business-to-business applicability needs counsel. Quebec: Consumer Protection Act is consumer-oriented; French-language service expectation reinforces `preferredLanguage`. Alberta/Saskatchewan/Nova Scotia: nothing confirmed. **Counsel should confirm no provincial registration applies before dialing each province; the design includes a per-province enable switch.**

### Telephone eligibility decision (independent of CASL)

Pure function `evaluatePhoneEligibility(facts, now) → { decision: CALLABLE | REVIEW | BLOCKED, reasons[] }`, new file `src/domain/sales-crm/phone-eligibility.ts`, mirroring `evaluateColdEmail`. BLOCKED if any: prospect archived/merged; `doNotContact`; contact DNC (if calling a contact); active `CrmPhoneSuppression` for the number *or* the prospect/business identity (see below); territory state not NATIONAL/released; required mode ≠ REMOTE or caller not REMOTE; repairFit ≠ VERIFIED_REPAIR; invalid/non-Canadian/toll-free-only number; province calling not enabled; outside calling window (recipient time derived from province/postal → IANA zone); weekend; already called ≥ N times in D days; open call by another rep; the DNC-propagation rule. REVIEW: mobile/VoIP/unknown line type, shared number across businesses, sole-proprietor signal. **CASL status is not an input**: INSUFFICIENT/BLOCKED email never blocks a call. **Opposite direction:** a verbal "do not call me" or `doNotContact` applies to all channels for that business and contact (identity-level, per the requirement); an email unsubscribe alone does *not* block calls (different channel) unless the person said so — captured as a distinct disposition.

## 6. Twilio Voice architecture (Audit 4) — smallest reliable design

Flow: Rep clicks **Call** → server action creates a `CrmCallSession` (state `PENDING`, unique idempotency key, locks the prospect) → server returns session id + short-lived token → browser `Device.connect({ params: { sessionId } })` → Twilio POSTs the **TwiML App Voice URL** `/api/voice/outbound` → server validates signature, loads the session, **re-runs eligibility, ignores any number from the browser**, replies `<Dial callerId=CORP answerOnBridge="true" timeLimit=…><Number statusCallback=… statusCallbackEvent="initiated ringing answered completed">E164_FROM_DB</Number></Dial>`.

- **SDK/token:** `@twilio/voice-sdk` 2.x in the browser (new dependency); `twilio` (already present) `AccessToken` + `VoiceGrant({ outgoingApplicationSid, incomingAllow:false })` signed with a dedicated **API Key** (not the auth token). Token TTL ≤ 10 min, refreshed on `tokenWillExpire`; identity = `staff:<staffId>`. Source: Twilio Voice SDK AccessToken docs (https://www.twilio.com/docs/iam/access-tokens, https://www.twilio.com/docs/voice/sdks).
- **Destination resolution:** the session stores `{prospectId, contactId?, destinationE164, destinationSource}` chosen server-side from `CrmProspect.phone` / `CrmContact.phone`. The browser sends only `sessionId` (custom param); the voice webhook reads the number from the DB row, never from params.
- **Caller ID:** `<Dial callerId>` must be a Twilio-owned or verified number (Twilio `<Dial>` docs). Use a **new dedicated sales number**, env `TWILIO_VOICE_CALLER_ID`; do not reuse the tenant SMS shared number (`TWILIO_FROM_NUMBER`) and do not touch any SMS webhook on it.
- **Webhooks:** new `src/app/api/voice/outbound/route.ts`, `src/app/api/voice/status/route.ts`, `src/app/api/voice/token/route.ts`; reuse `readTwilioForm` and `validateTwilioWebhook`, generalised to accept a voice path. The voice webhooks are signed by the **account that owns the TwiML App** (root `TWILIO_ACCOUNT_SID` token), so the existing "known accounts only" resolver already validates. Keep voice paths separate from `/api/webhooks/twilio/inbound|status` to avoid any SMS interference.
- **Persistence/idempotency:** `CrmCallEvent` unique on `(providerCallSid, status, sequenceNumber|timestamp)`; webhook handlers are `INSERT … ON CONFLICT DO NOTHING` then state-machine transition; stale/out-of-order events cannot regress state. Track both the parent (client) leg SID and child (PSTN) leg SID.
- **Terminal states:** `completed`, `busy`, `no-answer`, `failed`, `canceled` → map to a suggested disposition; rep still saves the structured disposition. A reaper (extend `src/app/api/webhooks/cron/sales/route.ts`) closes sessions stuck > 15 min after reconciling with the Call resource via REST.
- **Refresh/navigation:** `beforeunload` guard while a call is live; `Device.destroy()` on unmount; server-side reaper covers tab crashes; on reload the page reads the open session and offers "Save outcome".
- **Mic/audio:** `navigator.mediaDevices.getUserMedia` pre-check, `device.audio.availableInputDevices`/`setInputDevice` selector, persisted per browser; Permissions-Policy `microphone=(self)` only on `/platform/sales/*`.
- **Concurrency/duplicates:** (a) one open session per rep (partial unique index); (b) one open session per prospect (partial unique index on `prospectId WHERE state IN open`), so two reps cannot dial the same shop; (c) idempotency key per click; (d) per-prospect cooldown (e.g. 1 attempt / 4 business hours); (e) per-rep daily cap.
- **Fraud/spend:** Voice **Geographic Permissions** allow only CA (and US if desired) [U: confirm console path]; Twilio usage alert + daily budget; app-side global kill switch `CrmVoiceSettings.enabled` (fail-closed) mirroring `CrmCommsSettings`; per-rep rate limit; token endpoint refuses non-REMOTE, inactive or no-capability staff; `PROVIDER_SIDE_EFFECTS` gate reused.
- **Pricing/legs [V-excerpt]:** a browser→PSTN call has a Client/SDK leg (~US$0.004/min per Twilio's help article on Client/SDK legs) plus the PSTN leg (US pricing page shows US & Canada outbound ~US$0.014/min). **The Canada page itself was not read; verify.** Billing rounds per minute.
- **Future inbound:** keep `incomingAllow:false`; later point the sales number's Voice URL at a TwiML that `<Dial><Client>` or voicemail, with its own route. No V1 work.
- **Recording:** none. `record` attribute never set; Twilio recording (not enabled) would be an explicit later phase with consent announcement.

## 7. CRM UX (Audit 5)

Route `/platform/sales/calling` (REMOTE reps; managers read-only team view). Queue = server-computed list of `CALLABLE` prospects assigned to the rep, ordered by local-time window open → follow-up due → last attempt oldest. Card: name, province/city, local time and "window closes in …", language badge (FR/EN, reps with matching `leadLanguages` first), phone with source/line-type chip, last 3 activities, open tasks, notes, contacts with decision-maker flag. Buttons: **Call**, **Skip** (reason), **Wrong number** (writes phone suppression), **Do not call**. During call: timer, mute, hang-up, DTMF, audio device. After hangup: mandatory disposition panel.

Dispositions (maps onto existing `CrmActivityOutcome` + new fine-grained code in `metadata`): NO_ANSWER, VOICEMAIL_LEFT (script only; no recorded drop), GATEKEEPER_BLOCKED, WRONG_NUMBER (bad number → suppress), NOT_A_REPAIR_SHOP (→ repairFit HUMAN exclusion via existing service), NOT_INTERESTED, CALL_BACK_LATER (creates `CrmTask` type CALL), INTERESTED (task or `CrmMeeting` via existing booking), DO_NOT_CALL (prospect + contact DNC + phone suppression, all channels), EMAIL_CONSENT_GIVEN (creates contact + `CrmSendingBasis` EXPRESS_CONSENT with scope text + session id). The activity is written from the server transaction that closes the session (`CrmActivity.idempotencyKey = callSessionId`), reusing `touchProspect` and `recomputeOpportunityScores`. "Next" advances to the next callable prospect; there is no auto-dial.

## 8. Data model (Audit 5) — Prisma additions (no duplication of CRM entities)

```
enum CrmPhoneLineType   { LANDLINE FIXED_VOIP MOBILE NON_FIXED_VOIP TOLL_FREE UNKNOWN }
enum CrmPhoneBusinessBasis { LISTED_BUSINESS_SOURCE VERIFIED_BY_LOOKUP VERIFIED_BY_CALL SOLE_PROPRIETOR_SUSPECTED UNKNOWN }
enum CrmCallState       { PENDING RINGING IN_PROGRESS COMPLETED BUSY NO_ANSWER FAILED CANCELED ABANDONED }
model CrmProspectPhone  { id, prospectId→CrmProspect, contactId?, e164 @unique-with prospectId, source (OVERTURE|WEBSITE|MANUAL|CALL), sourceRef, lineType, lineTypeSource (LOOKUP|MANUAL), lookupAt, carrier?, businessBasis, status (ACTIVE|INVALID|DISCONNECTED|SUPPRESSED), createdAt }   // multi-phone; replaces single-phone limit without altering CrmProspect.phone
model CrmPhoneSuppression { id, e164?, prospectId?, contactId?, scope (NUMBER|BUSINESS|CONTACT), reason (DO_NOT_CALL|WRONG_NUMBER|INVALID|DISCONNECTED|MANUAL), source, callSessionId?, createdByUserId, createdAt, liftedAt?, liftedByUserId?, liftNote?  @@index([e164, liftedAt]) }  // append-only, like CrmEmailSuppression
model CrmCallSession    { id, idempotencyKey @unique, prospectId, contactId?, phoneId→CrmProspectPhone, destinationE164, callerIdE164, staffId, userId, state, parentCallSid? @unique, childCallSid? @unique, requestedAt, ringingAt?, answeredAt?, endedAt?, durationSec?, billableSec?, finalStatus?, dispositionCode?, activityId? @unique→CrmActivity, eligibilitySnapshot Json, localTimeAtDial, openKey String? @unique (prospectId when open, null when closed), repOpenKey String? @unique }
model CrmCallEvent      { id, sessionId, callSid, status, sequence, rawHash, receivedAt, payload Json(minimal)  @@unique([callSid, status, sequence]) }
model CrmVoiceSettings  { id "default", enabled false, callerIdE164, enabledProvinces String[], windowStartHour 10, windowEndHour 17, maxDailyPerRep, cooldownHours, minLookupFreshnessDays }
```
Unique `openKey`/`repOpenKey` columns (set while a session is open, cleared on close) give the "two reps cannot call the same shop" and "one live call per rep" guarantees in the database. Audit events reuse `CrmAuditEvent` (actions `CALL_STARTED`, `CALL_ENDED`, `CALL_DNC`, `PHONE_SUPPRESSED`, `PHONE_CLASSIFIED`). One additive migration; existing columns untouched.

## 9. Phased plan (Audit 6)

**PR 1 — Phase A: data readiness + eligibility (no Twilio, no UI).**
- Modify: `commercial-screen.ts` (REMOTE lane accepts valid-phone), `staging.ts`, `import-service.ts`, `lead-radar/automation.ts` + `sales-crm/assignment.ts` (email-skip limited to email campaigns), `record.ts` (`pickPhones` keep all, E.164 NANP validation), `src/lib/phone.ts` (strict `normalizeCanadianPhone`), `sales-activities.ts` (CALL logging respects DNC/archived/mode).
- Create: `src/domain/sales-crm/phone.ts`, `phone-eligibility.ts`, `calling-hours.ts` (province/postal → IANA zone), `src/lib/sales-crm/phone-classify.ts` (Twilio Lookup v2 line-type, budgeted, admin-triggered, owner-approved spend), backfill script that builds `CrmProspectPhone` from `CrmProspect.phone`/`CrmContact.phone`, and the Appendix A queries as `scripts/audit-calling-pool.ts` (read-only).
- Migration: `CrmProspectPhone`, `CrmPhoneSuppression` (+ enums). Security: suppression append-only; no phone in logs; lookup spend capped by settings. Env: `TWILIO_LOOKUP_ENABLED` (names only). Tests: `tests/phone-eligibility-domain.test.ts` (CASL INSUFFICIENT/BLOCKED still CALLABLE; DNC blocks; mobile→REVIEW; FIELD/UNRESOLVED blocked; hours incl. DST/Newfoundland/weekend), screen/import/assignment regression tests so email-only paths are byte-identical, `phone-db.test.ts`. **GO:** Appendix A run; bucket A ≥ agreed minimum (suggest ≥ 300 for a 2-rep pilot); no email-send behavior change in tests.
- Cost: Lookup line-type per number (price **[U]**, confirm on Twilio pricing), no recurring cost.

**PR 2 — Phase B: voice backend.**
- Create: `src/app/api/voice/{token,outbound,status}/route.ts`, `src/lib/voice/{session,token,twiml,reconcile}.ts`, `src/domain/voice/state-machine.ts`, `src/actions/sales-calls.ts` (`startCall`, `finishCall`), extend cron `sales` for reaper. Modify `lib/communications/twilio.ts` (voice webhook path constants, reuse validator).
- Migration: `CrmCallSession`, `CrmCallEvent`, `CrmVoiceSettings`. Security: signature validation, destination from DB only, eligibility re-run at webhook time, idempotent events, rate limits, kill switch default off, `PROVIDER_SIDE_EFFECTS` gate. Env: `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_VOICE_CALLER_ID`. Tests: signature rejects, replay/out-of-order events, two-rep race (DB unique), webhook with forged `To`, terminal-state mapping, reaper. **GO:** all pass in a Twilio test environment with Twilio test credentials or a Preview call to an owner-controlled number.
- Owner Twilio steps: §12.

**PR 3 — Phase C: softphone + queue.**
- Create: `src/app/(site)/platform/sales/calling/page.tsx`, `src/components/sales-calling/{Softphone,CallQueue,DispositionPanel,AudioDevicePicker}.tsx`, `src/lib/admin-locale/sales-calling.ts` (EN/FR), nav entry; add `@twilio/voice-sdk`; Permissions-Policy header for `/platform/sales/:path*`. New capability `place_sales_calls` (REMOTE REP/MANAGER; SUPER_ADMIN) in `domain/sales-crm/access.ts`. Tests: render/authz tests like `field-planner-locale-authz.test.ts`, disposition → activity/task/meeting/basis integration.

**PR 4 — Phase D: rollout.** Pilot 1 REMOTE rep, 1 province, 10 calls/day to owner-approved list; verify DNC end-to-end (say "don't call me" → all channels blocked), kill switch, spend alert; then widen. **GO:** zero eligibility violations in audit review, 100% of calls logged with SID, DNC propagation < 1 min, spend within budget.

Two implementation agents is enough: Agent 1 = PR 1 then PR 4 tooling; Agent 2 = PR 2 then PR 3 (PR 3 starts once PR 2's schema is merged).

## 10. Required environment variable names (no values)
`TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_VOICE_CALLER_ID`, optional `TWILIO_VOICE_EDGE`, `TWILIO_LOOKUP_ENABLED`. Existing and unchanged: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `PROVIDER_SIDE_EFFECTS`, `CRON_SECRET`, `TWILIO_WEBHOOK_BASE_URL`.

## 11. Compliance obligations → product controls
Register with DNCL operator (owner/legal) → checklist gate in `CrmVoiceSettings`; internal DNC immediate; identification script shown in UI; hours enforced; no ADAD/predictive/prerecorded; no recording; call logs ≥ 5 years; email consent scope+evidence stored; province enable switch; mobile/unknown → REVIEW.

## 12. Owner manual actions (nothing done by this audit)
1. Register GarageOS as a telemarketer with the National DNCL operator (lnnte-dncl.gc.ca) and record the registration number; decide the internal DNC policy text.
2. Twilio Console: confirm which number `TWILIO_FROM_NUMBER` is and whether it is Voice-capable (Phone Numbers → Manage → Active numbers → Capabilities). Do **not** repurpose it. Buy or choose a dedicated Canadian local number with Voice for sales (not done by this audit).
3. Create a standard API Key; create a TwiML App whose Voice URL is `<prod>/api/voice/outbound` and Status Callback `<prod>/api/voice/status`.
4. Voice → Geo Permissions: enable Canada only (add US only if wanted).
5. Usage alerts/ spend limit on the account; consider a separate subaccount for sales voice.
6. Engage counsel on mobile/sole-proprietor handling, BC/Manitoba licensing, Quebec French obligations, recording policy.
7. Provide a read-only prod DB role (or run Appendix A) so the count can be finalised.
8. Optionally approve Twilio Lookup spend for line-type classification.
9. After Phase B, verify caller-ID reputation/STIR-SHAKEN attestation on the sales number [U] and consider CNAM/branded calling.

## 13. Operating cost estimate (assumptions; **pricing unverified for Canada page**)
Per billed minute ≈ PSTN US$0.014 (US pricing page excerpt, "United States & Canada") + Client leg US$0.004 (Twilio help article) = **US$0.018/min**. Number rental for a Canadian local number: roughly US$1–2/month **[U]**. Per-minute rounding up.

| Calls/month | At 2.5 avg billed min | At 5 avg billed min |
|---|---|---|
| 100 | ~US$4.50 | ~US$9 |
| 500 | ~US$22.50 | ~US$45 |
| 1,000 | ~US$45 | ~US$90 |

Add number rental, optional Lookup per number, and zero for recording/AMD/Voice Insights in V1 (recording US$0.0025/min + storage, AMD US$0.0075/call, Insights advanced US$0.0024/min are available but excluded). Sources: https://help.twilio.com/articles/223132367, https://www.twilio.com/en-us/voice/pricing (US & Canada route row), Twilio Canada page https://www.twilio.com/en-us/voice/pricing/ca (**not read**).

## Appendix A — read-only production SQL pack (run with a SELECT-only role)

```sql
-- Q0 base: active, unmerged prospects
create temp view p0 as
select p.*, regexp_replace(coalesce(p.phone,''),'\D','','g') d0 from garageos."CrmProspect" p
where p.status='ACTIVE' and p."mergedIntoId" is null;
create temp view p1 as select *, case when length(d0)=11 and left(d0,1)='1' then substr(d0,2) else d0 end d from p0;
create temp view ph as select *,
  (d ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' and substr(d,2,2)<>'11' and substr(d,5,2)<>'11'
   and left(d,3) in ('204','226','236','249','250','263','289','306','343','354','365','367','368','382','403','416','418','428','431','437','438','450','474','506','514','519','548','579','581','584','587','604','613','639','647','672','683','705','709','742','778','780','782','807','819','825','867','873','879','902','905')) valid_ca,
  (left(d,3) in ('800','833','844','855','866','877','888')) toll_free,
  (coalesce(email,'')<>'') has_email
from p1;   -- verify NPA list against the current CNAC list before relying on it

-- Q1 totals / lanes
select count(*) active_unique, count(*) filter (where "territoryState"='NATIONAL') remote, count(*) filter (where "territoryState"='LOCAL') field_excluded, count(*) filter (where "territoryState" is distinct from 'NATIONAL' and "territoryState" is distinct from 'LOCAL') unresolved from ph;
-- Q2 REMOTE by province, language
select province, "preferredLanguage", count(*) n, count(*) filter (where valid_ca) valid_phone from ph where "territoryState"='NATIONAL' group by 1,2 order by 3 desc;
-- Q3 phone coverage (REMOTE)
select count(*) filter (where d0<>'') with_phone, count(*) filter (where valid_ca) valid_ca, count(*) filter (where d0<>'' and not valid_ca) invalid_or_foreign, count(*) filter (where d0='') no_phone, count(*) filter (where toll_free) toll_free from ph where "territoryState"='NATIONAL';
-- Q4 shared numbers
select d, count(*) n from ph where valid_ca group by d having count(*)>1 order by n desc limit 200;
-- Q5 DNC / restricted
select count(*) filter (where "doNotContact") prospect_dnc, count(*) filter (where exists(select 1 from garageos."CrmContact" c where c."prospectId"=ph.id and c."doNotContact")) contact_dnc from ph where "territoryState"='NATIONAL';
-- Q6 email x phone matrix (REMOTE)
select has_email, valid_ca, count(*) from ph where "territoryState"='NATIONAL' group by 1,2;
-- Q7 CASL status of phone-bearing prospects
select coalesce(e.readiness::text,'NONE') readiness, count(*) from ph left join garageos."CrmOutreachEligibility" e on e."prospectId"=ph.id where ph."territoryState"='NATIONAL' and ph.valid_ca group by 1;
select a.outcome, count(distinct dc."prospectId") from garageos."CrmDiscoveredContact" dc join garageos."CrmCaslAssessment" a on a."discoveredContactId"=dc.id join ph on ph.id=dc."prospectId" where ph.valid_ca and ph."territoryState"='NATIONAL' group by 1;
-- Q8 neither phone nor email
select count(*) from ph where "territoryState"='NATIONAL' and d0='' and not has_email;
-- Q9 commercial verification
select coalesce("repairFit"::text,'NOT_EVALUATED') fit, count(*) total, count(*) filter (where valid_ca) valid_phone from ph where "territoryState"='NATIONAL' group by 1;
-- Q10 assignment
select (ph."assignedStaffId" is not null) assigned, count(*) n, count(*) filter (where valid_ca and "repairFit"='VERIFIED_REPAIR' and not "doNotContact") callable_upper_bound from ph where "territoryState"='NATIONAL' group by 1;
-- Q11 upper-bound bucket A/B/C/D (line type is NOT stored today, so A is empty until Lookup runs)
select case when "doNotContact" or "territoryState"<>'NATIONAL' or "repairFit" is distinct from 'VERIFIED_REPAIR' then 'D_excluded'
            when valid_ca and not toll_free then 'B_needs_classification'
            when d0='' and (website is not null or address is not null) then 'C_needs_enrichment'
            else 'D_excluded' end bucket, count(*) from ph group by 1;
-- Q12 REMOTE phone-bearing, unassigned, why
select count(*) filter (where valid_ca and "assignedStaffId" is null and not has_email) phone_only_unassigned from ph where "territoryState"='NATIONAL';
-- Q13 staged candidates keeping phones
select "importState","importErrorCode", count(*), count(*) filter (where phone is not null) with_phone from garageos."CrmDiscoveryCandidate" group by 1,2 order by 3 desc;
-- Q14 shops lost at the door (count only; tombstones hold no phone)
select count(*) from garageos."CrmDiscoveryRejection" where 'REMOTE_NO_USABLE_EMAIL' = any("reasonCodes");
-- Q15 invalid/disconnected: no source stores this today; only WRONG_NUMBER call outcomes exist
select count(distinct "prospectId") from garageos."CrmActivity" where type='CALL' and outcome='WRONG_NUMBER';
```
Not answerable from existing data: landline vs mobile, disconnected status, and personal vs business — no such evidence is stored (Phase A adds it).

## Appendix B — sources
CRTC key rules https://crtc.gc.ca/eng/phone/telemarketing/tobligations/rules-regles.htm · business alert https://crtc.gc.ca/eng/phone/telemarketing/biz.htm · compliance https://crtc.gc.ca/eng/phone/telemarketing/reg.htm · exemptions/hours https://crtc.gc.ca/eng/phone/telemarketing/exempt.htm · DNCL consumer page https://lnnte-dncl.gc.ca/en/Consumer/Who-Can-Still-Call-You · BC licensing https://www.consumerprotectionbc.ca/get-keep-licence/telemarketing/ · Twilio Voice SDK https://www.twilio.com/docs/voice/sdks · Access tokens https://www.twilio.com/docs/iam/access-tokens · `<Dial>` https://www.twilio.com/docs/voice/twiml/dial · Client leg pricing https://help.twilio.com/articles/223132367 · Twilio voice pricing https://www.twilio.com/en-us/voice/pricing.
