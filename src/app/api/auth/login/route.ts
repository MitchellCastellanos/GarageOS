import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signIn } from "@/lib/auth";
import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

export const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? Date.now().toString(36);

function loginRedirect(req: NextRequest, error: string) {
  const url = new URL(ADMIN.login, req.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

function normalizeCallbackUrl(callbackUrl: string): string {
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
    !callbackUrl.startsWith("/api")
  ) {
    return adminPath(callbackUrl);
  }
  return callbackUrl;
}

export async function POST(req: NextRequest) {
  let email: string;
  let password: string;
  let callbackUrl: string;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
    password = (formData.get("password") as string) ?? "";
    callbackUrl = (formData.get("callbackUrl") as string) || ADMIN.dashboard;
  } else {
    const body = await req.json().catch(() => ({}));
    email = (body.email ?? "").trim().toLowerCase();
    password = body.password ?? "";
    callbackUrl = body.callbackUrl || ADMIN.dashboard;
  }

  callbackUrl = normalizeCallbackUrl(callbackUrl);

  const isFormRequest = contentType.includes("form");

  if (!email || !password) {
    if (isFormRequest) return loginRedirect(req, "Ingresa tu email y contraseña");
    return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
  }

  let userRole: string | undefined;

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { passwordHash: true, role: true },
    });

    if (!user?.passwordHash) {
      if (isFormRequest) return loginRedirect(req, "Email o contraseña incorrectos");
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      if (isFormRequest) return loginRedirect(req, "Email o contraseña incorrectos");
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    userRole = user.role;
  } catch (err) {
    console.error("[/api/auth/login] db error:", err);
    if (isFormRequest) return loginRedirect(req, "Error de conexión. Intenta de nuevo.");
    return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
  }

  const destination = userRole === "SUPER_ADMIN" ? PLATFORM.home : callbackUrl;

  try {
    await signIn("credentials", { email, password, redirect: false, redirectTo: destination });
  } catch (err) {
    console.error("[/api/auth/login] signIn error:", err);
    if (isFormRequest) return loginRedirect(req, "Error al crear la sesión. Intenta de nuevo.");
    return NextResponse.json({ error: "Error de sesión" }, { status: 500 });
  }

  if (isFormRequest) {
    return NextResponse.redirect(new URL(destination, req.url), { status: 303 });
  }
  return NextResponse.json({ ok: true });
}
