import "server-only";
import crypto from "crypto";
import { render } from "@react-email/render";
import { Resend } from "resend";
import React from "react";
import { db } from "@/lib/db";
import { APP_NAME, getAppUrl } from "@/config/app";
import { VerifyEmailAddressEmail } from "@/emails/VerifyEmailAddressEmail";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_placeholder") return null;
  return new Resend(key);
}

function fromAddress(): string {
  const raw = process.env.EMAIL_FROM_PLATFORM?.trim() || process.env.EMAIL_FROM?.trim();
  if (!raw) throw new Error("EMAIL_FROM_PLATFORM/EMAIL_FROM no configurado — no se puede enviar correo de verificación.");
  return raw.includes("<") ? raw : `"${APP_NAME}" <${raw}>`;
}

/**
 * Genera un token de verificación para `email` y lo manda por correo con un
 * link de confirmación. Reutiliza el modelo VerificationToken (forma
 * estándar de NextAuth: identifier/token/expires), que ya existía en el
 * schema sin ningún flujo que lo usara todavía.
 */
export async function sendVerificationEmail(params: { email: string; name: string }): Promise<void> {
  const { email, name } = params;

  // Un solo token vigente por email — cualquier link viejo deja de servir.
  await db.verificationToken.deleteMany({ where: { identifier: email } });

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MS);
  await db.verificationToken.create({ data: { identifier: email, token, expires } });

  const verifyUrl = `${getAppUrl()}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

  const resend = getResend();
  if (!resend) {
    console.warn(`[email-verification] RESEND_API_KEY no configurada — correo de verificación a ${email} omitido.`);
    return;
  }

  const html = await render(React.createElement(VerifyEmailAddressEmail, { name, verifyUrl }));
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: email,
    subject: `Confirma tu correo — ${APP_NAME}`,
    html,
  });
  if (error) {
    console.error(`[email-verification] Error enviando verificación a ${email}:`, error);
  }
}

export type VerifyEmailResult = "OK" | "INVALID_TOKEN" | "EXPIRED";

/** Consume el token del link de verificación y marca User.emailVerified. */
export async function verifyEmailToken(email: string, token: string): Promise<VerifyEmailResult> {
  const record = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });
  if (!record) return "INVALID_TOKEN";

  await db.verificationToken.delete({
    where: { identifier_token: { identifier: email, token } },
  });

  if (record.expires < new Date()) return "EXPIRED";

  await db.user.updateMany({ where: { email }, data: { emailVerified: new Date() } });
  return "OK";
}

function shopVerificationIdentifier(shopId: string): string {
  return `shop-email:${shopId}`;
}

/**
 * Verificación del "email principal" del taller (Shop.email) — mismo
 * mecanismo que sendVerificationEmail pero con un identifier distinto
 * (`shop-email:<shopId>`) para no chocar con el token de login de un User
 * que use la misma dirección. Se dispara desde updateShopSettings cuando el
 * dueño pone un correo distinto al de su login (ver src/actions/settings.ts).
 */
export async function sendShopEmailVerification(params: { shopId: string; email: string; shopName: string }): Promise<void> {
  const { shopId, email, shopName } = params;
  const identifier = shopVerificationIdentifier(shopId);

  await db.verificationToken.deleteMany({ where: { identifier } });

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MS);
  await db.verificationToken.create({ data: { identifier, token, expires } });

  const verifyUrl = `${getAppUrl()}/api/auth/verify-shop-email?token=${token}&shopId=${shopId}`;

  const resend = getResend();
  if (!resend) {
    console.warn(`[email-verification] RESEND_API_KEY no configurada — correo de verificación de taller a ${email} omitido.`);
    return;
  }

  const html = await render(React.createElement(VerifyEmailAddressEmail, { name: shopName, verifyUrl }));
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: email,
    subject: `Confirma el correo principal de tu taller — ${APP_NAME}`,
    html,
  });
  if (error) {
    console.error(`[email-verification] Error enviando verificación de taller a ${email}:`, error);
  }
}

export async function verifyShopEmailToken(shopId: string, token: string): Promise<VerifyEmailResult> {
  const identifier = shopVerificationIdentifier(shopId);
  const record = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier, token } },
  });
  if (!record) return "INVALID_TOKEN";

  await db.verificationToken.delete({ where: { identifier_token: { identifier, token } } });

  if (record.expires < new Date()) return "EXPIRED";

  await db.shop.update({ where: { id: shopId }, data: { emailVerified: new Date() } });
  return "OK";
}
