import type { AdminLocale } from "@/lib/admin-locale";

/**
 * Matriz de enrutamiento de correo por canal.
 * Ver docs/EMAIL_MATRIX.md para el mapa completo IONOS + Resend.
 */
export type EmailChannel =
  | "INVOICE"
  | "QUOTE"
  | "APPOINTMENT"
  | "REMINDER"
  | "ACCOUNTING"
  | "WEB_CONTACT"
  | "PROVIDERS"
  | "NEWSLETTER";

export type ShopEmailConfig = {
  name: string;
  email?: string | null;
  billingEmail?: string | null;
  infoEmail?: string | null;
  providersEmail?: string | null;
  newsletterEmail?: string | null;
};

type ChannelMeta = {
  label: string;
  description: string;
  shopFromField: keyof ShopEmailConfig | null;
  envFromKey: string | null;
  shopReplyField: keyof ShopEmailConfig | null;
  pipeline: "resend" | "external";
  implemented: boolean;
};

/** Definición de canales — fuente de verdad para UI y resolución. */
export const EMAIL_CHANNEL_META: Record<EmailChannel, ChannelMeta> = {
  INVOICE: {
    label: "Facturas",
    description: "Envío y reenvío de facturas PDF al cliente",
    shopFromField: "infoEmail",
    envFromKey: "EMAIL_FROM_INVOICES",
    shopReplyField: "infoEmail",
    pipeline: "resend",
    implemented: true,
  },
  QUOTE: {
    label: "Cotizaciones",
    description: "Envío y reenvío de cotizaciones PDF al cliente",
    shopFromField: "infoEmail",
    envFromKey: "EMAIL_FROM_INVOICES",
    shopReplyField: "infoEmail",
    pipeline: "resend",
    implemented: true,
  },
  APPOINTMENT: {
    label: "Citas",
    description: "Confirmaciones, recordatorios y cancelaciones de citas",
    shopFromField: "infoEmail",
    envFromKey: "EMAIL_FROM_REMINDERS",
    shopReplyField: "infoEmail",
    pipeline: "resend",
    implemented: true,
  },
  REMINDER: {
    label: "Recordatorios",
    description: "Recordatorios de servicio programados",
    shopFromField: "infoEmail",
    envFromKey: "EMAIL_FROM_REMINDERS",
    shopReplyField: "infoEmail",
    pipeline: "resend",
    implemented: true,
  },
  ACCOUNTING: {
    label: "Contabilidad",
    description: "Aviso a la contadora al subir documentos",
    shopFromField: "infoEmail",
    envFromKey: "EMAIL_FROM_ACCOUNTING",
    shopReplyField: "infoEmail",
    pipeline: "resend",
    implemented: true,
  },
  WEB_CONTACT: {
    label: "Formulario web",
    description: "Contacto desde el website (futuro)",
    shopFromField: "infoEmail",
    envFromKey: "EMAIL_FROM_WEB",
    shopReplyField: "infoEmail",
    pipeline: "resend",
    implemented: false,
  },
  PROVIDERS: {
    label: "Proveedores",
    description: "Comunicación con proveedores (futuro)",
    shopFromField: "providersEmail",
    envFromKey: null,
    shopReplyField: "providersEmail",
    pipeline: "resend",
    implemented: false,
  },
  NEWSLETTER: {
    label: "Newsletter",
    description: "Campañas masivas — usar Brevo/Mailchimp, no Resend",
    shopFromField: "newsletterEmail",
    envFromKey: null,
    shopReplyField: "newsletterEmail",
    pipeline: "external",
    implemented: false,
  },
};

const CHANNEL_LABELS: Record<EmailChannel, Record<AdminLocale, string>> = {
  INVOICE: { es: "Facturas", en: "Invoices", fr: "Factures" },
  QUOTE: { es: "Cotizaciones", en: "Quotes", fr: "Soumissions" },
  APPOINTMENT: { es: "Citas", en: "Appointments", fr: "Rendez-vous" },
  REMINDER: { es: "Recordatorios", en: "Reminders", fr: "Rappels" },
  ACCOUNTING: { es: "Contabilidad", en: "Accounting", fr: "Comptabilité" },
  WEB_CONTACT: { es: "Formulario web", en: "Web form", fr: "Formulaire web" },
  PROVIDERS: { es: "Proveedores", en: "Providers", fr: "Fournisseurs" },
  NEWSLETTER: { es: "Newsletter", en: "Newsletter", fr: "Infolettre" },
};

const CHANNEL_DESCRIPTIONS: Record<EmailChannel, Record<AdminLocale, string>> = {
  INVOICE: {
    es: "Envío y reenvío de facturas PDF al cliente",
    en: "Sending and resending PDF invoices to the client",
    fr: "Envoi et renvoi des factures PDF au client",
  },
  QUOTE: {
    es: "Envío y reenvío de cotizaciones PDF al cliente",
    en: "Sending and resending PDF quotes to the client",
    fr: "Envoi et renvoi des soumissions PDF au client",
  },
  APPOINTMENT: {
    es: "Confirmaciones, recordatorios y cancelaciones de citas",
    en: "Appointment confirmations, reminders, and cancellations",
    fr: "Confirmations, rappels et annulations de rendez-vous",
  },
  REMINDER: {
    es: "Recordatorios de servicio programados",
    en: "Scheduled service reminders",
    fr: "Rappels d'entretien programmés",
  },
  ACCOUNTING: {
    es: "Aviso a la contadora al subir documentos",
    en: "Notice to the accountant when documents are uploaded",
    fr: "Avis au comptable lors du téléversement de documents",
  },
  WEB_CONTACT: {
    es: "Contacto desde el website (futuro)",
    en: "Contact from the website (upcoming)",
    fr: "Contact depuis le site web (à venir)",
  },
  PROVIDERS: {
    es: "Comunicación con proveedores (futuro)",
    en: "Communication with providers (upcoming)",
    fr: "Communication avec les fournisseurs (à venir)",
  },
  NEWSLETTER: {
    es: "Campañas masivas — usar Brevo/Mailchimp, no Resend",
    en: "Mass campaigns — use Brevo/Mailchimp, not Resend",
    fr: "Campagnes de masse — utiliser Brevo/Mailchimp, pas Resend",
  },
};

export function channelLabel(channel: EmailChannel, locale: AdminLocale): string {
  return CHANNEL_LABELS[channel][locale];
}

export function channelDescription(channel: EmailChannel, locale: AdminLocale): string {
  return CHANNEL_DESCRIPTIONS[channel][locale];
}

export interface EmailRoute {
  channel: EmailChannel;
  from: string;
  replyTo: string;
  fromAddress: string;
  pipeline: "resend" | "external";
}

function readShopField(shop: ShopEmailConfig, field: keyof ShopEmailConfig): string | null {
  const value = shop[field];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readEnvAddress(key: string | null): string | null {
  if (!key) return null;
  const raw = process.env[key]?.trim();
  if (raw) return extractEmailAddress(raw) ?? raw;
  return null;
}

/** Extrae la dirección de `"Nombre <mail@x.com>"` o devuelve el string si ya es email. */
export function extractEmailAddress(from: string): string | null {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  if (from.includes("@")) return from.trim();
  return null;
}

function formatFromHeader(shopName: string, address: string): string {
  const safeName = shopName.replace(/"/g, "'");
  return `"${safeName}" <${address}>`;
}

function resolveAddress(
  shop: ShopEmailConfig,
  channel: EmailChannel,
  kind: "from" | "reply"
): string | null {
  const meta = EMAIL_CHANNEL_META[channel];

  if (kind === "from") {
    if (meta.shopFromField) {
      const shopAddr = readShopField(shop, meta.shopFromField);
      if (shopAddr) return shopAddr;
    }
    const envAddr = readEnvAddress(meta.envFromKey);
    if (envAddr) return envAddr;
    const primary = readShopField(shop, "email");
    if (primary) return primary;
    const fallback = readEnvAddress("EMAIL_FROM");
    if (fallback) return fallback;
    return null;
  }

  // reply-to
  if (meta.shopReplyField) {
    const replyAddr = readShopField(shop, meta.shopReplyField);
    if (replyAddr) return replyAddr;
  }
  return readShopField(shop, "email");
}

export function resolveEmailRoute(shop: ShopEmailConfig, channel: EmailChannel): EmailRoute {
  const meta = EMAIL_CHANNEL_META[channel];
  const fromAddress = resolveAddress(shop, channel, "from");
  const replyTo = resolveAddress(shop, channel, "reply");

  if (!fromAddress) {
    throw new Error(
      `No hay remitente configurado para ${meta.label}. ` +
        "Configura los correos del taller o las variables EMAIL_FROM_* en el servidor."
    );
  }

  if (!replyTo) {
    throw new Error(
      `No hay reply-to configurado para ${meta.label}. ` +
        "Agrega el email principal del taller en Configuración."
    );
  }

  return {
    channel,
    from: formatFromHeader(shop.name, fromAddress),
    replyTo,
    fromAddress,
    pipeline: meta.pipeline,
  };
}

const NO_FROM_CONFIGURED: Record<AdminLocale, (label: string) => string> = {
  es: (label) =>
    `No hay remitente configurado para ${label}. Configura los correos del taller o las variables EMAIL_FROM_* en el servidor.`,
  en: (label) =>
    `No sender configured for ${label}. Set up the shop's email addresses or the EMAIL_FROM_* variables on the server.`,
  fr: (label) =>
    `Aucun expéditeur configuré pour ${label}. Configurez les courriels du garage ou les variables EMAIL_FROM_* sur le serveur.`,
};

const NO_REPLY_CONFIGURED: Record<AdminLocale, (label: string) => string> = {
  es: (label) => `No hay reply-to configurado para ${label}. Agrega el email principal del taller en Configuración.`,
  en: (label) => `No reply-to configured for ${label}. Add the shop's main email in Settings.`,
  fr: (label) => `Aucune adresse de réponse configurée pour ${label}. Ajoutez le courriel principal du garage dans Configuration.`,
};

const NOT_CONFIGURED: Record<AdminLocale, string> = {
  es: "Sin configurar",
  en: "Not configured",
  fr: "Non configuré",
};

/** Vista resuelta para mostrar en Configuración (solo canales Resend activos). */
export function getResolvedEmailMatrix(shop: ShopEmailConfig, locale: AdminLocale) {
  const channels = (Object.keys(EMAIL_CHANNEL_META) as EmailChannel[]).filter(
    (c) => EMAIL_CHANNEL_META[c].pipeline === "resend"
  );

  return channels.map((channel) => {
    const meta = EMAIL_CHANNEL_META[channel];
    const label = channelLabel(channel, locale);
    const description = channelDescription(channel, locale);
    try {
      const fromAddress = resolveAddress(shop, channel, "from");
      const replyTo = resolveAddress(shop, channel, "reply");
      if (!fromAddress) throw new Error(NO_FROM_CONFIGURED[locale](label));
      if (!replyTo) throw new Error(NO_REPLY_CONFIGURED[locale](label));

      return {
        channel,
        label,
        description,
        implemented: meta.implemented,
        from: fromAddress,
        replyTo,
        ok: true as const,
      };
    } catch (err) {
      return {
        channel,
        label,
        description,
        implemented: meta.implemented,
        from: null,
        replyTo: null,
        ok: false as const,
        error: err instanceof Error ? err.message : NOT_CONFIGURED[locale],
      };
    }
  });
}

export function shopToEmailConfig(shop: ShopEmailConfig & { name: string }): ShopEmailConfig {
  return {
    name: shop.name,
    email: shop.email,
    billingEmail: shop.billingEmail,
    infoEmail: shop.infoEmail,
    providersEmail: shop.providersEmail,
    newsletterEmail: shop.newsletterEmail,
  };
}
