import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { ADMIN } from "@/lib/routes";
import { createDefaultSubscription } from "@/lib/subscription";
import {
  MARKETING_DICTIONARIES,
  DEFAULT_MARKETING_LOCALE,
  type MarketingLocale,
  type MarketingDictionary,
} from "@/lib/marketing-locale";

function resolveLocale(value: unknown): MarketingLocale {
  return value === "fr" ? "fr" : DEFAULT_MARKETING_LOCALE;
}

function signupSchema(errors: MarketingDictionary["auth"]["errors"]) {
  return z.object({
    shopName: z.string().trim().min(1, errors.missingShopName).max(100),
    name: z.string().trim().min(1, errors.missingName).max(100),
    email: z.string().trim().toLowerCase().email(errors.invalidEmail),
    password: z.string().min(8, errors.weakPassword),
  });
}

function signupRedirect(req: NextRequest, error: string) {
  const url = new URL(ADMIN.signup, req.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const locale = resolveLocale(formData.get("locale"));
  const errors = MARKETING_DICTIONARIES[locale].auth.errors;

  const parsed = signupSchema(errors).safeParse({
    shopName: formData.get("shopName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? errors.signupError;
    return signupRedirect(req, message);
  }

  const { shopName, name, email, password } = parsed.data;

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return signupRedirect(req, errors.emailTaken);
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
      await createDefaultSubscription(tx, shop.id);
    });
  } catch (err) {
    console.error("[/api/auth/signup] error:", err);
    return signupRedirect(req, errors.signupError);
  }

  try {
    await signIn("credentials", { email, password, redirect: false, redirectTo: ADMIN.dashboard });
  } catch (err) {
    console.error("[/api/auth/signup] signIn error:", err);
    // La cuenta ya quedó creada; que inicie sesión manualmente.
    const url = new URL(ADMIN.login, req.url);
    url.searchParams.set("error", errors.accountCreatedSignIn);
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.redirect(new URL(ADMIN.dashboard, req.url), { status: 303 });
}
