// Aislamiento de SMS por taller (Fase 6) — NO ACTIVADO. Ninguna función de este archivo
// se llama desde ningún flujo automático ni botón de UI: aprovisionar una subcuenta +
// número de Twilio cuesta dinero real (renta mensual del número) en cada llamada, así
// que solo debe ejecutarse cuando el usuario lo pida explícitamente con credenciales
// reales, no como parte de un backfill o de onboarding automático.
//
// Sigue el patrón ISV recomendado por Twilio: una subcuenta por taller, con su propio
// número, para aislar reputación/uso/costos entre talleres (ver doc §15).

import twilio from "twilio";
import { db } from "@/lib/db";

function getParentClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio no está configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }
  return twilio(accountSid, authToken);
}

export interface ProvisionedTwilioSubaccount {
  subaccountSid: string;
  phoneNumberSid: string;
  phoneNumber: string;
}

/**
 * Crea una subcuenta de Twilio para el taller y le compra un número local (país por
 * defecto: CA, ver doc §15 sobre no asumir solo EE. UU.). Guarda las credenciales de la
 * subcuenta en SenderIdentity (providerAccountSid/providerPhoneNumberSid) y actualiza la
 * ruta SMS correspondiente — llamar solo bajo confirmación explícita del OWNER.
 */
export async function provisionShopTwilioSubaccount(
  shopId: string,
  purpose: string,
  countryCode: string = "CA"
): Promise<ProvisionedTwilioSubaccount> {
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
  const parent = getParentClient();

  const subaccount = await parent.api.v2010.accounts.create({
    friendlyName: `GarageOS - ${shop.name} (${shopId})`,
  });

  const subClient = twilio(subaccount.sid, subaccount.authToken);

  const available = await subClient.availablePhoneNumbers(countryCode).local.list({
    smsEnabled: true,
    limit: 1,
  });

  if (available.length === 0) {
    throw new Error(`No hay números disponibles en ${countryCode} para esta subcuenta`);
  }

  const purchased = await subClient.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    friendlyName: `${shop.name} — ${purpose}`,
  });

  const identity = await db.senderIdentity.upsert({
    where: { shopId_channel_address: { shopId, channel: "SMS", address: purchased.phoneNumber } },
    update: {
      providerAccountSid: subaccount.sid,
      providerPhoneNumberSid: purchased.sid,
      type: "GARAGEOS_MANAGED",
      status: "ACTIVE",
    },
    create: {
      shopId,
      channel: "SMS",
      address: purchased.phoneNumber,
      displayName: shop.name,
      type: "GARAGEOS_MANAGED",
      status: "ACTIVE",
      providerAccountSid: subaccount.sid,
      providerPhoneNumberSid: purchased.sid,
    },
  });

  await db.communicationRoute.upsert({
    where: { shopId_purpose_channel: { shopId, purpose, channel: "SMS" } },
    update: { senderIdentityId: identity.id },
    create: { shopId, purpose, channel: "SMS", senderIdentityId: identity.id },
  });

  await db.communicationAuditLog.create({
    data: {
      shopId,
      action: "sms_subaccount.provision",
      targetType: "SenderIdentity",
      targetId: identity.id,
      metadata: { subaccountSid: subaccount.sid, phoneNumber: purchased.phoneNumber, purpose },
    },
  });

  return {
    subaccountSid: subaccount.sid,
    phoneNumberSid: purchased.sid,
    phoneNumber: purchased.phoneNumber,
  };
}
