import { NextResponse } from "next/server";
import { trackPageView } from "@/lib/platform/analytics";
import { isAllowedTrackOrigin, parseTrackPayload, readBoundedBody, TRACK_MAX_BODY_BYTES } from "@/lib/platform/track-guard";
import { isTrackingOptOut } from "@/lib/privacy/opt-out";
import { checkRateLimit, clientIpFromHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

/**
 * Beacon de pageview de primera parte. Disparado por AnalyticsBeacon en cada cambio de ruta. Nunca bloquea ni le
 * muestra un error al cliente: SIEMPRE responde 204 (opt-out, origen ajeno, cuerpo grande, JSON inválido, ruta
 * privada, límite de tasa…), así no se revela ningún límite ni motivo. Orden: DNT/GPC → origen → tamaño declarado →
 * límite por IP → lectura acotada (2 KB) → validación → (bots y guardas de ruta dentro de trackPageView).
 */
export async function POST(req: Request) {
  try {
    // DNT / GPC: no se registra nada (comprobado en el servidor, así vale aunque cambie el script del cliente).
    if (isTrackingOptOut(req.headers)) return NO_CONTENT();
    if (!isAllowedTrackOrigin(req.headers)) return NO_CONTENT();
    const declared = req.headers.get("content-length");
    if (declared !== null && !(Number(declared) <= TRACK_MAX_BODY_BYTES)) return NO_CONTENT();

    const ip = clientIpFromHeaders(req.headers);
    const limit = await checkRateLimit(RATE_LIMITS.trackIp(ip));
    if (!limit.allowed) return NO_CONTENT();

    const raw = await readBoundedBody(req);
    if (raw === null) return NO_CONTENT();
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NO_CONTENT();
    }
    const payload = parseTrackPayload(json);
    if (!payload) return NO_CONTENT();

    await trackPageView({
      ...payload,
      ip,
      userAgent: req.headers.get("user-agent") || "",
      // Vercel setea esto en todo request que llega a un deployment — sin geo-IP de terceros.
      country: req.headers.get("x-vercel-ip-country") || "",
    });
  } catch (err) {
    // swallow — el tracking nunca debe romper la página. Se registra solo el tipo de error, nunca el payload.
    console.error("[api/track] error:", err instanceof Error ? err.name : "unknown");
  }
  return NO_CONTENT();
}
