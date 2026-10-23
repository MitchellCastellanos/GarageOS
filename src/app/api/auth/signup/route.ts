import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { RATE_LIMITS, checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { ADMIN } from "@/lib/routes";
import { createPendingSubscription } from "@/lib/subscription";
import { sendVerificationEmail } from "@/lib/email-verification";
import { captureSignupAttribution } from "@/lib/platform/signup-attribution";
import { HANDOFF_QUERY, sanitizeHandoff, signupAttributionEnabled } from "@/lib/analytics/signup-attribution";
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

/** Optional analytics hand-off fields posted by the form (hidden inputs `ho_<name>`); validated again before use, never required. */
function readHandoffFields(formData: FormData): Record<string, string> {
  const raw: Record<string, unknown> = {};
  for (const k of HANDOFF_QUERY) {
    const v = formData.get(`ho_${k}`);
    if (typeof v === "string") raw[k] = v;
  }
  return sanitizeHandoff(raw);
}

function signupRedirect(req: NextRequest, error: string, handoff: Record<string, string> = {}) {
  const url = new URL(ADMIN.signup, req.url);
  url.searchParams.set("error", error);
  // Keep the (validated) hand-off across a validation error so a retry still attributes the account.
  for (const [k, v] of Object.entries(handoff)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const locale = resolveLocale(formData.get("locale"));
  // With the privacy flag off the hand-off is not even read: redirects and behaviour are exactly as before this feature.
  const handoff = signupAttributionEnabled() ? readHandoffFields(formData) : {};
  const errors = MARKETING_DICTIONARIES[locale].auth.errors;

  if (!(await checkRateLimit(RATE_LIMITS.signupIp(clientIpFromHeaders(req.headers)))).allowed) {
    return signupRedirect(req, errors.tooManyAttempts, handoff);
  }

  const parsed = signupSchema(errors).safeParse({
    shopName: formData.get("shopName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? errors.signupError;
    return signupRedirect(req, message, handoff);
  }

  const { shopName, name, email, password } = parsed.data;

  let shopId: string;
  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return signupRedirect(req, errors.emailTaken, handoff);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    shopId = await db.$transaction(async (tx) => {
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
      await createPendingSubscription(tx, shop.id);
      return shop.id;
    });
  } catch (err) {
    console.error("[/api/auth/signup] error:", err);
    return signupRedirect(req, errors.signupError, handoff);
  }

  // Analytics v2 first-touch attribution: AFTER the shop is committed, off by default, and unable to fail the signup (it catches everything).
  const referrer = formData.get("ho_ref");
  await captureSignupAttribution({
    shopId,
    fields: handoff,
    referrerHost: typeof referrer === "string" ? referrer : "",
    formLocale: locale,
    headers: req.headers,
  });

  await sendVerificationEmail({ email, name }).catch((err) =>
    console.error("[/api/auth/signup] sendVerificationEmail falló:", err)
  );

  // El dueño no puede iniciar sesión todavía — src/lib/auth.ts bloquea el
  // login de OWNER hasta que confirme el correo (es el contacto de
  // facturación por defecto). Lo mandamos a la pantalla de espera en vez de
  // autenticarlo.
  const url = new URL(ADMIN.verifyEmailSent, req.url);
  url.searchParams.set("email", email);
  return NextResponse.redirect(url, { status: 303 });
}
