# GarageOS Sales inbound — Cloudflare Email Worker

Receives replies to sales email through the **existing Cloudflare Email Routing** of `garage-os.ca` (MX records stay as they are; Resend Pro and SMTP2GO are not involved) and posts them, HMAC-signed, to `https://www.garage-os.ca/api/sales/inbound/cloudflare`.

Full setup, test and troubleshooting steps: [`docs/sales-inbound-cloudflare.md`](../../docs/sales-inbound-cloudflare.md).

```bash
cd cloudflare/sales-inbound-worker
npm install
npx wrangler login
openssl rand -hex 32                      # generate the shared secret; keep it, you paste it in two places
npx wrangler secret put SALES_INBOUND_SECRET
npx wrangler deploy
```
