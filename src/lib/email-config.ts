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
  id: string;
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

/** Vista resuelta para mostrar en Configuración (solo canales Resend activos). */
export function getResolvedEmailMatrix(shop: ShopEmailConfig) {
  const channels = (Object.keys(EMAIL_CHANNEL_META) as EmailChannel[]).filter(
    (c) => EMAIL_CHANNEL_META[c].pipeline === "resend"
  );

  return channels.map((channel) => {
    const meta = EMAIL_CHANNEL_META[channel];
    try {
      const route = resolveEmailRoute(shop, channel);
      return {
        channel,
        label: meta.label,
        description: meta.description,
        implemented: meta.implemented,
        from: route.fromAddress,
        replyTo: route.replyTo,
        ok: true as const,
      };
    } catch (err) {
      return {
        channel,
        label: meta.label,
        description: meta.description,
        implemented: meta.implemented,
        from: null,
        replyTo: null,
        ok: false as const,
        error: err instanceof Error ? err.message : "Sin configurar",
      };
    }
  });
}

export function shopToEmailConfig(shop: ShopEmailConfig): ShopEmailConfig {
  return {
    id: shop.id,
    name: shop.name,
    email: shop.email,
    billingEmail: shop.billingEmail,
    infoEmail: shop.infoEmail,
    providersEmail: shop.providersEmail,
    newsletterEmail: shop.newsletterEmail,
  };
}
