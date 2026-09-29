import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/access";
import { can } from "@/lib/subscription";
import { ADMIN } from "@/lib/routes";
import { getAppUrl } from "@/config/app";
import { completeQuickBooksOAuth } from "@/lib/quickbooks/connection";

const back = (code: string) => NextResponse.redirect(`${getAppUrl()}${ADMIN.settings}?tab=integrations&qbo=${code}`);

/**
 * Callback de Intuit. La sesión del dueño debe coincidir con la que inició el flujo (state ligado a
 * taller + usuario, un solo uso, 10 min). El realmId viaja en la query; los tokens nunca se muestran.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.shopId) return NextResponse.redirect(`${getAppUrl()}${ADMIN.login}`);
  if (!(await getEffectivePermissions(session as never)).has("settings.manage")) return back("forbidden");
  if (!(await can(session.user.shopId, "quickbooks.sync"))) return back("upgrade");

  const q = new URL(request.url).searchParams;
  const result = await completeQuickBooksOAuth({
    session: { userId: session.user.id, shopId: session.user.shopId },
    code: q.get("code"),
    state: q.get("state"),
    realmId: q.get("realmId"),
    error: q.get("error"),
  });
  return back(result.ok ? "connected" : result.reason);
}
