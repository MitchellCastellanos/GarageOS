import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { ADMIN } from "@/lib/routes";

const signupSchema = z.object({
  shopName: z.string().trim().min(1, "Ingresa el nombre de tu taller").max(100),
  name: z.string().trim().min(1, "Ingresa tu nombre").max(100),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

function signupRedirect(req: NextRequest, error: string) {
  const url = new URL(ADMIN.signup, req.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const parsed = signupSchema.safeParse({
    shopName: formData.get("shopName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Datos inválidos";
    return signupRedirect(req, message);
  }

  const { shopName, name, email, password } = parsed.data;

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return signupRedirect(req, "Ese correo ya tiene una cuenta. Inicia sesión.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.$transaction(async (tx) => {
      const shop = await tx.shop.create({ data: { name: shopName } });
      await tx.user.create({
        data: {
          shopId: shop.id,
          name,
          email,
          passwordHash,
          role: "OWNER",
        },
      });
    });
  } catch (err) {
    console.error("[/api/auth/signup] error:", err);
    return signupRedirect(req, "Error al crear tu cuenta. Intenta de nuevo.");
  }

  try {
    await signIn("credentials", { email, password, redirect: false, redirectTo: ADMIN.dashboard });
  } catch (err) {
    console.error("[/api/auth/signup] signIn error:", err);
    // La cuenta ya quedó creada; que inicie sesión manualmente.
    const url = new URL(ADMIN.login, req.url);
    url.searchParams.set("error", "Cuenta creada. Inicia sesión para continuar.");
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.redirect(new URL(ADMIN.dashboard, req.url), { status: 303 });
}
