import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { resolveUnsubscribeToken } from "@/lib/sales-comms/unsubscribe";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { UnsubscribeClient } from "@/components/sales-comms/UnsubscribeClient";
import { PublicShell, publicMeta } from "@/components/sales-comms/PublicShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "GarageOS", ...publicMeta };

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { token } = await params;
  const { lang } = await searchParams;
  const r = await resolveUnsubscribeToken(decodeURIComponent(token), clientIpFromHeaders(await headers()));
  const language: "EN" | "FR" = r.ok ? (lang === "fr" ? "FR" : lang === "en" ? "EN" : r.language) : lang === "fr" ? "FR" : "EN";
  const t = commsCopy(language === "FR" ? "fr" : "en").pub;
  return (
    <PublicShell>
      {r.ok ? <UnsubscribeClient token={decodeURIComponent(token)} lang={language} masked={r.masked} already={r.already} />
        : <div role="alert" lang={language.toLowerCase()} className="space-y-2 text-center"><h1 className="text-lg font-semibold">{t.unsubTitle}</h1><p className="text-sm text-slate-600">{r.error === "RATE_LIMITED" ? t.rateLimited : t.unsubInvalid}</p></div>}
    </PublicShell>
  );
}
