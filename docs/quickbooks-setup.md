# QuickBooks Online — setup and behaviour (Block 10)

QuickBooks Online is a **Pro+** feature (`quickbooks.sync`). GarageOS **pushes** customers, invoices, payments and refunds to the shop's QuickBooks Online company. Nothing is read back and GarageOS never becomes a ledger.

## Manual configuration (cannot be done from the repo)

1. **Intuit developer account / app** — https://developer.intuit.com → create an app with the **QuickBooks Online Accounting** scope (`com.intuit.quickbooks.accounting`).
2. **Redirect URI** (Keys & credentials → *Redirect URIs*, once for Development and once for Production keys):
   `https://<your-app-host>/api/integrations/quickbooks/callback` (must match `NEXT_PUBLIC_APP_URL`, or set `QBO_REDIRECT_URI`).
3. **Environment variables** (Vercel → Project → Settings → Environment Variables; see `.env.example`):

   | Variable | Value |
   | --- | --- |
   | `QBO_CLIENT_ID` | Client ID for the environment you're using |
   | `QBO_CLIENT_SECRET` | Client secret for the same environment |
   | `QBO_ENVIRONMENT` | `sandbox` (default) or `production` |
   | `QBO_REDIRECT_URI` | Optional override (see above) |
   | `INTEGRATIONS_ENCRYPTION_KEY` | `openssl rand -base64 32` — encrypts every shop's OAuth tokens (AES-256-GCM, bound to the shop id). **Back it up**; losing/rotating it means every shop must reconnect. |
   | `CRON_SECRET` | Already used by the other crons; the daily sync at 10:00 UTC (`vercel.json`) uses it. |

4. **Production access** — Intuit requires the app to complete their *production questionnaire / app assessment* (privacy policy + EULA URLs, security answers) before production keys can connect real customer companies. Sandbox keys work immediately with an Intuit sandbox company (developer.intuit.com → Sandbox).
5. **Migration** `20261001120000_quickbooks_online` (additive) runs automatically on deploy.

Until steps 1–3 are done the Integrations tab shows "not set up on this installation" (the connect flow refuses to start) — nothing else in GarageOS is affected.

## How a shop uses it

Settings → **QuickBooks** (owner only) → *Connect to QuickBooks* → approve in Intuit → back in GarageOS:

1. **Load options from QuickBooks**, then choose the *income account*, the *bank account* (payments/refunds), the *tax code* for taxed invoices (e.g. the company's GST/QST code) and optionally a tax code for tax-free invoices. Choose *Sync invoices issued since* (defaults to the connection day; older invoices are never sent).
2. **Sync now** (or wait for the daily cron). Work is batched (25 invoices per manual run, 40 per cron run) — the card says how many are still waiting.
3. **Needs attention** lists failed items with the QuickBooks error, attempt count and next automatic retry; **Retry failed** retries immediately. Warnings (e.g. QuickBooks computed a different total than GarageOS) are shown without failing the sync.

## What is sent

| GarageOS | QuickBooks | Notes |
| --- | --- | --- |
| Client | Customer | Matched by exact display name; an existing QBO customer is adopted unless already linked to another GarageOS client (then a disambiguated name is created). |
| Invoice (SENT/OVERDUE/PAID, never drafts) | Invoice | `DocNumber` = GarageOS number, lines on `GarageOS Labour / Parts / Other` items (created on your income account), tax excluded + the chosen TaxCode; `PrivateNote = GarageOS:<id>`. Edits update the same QBO invoice (sparse update); voiding in GarageOS voids it in QBO. |
| Payment entry | Payment linked to the invoice | One per method line; QBO payment method matched by name (Credit Card / Cash / Check / Interac…). Reversing a payment in GarageOS deletes it in QBO. |
| Refund | RefundReceipt | Pre-tax base with the same tax code, paid from the chosen bank account. |

QuickBooks **computes the tax** from the tax code (GarageOS's per-line snapshot is the source of truth locally). If totals differ, the invoice is flagged with a warning — check the tax code mapping.

## Safety and idempotency

- Tokens are stored encrypted per shop and never leave the server; the UI receives only status. Refresh tokens rotate on every refresh and the new one is stored atomically; if Intuit rejects the refresh token the connection moves to **Needs reconnect**.
- OAuth `state` is a one-time random nonce stored server-side, bound to shop + user, valid 10 minutes; the callback also requires the same logged-in owner.
- One `QuickBooksSyncRecord` per (shop, company, entity, local id) holds the external id and a content fingerprint: an already-linked entity is **updated, never recreated**, unchanged entities aren't resent, and every create carries a QBO `requestid`. If a response is lost after a create, the retry adopts the invoice it created (matched by `PrivateNote`) — a same-numbered invoice typed by hand in QuickBooks is never touched.
- Reconnecting to a *different* company discards the old mapping; reconnecting to the same company resumes without duplicates.
- Downgrading below Pro or a restricted (unpaid) subscription pauses syncing (cron skips it); the owner can still see status and **Disconnect** (revokes at Intuit, wipes local tokens).

## Known limits (V1)

Push-only (no import from QBO), one company per shop, no per-line tax-name mapping (one QBO tax code per invoice type), payments to QBO "Undeposited Funds" unless a bank account is chosen, refunds need the bank-account mapping, no historical backfill before the chosen start date, payment/refund duplicates after a lost response rely on QBO's `requestid` (24 h window) rather than a lookup. Not testable without Intuit credentials: the live OAuth handshake and QBO-side validation rules — the code is covered against a faithful fake of the documented API.
