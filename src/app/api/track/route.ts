import { NextResponse } from "next/server";
import { trackPageView } from "@/lib/platform/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Beacon de pageview de primera parte. Disparado por AnalyticsBeacon en cada
 * cambio de ruta. Nunca bloquea ni le muestra un error al cliente — siempre
 * responde 204, incluso si el payload viene malformado.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
    const userAgent = req.headers.get("user-agent") || "";
    // Vercel setea esto en todo request que llega a un deployment — sin geo-IP de terceros.
    const country = req.headers.get("x-vercel-ip-country") || "";

    await trackPageView({
      path: typeof body.path === "string" ? body.path : "/",
      locale: typeof body.locale === "string" ? body.locale : "en",
      referrer: typeof body.referrer === "string" ? body.referrer : "",
      utmSource: typeof body.utmSource === "string" ? body.utmSource : "",
      utmMedium: typeof body.utmMedium === "string" ? body.utmMedium : "",
      utmCampaign: typeof body.utmCampaign === "string" ? body.utmCampaign : "",
      shopSlug: typeof body.shopSlug === "string" ? body.shopSlug : "",
      ip,
      userAgent,
      country,
    });
  } catch {
    // swallow — el tracking nunca debe romper la página
  }
  return new NextResponse(null, { status: 204 });
}
