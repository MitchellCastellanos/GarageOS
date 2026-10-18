# REMOTE email pilot — operator checklist (read-only audit)

Purpose: decide GO / NO-GO for the first controlled REMOTE email pilot **without sending, enrolling, or changing any switch**.
Nothing in this checklist enables Automated Outreach, Release or Pilot, and nothing touches the national rollout.

Files: [`remote-pilot-readonly.sql`](remote-pilot-readonly.sql) (eight read-only blocks, enforced by `BEGIN READ ONLY … ROLLBACK`; guarded by `tests/remote-pilot-sql.test.ts`).
Its output holds **no email addresses, phone numbers or contact names** — only counts, flags, ids, business names/cities and the seller's display name.

## 1. Run it in Neon Production

1. Neon console → the GarageOS project → select the **production** (primary) branch. Do **not** use the preview/`garageos_replay` branch or any reference copy.
2. Open **SQL Editor**, paste the contents of `remote-pilot-readonly.sql`.
3. Run **one block at a time**: select a block's text (from `BEGIN READ ONLY;` to `ROLLBACK;`) and press *Run selected*. Blocks are `Q1`…`Q8`.
4. Sanity check you are on production: `Q1` lists your real Sales Rep identity and `Q3` shows your real switch values. If `Q1` is empty or shows test names, stop — wrong branch.
5. If the editor rejects `BEGIN READ ONLY`/`ROLLBACK`, delete those two lines in that block — the statement is still a single `SELECT`.

## 2. What to share back

Share these result tables (copy as text/CSV). They are safe: no personal contact data.

| Block | Share | Why |
|---|---|---|
| Q1 | whole table | sender identity `ACTIVE`, `inboundVerifiedAt` set, `bookingEnabled` true |
| Q2 | whole table | the reply sits in the **same `threadId`** as the outbound test, linked to the prospect/contact |
| Q3 | the row | `automatedSendingEnabled = false`, `pilotEnabled = false`, rollout not halted |
| Q4 | the row | `queued_outbound`, `active_sequences`, `live_enrollments` must all be 0 |
| Q6 | the row | the funnel counts |
| Q7 | whole table | why the rest are not eligible |
| Q8 | whole table | the pilot shortlist (up to 20) |
| Q5 | only if non-empty | existing enrollments |

Do **not** paste emails, phone numbers, API keys, connection strings or screenshots of contact records.

## 3. Create the inactive 3-step EN/FR pilot sequence

One sequence serves both languages: each message uses the contact's language (never defaulted).

1. Sales → **Outreach** → **Sequences** → new sequence (Super Admin).
2. Name: `REMOTE email pilot (EN/FR)`. *Business days only*: **on**.
3. Steps (template · day offset): **Initial introduction** · 0 → **First follow-up** · 3 → **Second follow-up** · 8.
4. Save. Leave the status **Draft**. **Do not press Activate**, do not enroll anyone, do not set it as the Lead Radar pilot sequence.
5. Verify: the sequence shows 3 steps and status Draft. (Activation requires both languages to resolve; that check runs only when someone activates.)

## 4. GO / NO-GO

**GO** only if **every** line holds:

- [ ] Q1: the sender is `ACTIVE`, `inboundVerifiedAt` is set, `bookingEnabled` is true.
- [ ] Q2: the Hotmail reply is in the same thread as the outbound email and linked to the test prospect/contact.
- [ ] Q3: `automatedSendingEnabled = false`, `pilotEnabled = false`; the national rollout is not halted.
- [ ] Q4: all three counts are 0.
- [ ] Q8: **at least 10** shortlist rows with `has_seller`, `language_known` and `basis_ok` all true, `suppressed` false, `possible_duplicates` = 0 and `self_reviewed` not true. Rows with `role_mailbox`/`free_mailbox` true need a human decision before inclusion.
- [ ] (Superseded: second-person approval was withdrawn — every shortlisted basis is either a historic `APPROVED` row or `AUTO_SUPPORTED` evidence under the **activated** automated CASL policy; see docs/compliance/automated-casl-evidence.md.) Formerly: every shortlisted basis was approved by a **second person** — a basis the same user recorded and approved (`self_reviewed` true in Q8, counted in Q6 `basis_self_approved`) does not count — and since PR-1 that includes **another account of the same person** (accounts sharing a `personKey`, set by a Super Admin under *Team → Same-person links*). Q6 `with_valid_basis` / Q8 `basis_ok` now require an **APPROVED** basis of an automation-allowed kind (published address, disclosed address, express consent); legacy/`NOT_REQUIRED`/`EXEMPT` rows are listed separately in `basis_manual_only` because they can back a person's own manual email but never an automated sequence. A published address is never consent by itself.
- [ ] The Draft sequence exists (section 3).
- [ ] A lawyer has reviewed the templates and the CASL basis rules.

**NO-GO** if any box is unchecked — typical causes: fewer than 10 ready rows, unknown language, basis still `PENDING_REVIEW`, self-approved evidence, anything queued or active in Q4, or the reply not threaded.

If GO, the **owner** (not this checklist) then: turns Automated Outreach on, activates the sequence, sets it as the pilot sequence with small caps (suggest ≤ 5/day, ≤ 20 total), and enables the Pilot — each an explicit, audited Super Admin action. Turn Automated Outreach off again to stop everything immediately.
