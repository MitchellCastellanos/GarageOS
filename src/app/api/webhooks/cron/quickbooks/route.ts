import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { runQuickBooksSync } from "@/lib/quickbooks/sync";

export const maxDuration = 60;

// Cron diario (vercel.json): sincroniza los talleres con QuickBooks conectado. Cada corrida tiene su
// candado por taller, revisa el plan/estado de suscripción y acota el trabajo (lotes) — lo que no cabe
// se retoma al día siguiente o con "Sincronizar ahora". SEGURIDAD: CRON_SECRET.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deadline = Date.now() + 50_000;
  const connections = await db.quickBooksConnection.findMany({ where: { status: "ACTIVE" }, select: { shopId: true }, orderBy: { lastSyncAt: "asc" } });
  const out: Record<string, string> = {};
  for (const { shopId } of connections) {
    if (Date.now() > deadline) {
      out[shopId] = "DEFERRED";
      continue;
    }
    try {
      const s = await runQuickBooksSync(shopId, { limit: 40 });
      out[shopId] = s.status === "OK" ? `OK synced=${s.invoices.synced + s.payments.synced + s.refunds.synced} errors=${s.invoices.errors + s.payments.errors + s.refunds.errors}` : `${s.status}:${s.reason ?? ""}`;
    } catch (e) {
      console.error("quickbooks cron", shopId, e);
      out[shopId] = "ERROR";
    }
  }
  return NextResponse.json({ shops: connections.length, results: out });
}
