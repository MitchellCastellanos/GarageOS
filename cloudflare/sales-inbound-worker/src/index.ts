// GarageOS Sales inbound Email Worker.
// Email Routing → this Worker → POST (HMAC-signed) → https://<app>/api/sales/inbound/cloudflare
// Only the single "replies" address is routed here; every other Email Routing rule of the domain is untouched.
import PostalMime from "postal-mime";
import { MAX_RAW_BYTES, buildPayload, sign } from "./lib";

export interface Env {
  SALES_INBOUND_URL: string;        // var:    https://www.garage-os.ca/api/sales/inbound/cloudflare
  SALES_INBOUND_SECRET: string;     // secret: same value as the SALES_INBOUND_SECRET variable in Vercel (>= 32 chars)
  FALLBACK_FORWARD_TO?: string;     // var (optional): a VERIFIED destination address that receives the message if GarageOS is unreachable
}

async function post(env: Env, body: string): Promise<Response> {
  const ts = String(Math.floor(Date.now() / 1000));
  return fetch(env.SALES_INBOUND_URL, {
    method: "POST", body, signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", "x-garageos-timestamp": ts, "x-garageos-signature": await sign(env.SALES_INBOUND_SECRET, ts, body) },
  });
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    // Never lose a reply: any failure forwards to the fallback mailbox (when configured) or rejects so the sender sees a bounce.
    const fail = async (why: string) => {
      console.error(`[sales-inbound] ${why}`);
      if (env.FALLBACK_FORWARD_TO) { try { await message.forward(env.FALLBACK_FORWARD_TO); return; } catch (e) { console.error("[sales-inbound] fallback forward failed", String(e)); } }
      message.setReject("Temporary failure, please resend your message in a few minutes.");
    };
    if (message.rawSize > MAX_RAW_BYTES) return fail(`message too large (${message.rawSize} bytes)`);
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      const mail = await PostalMime.parse(raw);
      const body = JSON.stringify(buildPayload({ from: message.from, to: message.to, rawSize: message.rawSize, headers: message.headers }, mail));
      let res = await post(env, body);
      if (res.status >= 500 || res.status === 429) { await new Promise((r) => setTimeout(r, 1500)); res = await post(env, body); } // one retry; the server is idempotent
      if (!res.ok) return fail(`GarageOS answered ${res.status}`);
    } catch (e) {
      return fail(`exception: ${e instanceof Error ? e.name : "unknown"}`);
    }
  },
} satisfies ExportedHandler<Env>;
