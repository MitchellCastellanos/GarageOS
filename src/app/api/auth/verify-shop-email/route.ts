import { NextRequest, NextResponse } from "next/server";
import { verifyShopEmailToken } from "@/lib/email-verification";
import { ADMIN } from "@/lib/routes";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const shopId = req.nextUrl.searchParams.get("shopId");

  const url = new URL(ADMIN.settings, req.url);
  url.searchParams.set("tab", "general");

  if (!token || !shopId) {
    url.searchParams.set("verifyShopEmail", "invalid");
    return NextResponse.redirect(url, { status: 303 });
  }

  const result = await verifyShopEmailToken(shopId, token);
  url.searchParams.set("verifyShopEmail", result === "OK" ? "success" : result === "EXPIRED" ? "expired" : "invalid");
  return NextResponse.redirect(url, { status: 303 });
}
