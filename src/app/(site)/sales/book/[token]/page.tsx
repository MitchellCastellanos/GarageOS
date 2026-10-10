import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { loadBookingPage } from "@/lib/sales-comms/public-booking";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { BookingClient } from "@/components/sales-comms/BookingClient";
import { PublicShell, publicMeta } from "@/components/sales-comms/PublicShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "GarageOS", ...publicMeta };

export default async function PublicBookingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { token } = await params;
  const { lang } = await searchParams;
  const h = await headers();
  const accept = (h.get("accept-language") ?? "").toLowerCase();
  const browser: "EN" | "FR" = accept.startsWith("fr") || /^[^;]*\bfr\b/.test(accept.split(",")[0] ?? "") ? "FR" : "EN";
  const r = await loadBookingPage(token, clientIpFromHeaders(h), browser);
  const forced = lang === "fr" ? "FR" : lang === "en" ? "EN" : null;
  if (!r.ok) {
    const t = commsCopy(forced === "FR" || (!forced && browser === "FR") ? "fr" : "en").pub;
    return <PublicShell><div role="alert" className="space-y-2 text-center"><h1 className="text-lg font-semibold text-slate-900">{r.error === "RATE_LIMITED" ? t.rateLimited : t.notFoundTitle}</h1>{r.error !== "RATE_LIMITED" && <p className="text-sm text-slate-600">{t.notFoundBody}</p>}</div></PublicShell>;
  }
  const p = r.page;
  return (
    <PublicShell>
      <BookingClient token={token} sellerName={p.sellerName} sellerTitle={p.sellerTitle} types={p.types} durations={p.durations} defaultDuration={p.defaultDuration} defaultLanguage={p.defaultLanguage} initialLanguage={forced ?? p.defaultLanguage} />
    </PublicShell>
  );
}
