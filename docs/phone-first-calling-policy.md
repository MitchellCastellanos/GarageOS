# Phone-first national calling — policy, production inventory, fixes, Twilio plan, Supabase audit

Date: 2026-10-20. Supersedes the counts-free sections of `docs/twilio-voice-sales-softphone-audit.md`. All production figures below were read from the production Neon branch (`production`, project `autumn-art-59701921`, schema `garageos`, 76 migrations applied) with SELECT-only statements. Nothing was written, deployed, purchased, called or reconfigured.

## 1. Legal rules for a B2B telephone call

Evidence quality: **[CRTC-excerpt]** = wording seen in a search excerpt of the official CRTC page (direct page fetches were blocked in this environment, so the full pages and the statutory text were not read); **[secondary]** = a law-firm/industry source; **[open]** = not established, needs counsel. Counsel review (declined for launch per `docs/launch-readiness.md` D4) is still advised before the first dial.

| Question | Finding | Source / status |
|---|---|---|
| B2B exempt from Part II (National DNCL Rules)? | Yes. Telemarketing to *business consumers* is exempt from the National DNCL Rules; the Telemarketing Rules (Part III) and ADAD Rules (Part IV) still apply. | Telecom Decision CRTC 2007-48 (https://crtc.gc.ca/eng/archive/2007/dt2007-48.htm); CRTC business alert https://crtc.gc.ca/eng/phone/telemarketing/biz.htm; Telecom Information Bulletin 2009-282/283 **[CRTC-excerpt]**. Exact "business consumer" definition and the Telecommunications Act s. 41–41.7 text: **[open]** (not read). |
| Registration mandatory even if exempt? | Yes — "Telemarketers must register with the National DNCL before making unsolicited calls, even if the calls being made are exempt." Registration is free. | https://crtc.gc.ca/eng/phone/telemarketing/tobligations/rules-regles.htm, https://crtc.gc.ca/eng/phone/telemarketing/tobligations/register-inscrire.htm; Telecom Decision CRTC 2008-6-1 **[CRTC-excerpt]**. |
| DNCL subscription needed for exclusively exempt B2B calls? | No. An exempt-only telemarketer does not buy a subscription or download the list. | https://crtc.gc.ca/eng/dncl/rpt250930/p3.htm and the registration page **[CRTC-excerpt]**. Because the list is not consulted for B2B, a business that registered its own number on the DNCL is still callable for B2B purposes; it is **not** screened. |
| Internal DNC list | Required even for exempt calls. A request must be honoured; the number is added to the internal list within 14 days and kept 3 years (+14 days per the excerpt). GarageOS adds it **immediately** and keeps it append-only. | https://crtc.gc.ca/eng/phone/telemarketing/reg.htm **[CRTC-excerpt]**. Exact retention wording **[open]**; we keep ≥ 3 years + 14 days. |
| Identification / disclosures | State who is calling (and on whose behalf) and the purpose at the start of the call; on request give a contact number/representative; do not block or falsify caller ID. | reg.htm / key-rules page **[CRTC-excerpt]**; callback-validity period (60 days in an excerpt) **[secondary]**. |
| Calling hours | Weekdays 9:00–21:30 and weekends 10:00–18:00 **in the recipient's local time**; applies to exempt calls (2019-318 says the hours are the consumer's). | https://crtc.gc.ca/eng/phone/telemarketing/exempt.htm, key-rules page, Compliance and Enforcement Decision CRTC 2019-318 **[CRTC-excerpt]**. An older "9:30" figure does not appear on the CRTC pages seen. Implemented in `callingWindow()`; used at dial time, **not** as an eligibility criterion. |
| Published business mobile numbers | Nothing found limiting B2B calls by line type; the exemption turns on the call being directed to a business, not on landline vs mobile. | **[open]** (absence of a rule is not a confirmed rule). Policy: line type is not a criterion. |
| Sole proprietors | Not addressed in any source read. A personal number of an individual is the genuine risk for the B2B characterisation. | **[open]**. Policy: only explicit evidence moves a number to NEEDS_CLASSIFICATION (`SOLE_PROPRIETOR_SUSPECTED`); a business-place listing is accepted as evidence of a business line. |
| Manual click-to-call vs automatic dialing | The ADAD Rules govern automatic dialing-announcing devices (automated dialing plus recorded message). A human-initiated, one-call-at-a-time click-to-call with a live speaker is not an ADAD. Predictive/ASAP dialing and abandoned-call limits would need separate analysis. | ADAD Rules page **[CRTC-excerpt]**; predictive-dialer treatment **[open]** → out of scope for V1 (no predictive dialing, no recorded messages). |
| Evidence legally necessary for "B2B" | Not enumerated in any source read. The exemption is a characterisation of the call (product/service marketed to a business consumer). | **[open]**. Policy: a business-place listing that names a commercial repair shop plus a product (shop-management software) that only a business buys. |
| Recommended safeguards (not legal requirements) | Operator confirmation of a business line on first contact; flag shared/head-office numbers; keep call logs; weekday-first pacing; no recording. | Operational. |
| Provincial | **BC**: Telemarketer Licensing Regulation under the Business Practices and Consumer Protection Act (consumer distance sales) — B2B applicability unconfirmed (https://www.consumerprotectionbc.ca/get-keep-licence/telemarketing/). **MB**: provincial telemarketer licensing regime exists (CMA guide) — unconfirmed for B2B. **QC / AB / SK / NS etc.**: nothing found requiring registration for B2B; Québec French-language expectations apply to the conversation. | **[open]**. Policy: **BC and MB are isolated** (status `HELD_PROVINCE`, counted separately, override env `PHONE_HELD_PROVINCES`); the rest of the country is not blocked. |
| Privacy / provenance | The numbers are business-listing data from Overture (CDLA-Permissive-2.0 and Apache-2.0 for Foursquare-derived rows; `licenseOk` already enforced at staging). Store the source and the evidence; honour deletion/DNC requests; keep a call log; do not record by default. | PIPEDA / Québec Law 25 **[open]** for stored call metadata; no recording is planned. |
| CASL | A telephone call is not a commercial electronic message. CASL email eligibility, evidence and bases are **not** imported into telephone eligibility, and nothing here changes them. Consent for email obtained on a call is a separate, documented act (existing `CrmSendingBasis`). | CASL / CRTC separation. |

**Owner actions that follow from this table:** register with the National DNCL operator (free); adopt the internal DNC policy text; get counsel to close the **[open]** rows before first dial, especially BC/MB.

## 2. The minimum CALLABLE definition (implemented in `src/domain/sales-crm/phone-eligibility.ts`)

A prospect is **CALLABLE** when all hold:
1. `repairFit = VERIFIED_REPAIR` (real, operating, independent repair business — the existing commercial screen/ICP);
2. `territoryState = NATIONAL` (REMOTE; Greater Montréal FIELD and unresolved Québec addresses excluded);
3. `phone` normalizes to a valid Canadian geographic or toll-free number (`normalizeCanadianPhone`: NANP rules, assigned Canadian area codes, rejects N11/fictional/placeholder/foreign);
4. business-contact evidence: the number comes from a business-place listing record (`LISTED_BUSINESS_SOURCE`) or an operator confirmed it (`OPERATOR_VERIFIED`);
5. no internal DNC: not `doNotContact`, no active `CrmPhoneSuppression` for the business or the number, not archived/merged;
6. province not on legal hold (BC, MB by default).

Not required: website, email, CASL status, landline, paid lookup, manual review, expiry. Dimensions are reported separately (legal / dataQuality / commercialFit / territory); source licensing is enforced upstream (`licenseOk`) and hours are availability, not eligibility. Everything not callable and not excluded is **NEEDS_CLASSIFICATION** (unverified fit, unknown business nature, suspected sole proprietor, shared/duplicate number) and is never counted callable and never discarded.

Test cases: `tests/phone-first-domain.test.ts` (13 tests: normalization accept/reject, best-number pick, callable without email/website/landline, exclusions, classification, province hold, determinism, calling-window incl. DST, screen default-unchanged and phone-first-opt-in).

## 3. Production audit — real numbers (SELECT-only, 2026-10-20)

Schema discovery: data lives in schema `garageos`; Prisma history table is `public._prisma_migrations` (76 applied; two historical rows from 2026-09 are marked rolled back and later superseded — benign). Totals: 12,835 CrmProspect, 440 CrmContact, 43,951 CrmDiscoveryCandidate (staging), 3,333 CrmDiscoveryRejection, 122 import batches, 17 discovery runs, **0 CALL activities**, 0 phone/email suppressions, 0 DNC prospects/contacts. Only one sales-staff row exists: an ACTIVE `SALES_REP` in **FIELD** mode that owns 11,088 prospects (including ~10.1k national ones assigned by the email rollout). There is no REMOTE seller yet.

**Already in the CRM** (active, unmerged, NATIONAL, VERIFIED_REPAIR, not DNC):
| | count |
|---|---|
| Unique active prospects, all territories | 12,835 (FIELD/LOCAL 1,415; NATIONAL 11,419) |
| NATIONAL verified independent repair shops | 10,859 |
| …with any phone | 10,839 |
| …with a valid Canadian number (geographic + toll-free) | ≈10,825 rows (geographic + toll-free; ±3 depending on two reserved area codes) → **10,564 unique numbers (callable base before provincial hold)** |
| …shared numbers (duplicate records of one number) | 261 → NEEDS_CLASSIFICATION |
| …invalid/foreign phone | 11 (+111 toll-free counted valid) |
| HUMAN_REVIEW national (not callable yet) | 560 |
| Provenance of all of them | Overture Maps release 2026-09-23.1 (12,739 prospects; 95 CSV; 1 test) — business-place listings |

Callable base by province (unique numbers; **BC 1,313 and MB 340 are held**, so immediately callable = 10,564 − 1,653 = **8,911** once REMOTE sellers exist):
ON 4,158 · AB 2,291 · QC 1,491 · BC 1,313 (held) · MB 340 (held) · SK 331 · NS 256 · NB 233 · NL 88 · PE 55 · YT 8.
Language: `preferredLanguage = UNKNOWN` for **100 %** — language must be derived (QC → FR default, NB bilingual, rest EN) at queue time; not yet implemented.
Email status of the 10,839 national verified shops that have a phone (best CASL assessment per prospect; calling does not depend on it): CASL BLOCKED 4,705 · INSUFFICIENT 4,239 · SUPPORTED 445 (439 with a sending basis) · no email/assessment on record 1,450. Of the 10,564 unique callable numbers, assigned to a seller: **10,133 — all to the single FIELD-mode rep**; unassigned 431. Zero have prior calls.

**Lost / stuck by the email-first pipeline (phone data still in staging — no source re-read needed):**
| | count |
|---|---|
| Staged, VERIFIED_REPAIR, national, valid phone, no CRM match, not duplicate, phone not already in CRM, de-duplicated by number | **7,760** (APPROVED 5,060; PENDING 2,700) |
| …by province | ON 3,616 · QC 1,298 · BC 1,076 (held) · AB 430 · SK 384 · MB 320 (held) · NB 261 · NS 245 · NL 115 · PE 13 · YT 2 |
| Approved + no email + not imported (the "deferred" pool) | 6,243 candidates (6,222 with phone) |
| Branches of existing prospects (own phone), VERIFIED | 1,921 (separate review: multi-location) |
| Staged HUMAN_REVIEW national with phone | 6,225 (NEEDS_CLASSIFICATION) |
| Staged EXCLUDED national | 12,664 (excluded: chains, dealers, parts…) |
| Staged, VERIFIED, no phone | 137 (enrichment) |
| Greater Montréal staged, not imported | 650 (FIELD — outside this strategy) |
| **Purged tombstones** `REMOTE_NO_USABLE_EMAIL` | 1,260, of which **281 had no other reason** (QC 201, PE 65, YT 15). Their name/phone were deleted with the staging row (tombstones keep source id + fingerprint only). |

**Total reachable inventory estimate** = 10,564 (in CRM) + 7,760 (staged, phone-first import) ≈ **18.3k unique repair-shop numbers**, of which BC+MB ≈ 3.05k held. Mobile vs landline and sole-proprietor status are **not recorded anywhere**; none of these counts depends on them by policy.

Dimensions A–J requested:
A unique independent repair businesses (CRM) 12,197 verified + 560+23 review · B REMOTE 10,859 verified (11,419 incl. review) · C with phone 10,839 · D valid normalized 10,825 (10,564 unique) · E reliable business-contact evidence 10,825 (all Overture listings; CSV 95 UNKNOWN) · F CALLABLE 8,911 now + 1,653 held (BC/MB) · G needs classification/enrichment: 261 shared + 560 HUMAN_REVIEW + 95 CSV unknown + 11 invalid + 137 no-phone staged + 6,225 staged review · H excluded by DNC/legal: 0 DNC (list is empty today) · I no phone: 20 prospects (+137 staged) · J lost to email-first: 281 purged (unrecoverable without a bounded re-read) + 7,760 stuck-but-recoverable in staging.

## 4. Defects verified against current main and production

| # | Finding | Verdict |
|---|---|---|
| 1 | `commercial-screen.ts` rejects REMOTE shops with no usable email | **Confirmed.** Fixed by opt-in `phoneFirst` (default behaviour byte-identical). |
| 2 | `automation.ts`/`assignment.ts` skip REMOTE prospects without email | **Confirmed**, and intentionally **left unchanged**: it protects the email campaign. Phone-first shops are assigned through the existing manual assignment engine (it does not use `skipRemoteNoEmail`). |
| 3 | Rejection tombstones keep no name/phone | **Confirmed** (schema + 1,260 prod rows). Staging now stages phone-valid REMOTE shops instead of tombstoning them. |
| 4 | Only the first valid phone of up to six is kept | **Confirmed** (`pickPhone`). New `pickBestCanadianPhone` exists; the extractor is **not** switched here (a different pick would alter `contentFingerprint` and reopen approvals) — proposed with the bounded re-read. |
| 5 | Phone validation too permissive | **Confirmed.** Strict `normalizeCanadianPhone` is used by the screen, eligibility, import dedupe and refresh. |
| 6 | CALL logging lacks DNC/territory checks | **Confirmed for `logActivity`** (no check). Not changed: blocking would stop a rep from recording a call that happened; the check belongs at *dial* time (`evaluatePhoneEligibility` re-run in the voice webhook, PR 3). |
| 7 | **New, urgent:** `purgeUnusableCandidates` (automation stage `screen`, `qualifyEnabled = true`, ticking every cron run) deletes unreviewed staged candidates that the email-only screen rejects, i.e. phone-only national shops, keeping only a tombstone. | **Confirmed in production**: 1,260 already deleted on 2026-10-18; **8,828 unreviewed national phone-only staged rows (1,078 verified) may be deleted** by the same stage (counted as national, unreviewed, no email, with phone, no CRM match). The window is the first 500 ids per tick, so progress is slow, but it is live. **Merge this PR first, or pause the `qualify` stage (`CrmLeadAutomation.qualifyEnabled = false`) now.** Fixed here by passing `phoneFirst` to the purge. |
| 8 | Import/CASL/rollout pipeline | Email logic untouched. No change to `CrmOutreachEligibility`, CASL engine, rollout, sending or the email assignment gate. |

## 5. Phone-first CRM architecture (this PR)

- `src/domain/sales-crm/phone.ts` — strict Canadian normalization, NPA table, best-number pick.
- `src/domain/sales-crm/phone-eligibility.ts` — pure eligibility (+reasons, dimensions) and `callingWindow` (recipient-local CRTC hours, DST-correct via Intl).
- `src/lib/sales-crm/phone-readiness.ts` — idempotent, keyset-resumable `refreshPhoneEligibility` (writes only derived `phone*` columns, only when the result changed), `phoneInventory`, immediate internal DNC (`suppressPhoneForProspect` / `liftPhoneSuppressionForProspect`) hooked into `applyDoNotContact` and `reinstateProspect`.
- Schema (migration `20261031090000_phone_first_calling`, additive: 8 nullable/defaulted `CrmProspect` columns, 4 enums, table `CrmPhoneSuppression`, 2 indexes). Re-evaluation: at DNC set/lift immediately; on demand per prospect; in batch with `scripts/phone-first-refresh.ts` (dry-run default, `--apply`, `--after <id>` to resume); and always freshly at dial time. No arbitrary expiry.
- `src/lib/lead-radar/import-service.ts` — `phoneFirst` option: claims VERIFIED_REPAIR national candidates with a valid Canadian phone, APPROVED or PENDING, `matchState = NEW`, de-duplicated by number against the CRM and within the chunk, created **unassigned**; never used by the automatic orchestrator. Not wired to any button/cron in this PR (an owner-approved bulk run follows the DNCL/legal gates).
- Language and timezone: timezone by province implemented; language derivation (province/postal default, seller `leadLanguages`) is **not** implemented yet (PR 3).

Not done in this PR (and why): no production write (backfill/import/refresh were not run), no UI, no automation stage, no multi-phone table, no extractor change.

## 6. Twilio Voice plan

**Account metadata could not be read**: the Twilio tool available here searches documentation only; there is no account/API access, so the capabilities of the 438 number (voice-enabled?), its owning account/subaccount and webhooks are **unverified**. Vercel Production holds `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (names only; values not read). Not present: API key, TwiML App, voice caller-ID variable. `docs/launch-readiness.md` says the shared 438 path was never validated end-to-end and the shared number serves tenant SMS.

Recommendations: (1) a **dedicated sales Voice number** is preferable and in practice necessary: the 438 number is shared tenant SMS infrastructure, may not be Voice-capable, and a Montréal area code on national B2B calls is fine but its reputation must not be tied to tenant SMS; (2) own it in a **new Twilio subaccount** ("GarageOS Sales Voice") under the root account so usage, geo permissions, spend alerts and an API key are isolated; (3) isolate Voice from SMS by separate routes (`/api/voice/*`), separate TwiML App, no change to `/api/webhooks/twilio/*` and no Voice URL on any tenant number. Design (token → session → TwiML App webhook with server-resolved destination, eligibility re-run, idempotent signed status callbacks, DB constraints against double-dialing, reaper, kill switch, CA-only geo permissions, spend alerts, no recording, no inbound in V1) is as specified in `docs/twilio-voice-sales-softphone-audit.md` §6–§8; the call-session schema is unchanged from that document and builds on the phone columns added here.

PR roadmap: **PR 1 (this)** phone-first data + eligibility + screen/purge fix. **PR 2** call-session schema + voice token/outbound/status routes (server only, flag off). **PR 3** softphone + calling queue (language derivation, queue ordering, dispositions → activity/task/meeting/consent basis). **PR 4** pilot rollout tooling. Owner actions for Twilio are in §8.

## 7. Supabase dependency audit

- **Package:** `@supabase/supabase-js ^2.103.0` (package.json:47) — the only Supabase dependency; no `@supabase/ssr`, auth, realtime, edge functions or database use. Supabase is **Storage only**. The application database is Neon.
- **Code:** `src/lib/storage.ts` (client = service-role key; buckets `public-assets`, `accounting`, `communications`, plus a fourth, `sales-email`, not in your list), `src/lib/storage-migration.ts` + `scripts/migrate-storage-privacy.ts` (one-time public→private bucket migration), `scripts/backup-storage.ts` + `.github/workflows/storage-backup.yml` (weekly backup, secrets `BACKUP_SUPABASE_URL`/`BACKUP_SUPABASE_SERVICE_ROLE_KEY`), `scripts/marketing/attach-garage-laurent-assets.ts`, `next.config.ts` (`images.remotePatterns: *.supabase.co`), `src/actions/settings.ts:271` (config guard), tests `storage-privacy`, `storage-migration`, `demo-booking`, `booking-page`, docs under `docs/compliance/`.
- **Callers of `@/lib/storage`:** actions `settings` (logo), `sales-demo`, `booking-page`, `inspections` (DVI photos), `documents`, `invoices`, `sales-inbox`; routes `inspection/[token]/photo/[photoId]`, `api/invoices/[id]/payment-receipt`, `api/invoices/download/[token]`, `api/sales/attachment/[id]`, `api/webhooks/resend` (inbound attachments); libs `communications/inbox`, `sales-comms/{dispatcher,inbound}`, `invoice-document-package`; admin pages `invoices/[id]`, `inspections/[id]`, `inbox/[threadId]`.
- **Env var names (code):** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Production only by design; Preview has none). No anon key anywhere.
- **Is the connected Supabase project the production Storage project? Yes.** Production Neon `Shop.logoUrl` values (2 shops) point at host `saccjhinmeaoqoeuhljd.supabase.co`, which is exactly the connected project ref. (Vercel env values are encrypted and were not decrypted.)
- **Buckets (metadata only, `storage.buckets/objects`):** `accounting` — private, **7 objects, 13.3 MB**, newest 2026-10-07 (consistent with 3 `Invoice.clientPackagePath` rows in Neon plus the test invoice documents); `public-assets` — public, 5 MB limit, **5 objects, 4.5 MB** (shop logos / booking images). **`communications` does not exist** (lazily created; 0 `CommunicationAttachment` rows). **`sales-email` does not exist** (0 `CrmEmailAttachment` rows). No private document contents were opened.
- **Obsolete code:** `src/lib/storage-migration.ts` and `scripts/migrate-storage-privacy.ts` are a finished one-time migration (all 5 public objects already live in `public-assets`); keep until the privacy runbook is retired, but they are not on any runtime path. `scripts/marketing/attach-garage-laurent-assets.ts` is a seeding tool. Nothing else looked dead.
- **Would removing Supabase break production? Yes.** Logo upload/display, booking-page images, invoice client PDF packages, DVI photos, payment receipts, Inbox and sales-email attachments all go through it, and `public-assets` URLs are stored in Neon rows. A migration (e.g., to R2/Vercel Blob) would require copying 12 objects, rewriting the stored public URLs and the `next.config` image pattern, and replacing the weekly backup. Not started.

## 8. Owner actions

1. **Now:** merge this PR (or set `CrmLeadAutomation.qualifyEnabled = false` until it is merged) — the purge stage is deleting phone-only staged shops (§4 #7).
2. Register as a telemarketer with the National DNCL operator (free; no subscription needed for exempt-only calling); write the internal DNC policy; get counsel to close the **[open]** rows, especially BC and MB licensing and the sole-proprietor/mobile treatment.
3. Create REMOTE sales reps (none exist). Decide how the ~10.1k national prospects owned by the FIELD-mode rep reach REMOTE reps (bulk reassignment with confirmation through the existing assignment tool); the phone columns do not change ownership.
4. After merge and deploy: run `scripts/phone-first-refresh.ts` (dry-run first) against production to populate the derived columns; then, if you approve, run the phone-first import for the 7,760 staged shops (unassigned).
5. Approve (or decline) a **bounded re-read** for the 281 purged phone-only shops (QC 201, PE 65, YT 15): Overture is CDLA-Permissive-2.0 (already licensed in `licenseOk`), cost is the existing bounded single-province run mechanism (no email pipeline restart, no national re-extract). Not needed for the 7,760 already staged.
6. Twilio: confirm in the Console whether the 438 number is Voice-capable; create the Sales Voice subaccount, buy/port a dedicated Canadian Voice number, API key, TwiML App, CA-only geo permissions, spend alerts (details in the earlier audit §12). **Not done.**
7. Decide the Supabase future (keep for now).

## 9. Follow-up (2026-10-20): data protection, validation, dry run

### 9.1 Is phone-only data still at risk?
Read from `CrmLeadAutomationRun.counters` (production): the `screen` stage (purge) ran 62 times on 2026-10-18 and **purged 3,095** staged rows; on 2026-10-19 (51 runs) and 2026-10-20 it examined 500 rows per tick (25,500+) and **purged 0** — it is looping over the same first 500 unreviewed rows (ordered by id), all of which the screen keeps. No tombstone was written in the last 24 h and the candidate count (43,951) did not change. **Not deleting right now, but latent**: the window only advances if rows in that first 500 stop matching (reviewed, imported, deleted), after which the next 500 — including phone-only shops (8,828 unreviewed national no-email rows with a phone; 1,078 verified) — enter the window. Automation is enabled (`qualifyEnabled = true`). Reversible mitigation options (none applied — needs approval): (a) do nothing and deploy PR #171 quickly (the purge then keeps them); (b) set `CrmLeadAutomation.qualifyEnabled = false` — this also pauses the CASL *qualify* stage (it gates both), so not recommended; (c) none narrower exists without code. **Recommendation: (a)** — avoid reviewing/importing candidates in the first-500 window until PR #171 is deployed.

### 9.2 Territory, FIELD and language checks (production)
- Greater Montréal rule (`CrmTerritory`, active): 36 cities + postal prefixes H, J4, J3V, J3Y, J5R, J5C. **QC NATIONAL prospects: 1,508 (1,491 callable); 0 have a postal code in a FIELD prefix**; 20 whose city text resembles a FIELD name are all outside it (St-Lambert-de-Lauzon, St-Bruno (G0W), Lavaltrie, Notre-Dame-des-Prairies, St-Lin–Laurentides, …); 32 have no postal code but a city that is not on the FIELD list. Staged QC pool (2,148): same result. FIELD exclusion holds.
- 386 verified Greater-Montréal candidates (371 with phone) stay staged for FIELD; the phone-first import claims only `territoryKey = 'national'`.

### 9.3 Import dry run (production, read-only; reproduces `importApprovedCandidates({ phoneFirst })` selection)
| Step | Count |
|---|---|
| Staged, NOT_IMPORTED, APPROVED/PENDING, licence OK, not EXCLUDED tier, no duplicate-of, VERIFIED_REPAIR, match NEW, national, phone present, attempts < 3 | 8,320 |
| Invalid / non-Canadian phone (stay staged, not discarded) | 18 |
| Phone already on a CRM prospect (skipped) | 326 |
| Duplicate number inside the staged pool (one per number kept) | 216 |
| **New unique prospects that would be created** | **7,760** (APPROVED 5,060 + PENDING 2,700) |
| …of which BC/MB (created but `HELD_PROVINCE`, not callable) | 1,396 |
| …callable immediately (other provinces) | 6,364 |
| …that also share name+city with an active CRM prospect (the existing duplicate classifier may link or send these to review instead of creating) | ≤ 55 |
| …with a chain signal (the repair-fit/ICP gate at import may still exclude) | ≤ 28 |
| Existing prospects updated by this import | 0 expected (phone not in CRM by construction; up to the 55 above may be linked/enriched) |
| Candidates blocked by territory: Greater Montréal (FIELD) / unresolved | 650 / 1 (not claimed) |
| Staged HUMAN_REVIEW / EXCLUDED / no-phone | 6,225 / 12,664 / 137 (not claimed) |

Expected final CRM inventory by province (unique numbers; CRM today + import): ON 4,158 + 3,616 = 7,774 · AB 2,291 + 430 = 2,721 · QC 1,491 + 1,298 = 2,789 · SK 331 + 384 = 715 · NS 256 + 245 = 501 · NB 233 + 261 = 494 · NL 88 + 115 = 203 · PE 55 + 13 = 68 · YT 8 + 2 = 10 → **15,275 callable**; held: BC 1,313 + 1,076 = 2,389, MB 340 + 320 = 660 → 3,049. **Total 18,324.**

The dry run could not execute the TypeScript against production (no production connection string in this environment); the selection logic was reproduced in SQL and matches the 7,760 exactly. The real transaction additionally applies the repair-fit/ICP gate, the territory re-classification and the duplicate classifier, and **skips rather than loses** anything they reject (rows stay staged).

### 9.4 Corrections found by the scratch-database tests
- The database forbids any import state on a non-APPROVED candidate (`CrmDiscoveryCandidate_import_requires_approval_check`). The phone-first import therefore records an explicit approval for the PENDING rows it claims (`reviewState = APPROVED`, `reviewedByUserId` = the importing admin, note `PHONE_FIRST_CALLING`), inside the same transaction. That also protects the rows from the purge.
- `loadRemoteNoEmailWhere` (pre-existing) uses `NOT (email contains '@' …)`, which in SQL three-valued logic never matches a NULL email. It is therefore not a reliable "no email" test for NULL emails; this PR does not change it (it would change email-side workload counts). The assignment fix is the env-gated `PHONE_FIRST_AUTO_ASSIGN` path (exact SQL on `phoneEligibility`) plus manual assignment, which never depended on email.
