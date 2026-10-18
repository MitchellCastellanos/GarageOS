# Automated CASL evidence qualification (policy `casl-auto-v1`)

Status: **built and tested; live authorization is OFF** (`CrmLeadAutomation.autoCaslActive = false`). Product controls, not legal advice. Activation needs a legal review of this document and one explicit owner decision (see *Activation*).

## 1. Why this exists
GarageOS wants a clean pool of Canadian independent repair shops it may lawfully email, with **zero routine per-contact human approvals** and **zero unjustified automated authorizations**. PR #159 had added a mandatory second-person approval; that was an internal application policy, not a statutory CASL requirement, and it has been withdrawn (section 6). It is replaced by deterministic, evidence-based, auditable rules that skip every recipient about whom there is reasonable doubt.

## 2. Research (what the rules rest on)
Sources consulted (secondary summaries unless marked; the official pages could not be fetched from the build environment — **counsel should read the primary texts**):
* CASL s.10(9)(b) (conspicuous publication) — three conditions: the recipient published the address or caused it to be published; the publication is not accompanied by a statement that the person does not wish to receive unsolicited commercial messages; the message relates to the person's business, role, functions or duties. Summaries: [Bennett Jones on the CRTC's conspicuous-publication decision](https://bennettjones.com/Blogs-Section/CRTC-Assesses-Conspicuous-Publication-Basis-of-Implied-Consent-in-CASL-Enforcement-Decision?amp=Blog), [BLG on the CRTC enforcement decision](https://www.blg.com/en/insights/2017/11/casl-enforcement-decision--interpretive-guidance-for-compliance-and-penalties).
* CRTC [Compliance and Enforcement Information Bulletin 2012-548](https://crtc.gc.ca/eng/archive/2012/2012-548.htm) (interpretation of the Electronic Commerce Protection Regulations) and the CRTC's reading, reported by the firms above: the rule needs **more than public availability**, applies only where consent can reasonably be inferred case by case, does not cover an address a **third party** posted on its own initiative or a directory whose terms forbid unsolicited email, and relevance must rest on **explanations or evidence, not assumptions**.
* CASL s.13 and the CRTC [Enforcement Advisory on keeping records of consent](https://www.canada.ca/en/radio-television-telecommunications/news/2016/07/enforcement-advisory-notice-for-businesses-and-individuals-on-how-to-keep-records-of-consent.html) (2016): the **onus of proving consent is on the sender**, for each message, by cogent evidence; keep the evidence, how it was collected, compliance policies and unsubscribe records (see also CRTC Bulletin 2014-326 on compliance programs).
* Overture Maps Places schema ([Place](https://docs.overturemaps.org/schema/reference/places/place/), [SourceItem](https://docs.overturemaps.org/schema/reference/common/source_item/), [GERS](https://docs.overturemaps.org/gers/gers-tutorial/), [bridge files](https://docs.overturemaps.org/gers/bridge-files/)): `sources[]` is a per-property attribution list — `property` (JSON pointer, `""` = whole place), `dataset`, `license`, dataset-specific `record_id`, source `update_time`, source `confidence`. **There is no `provider` field.** `emails` is a plain list of strings. GERS ids are intended to be stable across releases; `update_time` has been reported to be set retroactively in some releases. Places data is published under CDLA Permissive 2.0 — a **data licence**, not consent.

Conclusions that drive the design: public availability, a dataset's licence, or a third-party database proves **nothing** about the recipient's consent; a dataset is an aggregator, not the original publisher; the sender must be able to **show** each condition for each address; therefore only the shop's **own website** can be machine-verified, and everything else is skipped.

## 3. Audit findings, verified against the repository (before this PR)
| Finding | Verified | Where | Fix in this PR |
| --- | --- | --- | --- |
| Extractor discards most Overture provenance | **True** — emitted only `{dataset, license}` per source | `scripts/lead-radar/overture_extract.py` | v1.4.0 emits `sourceItems` (`property, dataset, license, recordId, updateTime, confidence`); whitelisted, bounded |
| Staging stores commercially useless candidates | **True** — everything in scope was staged | `lib/lead-radar/staging.ts` | early screen before matching/writes; tombstones instead of rows; bounded cleanup of old rows |
| Automated import applies REMOTE email checks, the shared transaction does not | **True** — enforced only by the queue selection (`nextImportIds`) | `lib/lead-radar/import-service.ts` | same pure screen inside the shared transaction (every path, by id included) |
| Later releases can rediscover skipped records | **True** — and nothing remembered why they were skipped | staging | tombstones keyed by GERS id + fingerprint, re-screened every release |
| Overture email availability/licence ≠ CASL consent | **True** — and the old model had no automated way to collect publication evidence | — | evidence engine (section 4) |
| Existing evidence records insufficient for automated verification | **True** — free human text + one reviewer | `CrmSendingBasis` | `CrmCaslAssessment` history (exact address, URL, snippet, hash, five conditions, rule version) |

## 4. The five conditions and how each is proven (rule set `casl-auto-v1`)
An address is **SUPPORTED** only if all five are MET; evidence comes from the shop's own website (`src/domain/lead-radar/casl-evidence-engine.ts`).
1. **publishedByRecipient** — the address appears (mailto, visible text, Cloudflare-protected, `[at]/[dot]`) on a page of the **same site** as the website on the prospect record (registrable-host match; directories, social pages and site-builder subdomains are never "the shop's own site"), and the page is corroborated as that business (the address's domain equals the site, or the shop's phone / postal code / name appears on the page).
2. **noRestriction** — no statement against unsolicited / commercial / marketing / vendor messages (English and French patterns, deliberately broad) on any page read. A restriction anywhere ⇒ **BLOCKED**.
3. **relevant** — a general operating mailbox of a repair shop (info, contact, service, reception, rdv, ventes, atelier, owner…) is relevant to a message about running the shop; HR, careers, privacy, legal, billing/accounting, noreply, press… are **BLOCKED** without spending a request; a named mailbox is relevant only when the page itself ties the person to running the business (owner, gérant, manager…); otherwise UNKNOWN ⇒ INSUFFICIENT.
4. **attributable** — the evidence ties **this exact address** to **this business**; a free-mail address additionally needs the business's phone/postal/name beside it **and** contact context. Role mailboxes and free-mail are not automatically disqualified (owner decision) but need this recipient-specific evidence.
5. **documented** — URL, observation time, ≥10-character bounded snippet and content hash are all recorded.

Outcomes: **SUPPORTED** (all MET) · **BLOCKED** (restriction, suppression/DNC, irrelevant role) · **INSUFFICIENT** (everything else: no own website, address not found, not attributable, role unknown, robots.txt disallows, fetch failed, budget exhausted, stale). `INSUFFICIENT` and `BLOCKED` never authorise anything; there is no "ask a human" outcome. Freshness: SUPPORTED evidence is revalidated after **90 days** and expires after **180 days**. INSUFFICIENT is retried after 7 → 30 → 90 days (then every 90); BLOCKED is re-read after 90 days (a removed restriction is only picked up then); a changed website or a new rule version re-opens an address at once.

## 5. What can and cannot be verified automatically
Automatic: that an address is on the business's own site; that no restriction statement is on the pages read; mailbox role; corroboration by domain/phone/postal/name; suppression/DNC/duplicates; freshness; robots.txt compliance.
Not provable by machine (hence skipped, never guessed): that the person who controls the site is the person who owns the mailbox; that an unread page has no restriction (only the homepage and ≤3 contact-like pages are read); anything on a social network or directory (those are never read — terms of service and the CRTC's third-party rule); consent that exists only in a human's memory; and — above all — **that CASL is satisfied**, which is a legal conclusion and the reason live authorization is a separate owner decision.
Uncertain records are skipped without human intervention: they simply stay INSUFFICIENT and are retried on the schedule above; sellers are never asked to research them.

## 6. Removal of the two-reviewer requirement
Removed: `approveSendingBasis` / `rejectSendingBasis`, the review page and list, `reviewAuthority`/`canApproveEvidence`/`canRejectEvidence`, `APPROVAL_REQUIRED_KINDS`, `ALLOW_SUPER_ADMIN_SELF_REVIEW`, the `approve_casl_evidence` capability, same-person independence (`person.ts`, `setPersonKey`, the Team "same-person links" panel), the pending-review queue, `PENDING_REVIEW` as a produced status and readiness state. A basis a person records still needs structured evidence (completeness is checked by rule; incomplete records are refused); a complete one is stored `AUTO_SUPPORTED`.
Kept (history is never rewritten): every existing `APPROVED / REJECTED / PENDING_REVIEW / LEGACY_UNREVIEWED / NOT_REQUIRED` row, `reviewedBy*`, audit events, and the `User.personKey` column (unused). A historic `APPROVED` basis is still honoured by the strict automation reading and is never replaced by a newer automated row. A historic `PENDING_REVIEW` row (never approved) authorises nothing and reads as *pending evidence*.

## 7. Safety boundary
* `AUTO_SUPPORTED` is valid only when `autoCaslActive` is true **and** `autoCaslRuleVersion` equals the current `CASL_RULE_VERSION` — for every send path (composer, enrollment, sequence worker, dispatcher, eligibility), including manual sends. Any rule change silently returns to "not activated".
* Before activation, a SUPPORTED contact is **EVIDENCE_SUPPORTED** (readiness), counted and visible, never READY and never send-authorized.
* Nothing in this pipeline enrols, schedules, sends or touches a send switch/cap; the evidence stage has its own switch (`evidenceEnabled`) beneath the automation master switch.

## 8. Activation (owner action, after legal review)
1. Counsel reviews sections 2–5 against the primary CRTC texts and signs off the rule set (or asks for changes → bump `CASL_RULE_VERSION`).
2. Review a sample of real SUPPORTED assessments (URL + snippet are stored) and the aggregate counts on *Lead Radar → Automation*.
3. A Super Admin types the confirmation phrase in *Automation → Automated CASL policy → Activate*. The action is audited (`AUTO_CASL_POLICY_ACTIVATED`); deactivation is one click and immediate.
4. Activation changes no send switch. Sending, the pilot, sequences and every cap remain separately OFF until the owner turns them on.

## 9. Operating cost
Per candidate address: ≤ 4 pages + robots.txt = ≤ 6 requests, ≤ 400 KB per page, 6 s per request, 15 s wall, one attempt per request, concurrency 4, 25 candidates per tick (every 15 min) ⇒ ≤ 2,400 candidates/day, ≈ 100 requests and ≈ 40 MB/tick worst case; typical shop: robots + 1–2 pages (≈ 0.3 MB). Storage per assessment: one ~1 KB row (snippet ≤ 300 chars, hash, JSON conditions); no HTML is kept. No AI is used anywhere in the engine.

## 10. Known limits
DNS-rebinding window between the address check and the connection; restrictions on unread pages; sites that render contact data with JavaScript only (INSUFFICIENT); aggregated multi-business sites; a franchise site shared by many shops (the independent-repair ICP gate excludes confirmed chains); English/French patterns only; relevance of generic mailboxes to a software pitch is a policy judgment that counsel must confirm.
