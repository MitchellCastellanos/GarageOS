import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/email-verification";
import { ADMIN } from "@/lib/routes";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const email = req.nextUrl.searchParams.get("email");

  const url = new URL(ADMIN.settings, req.url);
  url.searchParams.set("tab", "team");

  if (!token || !email) {
    url.searchParams.set("verifyEmail", "invalid");
    return NextResponse.redirect(url, { status: 303 });
  }

  const result = await verifyEmailToken(email, token);
  url.searchParams.set("verifyEmail", result === "OK" ? "success" : result === "EXPIRED" ? "expired" : "invalid");
  return NextResponse.redirect(url, { status: 303 });
}
