# Sales CRM inbound replies — Cloudflare Email Routing + Email Worker

**Why this design.** Resend receiving needs Resend's MX (Pro, and it would replace the domain's current MX). Cloudflare already routes `garage-os.ca` mail, so replies to sales email are captured there: **Email Routing → Email Worker → authenticated GarageOS endpoint → Sales Inbox.** Nothing about SMTP2GO, the MX records, shop email (invoices, quotes, appointments, reminders, shop senders) or the Resend webhook changes.

## What Cloudflare actually supports (checked in Cloudflare's docs)
- **Subaddressing** (`replies+key@garage-os.ca`) works once enabled at *Email Routing → Settings*; the `+key` is ignored for rule matching but preserved in `message.to` — this is what GarageOS uses for threading. An existing rule for a specific `user+detail@` address wins over `user@`.
- A routing rule's action can be **Send to a Worker**; one rule maps one address pattern to one destination. Rules are matched per address, so a dedicated `replies@` rule does not touch any other rule or the catch-all.
- Limits: inbound **25 MiB** max per message; on the Workers **Free** plan a heavy parse can hit CPU limits (the Worker refuses to parse >10 MiB and forwards to a fallback mailbox instead); the Worker can only `forward()` to **verified** destination addresses.
- Email Routing delivers only mail that passes Cloudflare's sender-authentication checks; GarageOS additionally drops a message whose `Authentication-Results` shows DMARC fail (or SPF and DKIM both failing).

## How a reply travels
1. GarageOS sends with `From: <agent>@garage-os.ca` (Resend, verified domain) and **`Reply-To: replies+<threadKey>@garage-os.ca`**.
2. The recipient replies (e.g. from Hotmail) → Cloudflare Email Routing rule `replies@garage-os.ca` → Worker `garageos-sales-inbound`.
3. The Worker parses the MIME (postal-mime), keeps only a **header whitelist**, caps sizes, reports attachments as **metadata only**, signs the JSON body (`HMAC-SHA256(secret, "<unix-ts>.<body>")`) and POSTs it.
4. `/api/sales/inbound/cloudflare` verifies the signature (±5 min, constant-time, fails closed without a ≥32-char secret), enforces a 1 MiB body cap, validates a strict schema, checks the recipient domain and sender authentication, then reuses the existing Sales processor: thread match (reply key → `In-Reply-To`/`References` → guarded subject match), dedupe (`cf:` + Message-ID/content hash, unique), CRM contact link, **stops the sequence on a real reply** (not on out-of-office), logs the activity, proves the reply path (`inboundVerifiedAt`), notifies the seller. It only writes Sales tables.
5. If GarageOS is down the Worker retries once, then **forwards the message to `FALLBACK_FORWARD_TO`** (if set) or rejects with a temporary-failure bounce — a reply is never silently lost.

## One-time setup (exact steps)
**A. Cloudflare → Email Routing (dashboard → your account → `garage-os.ca` → Email → Email Routing)**
1. *Settings* → turn **Subaddressing** ON. (Existing rules are unaffected.)
2. *Routing rules* → check that there is **no existing rule for `replies@garage-os.ca`**. If there is, choose another local part (e.g. `ventas-replies`) and use it everywhere below instead of `replies`.
3. **Do not edit the catch-all or any existing rule.**

**B. Deploy the Worker** (on a machine with Node 22+ and access to your Cloudflare account)
```bash
cd cloudflare/sales-inbound-worker
npm install
npx wrangler login
openssl rand -hex 32                                 # → the shared secret (keep it private)
npx wrangler secret put SALES_INBOUND_SECRET         # paste the secret
# optional: deliver to a verified inbox if GarageOS is unreachable
#   edit wrangler.jsonc → "vars": { ..., "FALLBACK_FORWARD_TO": "you@example.com" }  (must be a VERIFIED destination address in Email Routing)
npx wrangler deploy
```
Check `SALES_INBOUND_URL` in `wrangler.jsonc` is your production origin.

**C. Cloudflare → Email Routing → Routing rules → Create routing rule**
- Custom address: `replies` @ `garage-os.ca`
- Action: **Send to a Worker** → `garageos-sales-inbound`
- Save. (Do not use `wrangler`'s `addresses` option: the single rule is created by hand so nothing else can be changed.)

**D. Vercel → project `garage-os` → Settings → Environment Variables (Production)**
- `SALES_INBOUND_SECRET` = the **same** secret as in step B. Redeploy (or push any commit) so it is picked up.

**E. GarageOS → Super Admin → Sales → Communications (settings)**
- *How replies arrive*: **Cloudflare Email Routing + Worker**
- *Inbound (reply) domain*: `garage-os.ca`
- *Shared reply mailbox*: `replies`
- *Approved sender domains*: `garage-os.ca` (and `mail.garage-os.ca` if used). Fill legal name + mailing address, **turn the master switch ON**, then Save.
- The identity checklist must show every row green except "A real reply has arrived", which turns green by itself on the first real reply.

## First real round trip (Hotmail)
1. **Outbound only, no CRM needed** (verifies Resend + DNS alignment; prints the Resend message id, never the key). On your machine, with your Resend key in the environment:
   ```bash
   RESEND_API_KEY=… node scripts/sales-outbound-smoke.mjs --check-only
   RESEND_API_KEY=… node scripts/sales-outbound-smoke.mjs \
     --from "GarageOS Test <test@garage-os.ca>" --to mitchell.castellanos@hotmail.com \
     --reply-to replies+smoke@garage-os.ca
   ```
   It refuses to send unless the From domain is *verified* in Resend, sends exactly one `[GarageOS TEST]` message and polls its status until `delivered`/`bounced`. Check the message in Hotmail (inbox or junk) and that it shows as authenticated (SPF/DKIM pass).
2. **From GarageOS:** Settings → Sales communications → *Internal test recipient* → enter `mitchell.castellanos@hotmail.com` (requires `SALES_TEST_RECIPIENTS` in Vercel, or use your own login address) → open the test prospect → write the commercial email in the composer (Send now).
3. **Reply from Hotmail** to that email. Within seconds it appears in **Sales → Inbox**, in the same thread, "needs reply"; the sequence (if any) stops; the identity row "A real reply has arrived" turns green.
4. Optional: click the unsubscribe link in the footer, then verify a further send to that address is blocked.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| Reply bounces at Hotmail | Routing rule missing/disabled, Subaddressing off, or the local part differs from *Shared reply mailbox* |
| Nothing in the Inbox, Worker log shows `GarageOS answered 401` | Secret differs between Worker and Vercel (or not redeployed) |
| `409` | Settings → *How replies arrive* is not Cloudflare |
| `status: unrouted` in the Worker logs / "unrouted" counter in settings | Reply without the thread key and without matching `In-Reply-To`; link it manually from the activity list |
| Message arrives in your fallback inbox instead | GarageOS was unreachable or returned 5xx; check `npx wrangler tail` and the Vercel runtime logs |

`npx wrangler tail` (in the Worker folder) shows live Worker logs; Cloudflare → Email Routing → *Activity log* shows each routed message.

## Security properties (tested in `tests/sales-inbound-cloudflare*.test.ts`)
Own secret and signature format (never the Resend/Svix secret); fail-closed without a ≥32-char secret; ±5 min replay window and a unique-id dedupe; 1 MiB body cap before parsing; strict schema and per-field caps; header whitelist; attachments never stored on this path (a note is added to the thread); spoof guard (DMARC fail ignored, self-sender ignored); generic 401 body; per-IP rate limit; no import of any shop-communication module.
