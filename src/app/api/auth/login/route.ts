import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { isSafeCallbackPath } from "@/lib/safe-redirect";
import { signIn } from "@/lib/auth";
import { salesStaffStatus } from "@/lib/sales-crm/staff-status";
import { RATE_LIMITS, checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { MARKETING_DICTIONARIES, DEFAULT_MARKETING_LOCALE, type MarketingLocale } from "@/lib/marketing-locale";

function resolveLocale(value: unknown): MarketingLocale {
  return value === "fr" ? "fr" : DEFAULT_MARKETING_LOCALE;
}

function loginRedirect(req: NextRequest, error: string) {
  const url = new URL(ADMIN.login, req.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

function normalizeCallbackUrl(callbackUrl: string): string {
  if (!isSafeCallbackPath(callbackUrl)) return ADMIN.dashboard;
  if (callbackUrl === "/admin" || callbackUrl === PLATFORM.home) {
    return PLATFORM.home;
  }
  if (callbackUrl === "/dashboard" || callbackUrl === ADMIN.dashboard) {
    return ADMIN.dashboard;
  }
  if (
    callbackUrl.startsWith("/") &&
    !callbackUrl.startsWith("/admin") &&
    !callbackUrl.startsWith("/platform") &&
    !callbackUrl.startsWith("/book") &&
    !callbackUrl.startsWith("/api") &&
    !callbackUrl.startsWith("/activate-demo/")
  ) {
    return adminPath(callbackUrl);
  }
  return callbackUrl;
}

export async function POST(req: NextRequest) {
  let email: string;
  let password: string;
  let callbackUrl: string;
  let locale: MarketingLocale;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
    password = (formData.get("password") as string) ?? "";
    callbackUrl = (formData.get("callbackUrl") as string) || ADMIN.dashboard;
    locale = resolveLocale(formData.get("locale"));
  } else {
    const body = await req.json().catch(() => ({}));
    email = (body.email ?? "").trim().toLowerCase();
    password = body.password ?? "";
    callbackUrl = body.callbackUrl || ADMIN.dashboard;
    locale = resolveLocale(body.locale);
  }

  callbackUrl = normalizeCallbackUrl(callbackUrl);

  // Brute-force throttle per client IP (the per-account throttle lives in authorize()).
  const ip = clientIpFromHeaders(req.headers);
  if (!(await checkRateLimit(RATE_LIMITS.loginIp(ip))).allowed) {
    const limited = MARKETING_DICTIONARIES[locale].auth.errors.tooManyAttempts;
    if (contentType.includes("form")) return loginRedirect(req, limited);
    return NextResponse.json({ error: limited }, { status: 429, headers: { "Retry-After": "900" } });
  }

  const isFormRequest = contentType.includes("form");
  const errors = MARKETING_DICTIONARIES[locale].auth.errors;

  // Per-account budget: this route rejects wrong passwords itself (before NextAuth's authorize() runs), so a
  // distributed guessing attack on ONE account must be counted here too.
  if (email && password && !(await checkRateLimit(RATE_LIMITS.loginEmail(email))).allowed) {
    if (isFormRequest) return loginRedirect(req, errors.tooManyAttempts);
    return NextResponse.json({ error: errors.tooManyAttempts }, { status: 429, headers: { "Retry-After": "900" } });
  }

  if (!email || !password) {
    if (isFormRequest) return loginRedirect(req, errors.missingCredentials);
    return NextResponse.json({ error: errors.missingCredentials }, { status: 400 });
  }

  let userRole: string | undefined;
  let isSalesStaff = false;

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, role: true, shopId: true, emailVerified: true },
    });

    if (!user?.passwordHash) {
      if (isFormRequest) return loginRedirect(req, errors.invalidCredentials);
      return NextResponse.json({ error: errors.invalidCredentials }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      if (isFormRequest) return loginRedirect(req, errors.invalidCredentials);
      return NextResponse.json({ error: errors.invalidCredentials }, { status: 401 });
    }

    // El dueño no puede entrar hasta confirmar su correo (ver src/lib/auth.ts,
    // que bloquea esto también a nivel del provider) — lo mandamos a la
    // pantalla de espera con opción de reenviar, en vez de un error genérico.
    if (user.role === "OWNER" && !user.emailVerified) {
      if (isFormRequest) {
        const url = new URL(ADMIN.verifyEmailSent, req.url);
        url.searchParams.set("email", email);
        return NextResponse.redirect(url, { status: 303 });
      }
      return NextResponse.json({ error: errors.emailNotVerified }, { status: 403 });
    }

    // Platform sales staff (no shop): only ACTIVE accounts sign in; they land in the Sales Workspace.
    if (!user.shopId && user.role !== "SUPER_ADMIN") {
      const staffStatus = await salesStaffStatus(user.id);
      if (staffStatus && staffStatus !== "ACTIVE") {
        if (isFormRequest) return loginRedirect(req, errors.invalidCredentials);
        return NextResponse.json({ error: errors.invalidCredentials }, { status: 401 });
      }
      isSalesStaff = staffStatus === "ACTIVE";
    }

    userRole = user.role;
  } catch (err) {
    console.error("[/api/auth/login] db error:", err);
    if (isFormRequest) return loginRedirect(req, errors.connectionError);
    return NextResponse.json({ error: errors.connectionError }, { status: 500 });
  }

  const salesLanding = isSalesStaff && !callbackUrl.startsWith(PLATFORM.sales) ? PLATFORM.sales : callbackUrl;
  const destination = userRole === "SUPER_ADMIN" ? PLATFORM.home : isSalesStaff ? salesLanding : callbackUrl;

  try {
    await signIn("credentials", { email, password, redirect: false, redirectTo: destination });
  } catch (err) {
    console.error("[/api/auth/login] signIn error:", err);
    if (isFormRequest) return loginRedirect(req, errors.sessionError);
    return NextResponse.json({ error: errors.sessionError }, { status: 500 });
  }

  if (isFormRequest) {
    return NextResponse.redirect(new URL(destination, req.url), { status: 303 });
  }
  return NextResponse.json({ ok: true });
}
