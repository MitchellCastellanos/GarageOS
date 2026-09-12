// Lista de purposes visibles en Configuración → Rutas de comunicación. Vive fuera de
// actions/communications-settings.ts porque un archivo "use server" solo puede exportar
// funciones async — este es un dato estático plano.

import { EMAIL_CHANNEL_META, type EmailChannel } from "@/lib/email-config";
import type { CommChannel } from "@prisma/client";

export interface RoutePurpose {
  purpose: string;
  channel: CommChannel;
  label: string;
}

const EMAIL_ROUTE_PURPOSES: RoutePurpose[] = (
  Object.keys(EMAIL_CHANNEL_META) as EmailChannel[]
)
  .filter((c) => EMAIL_CHANNEL_META[c].implemented && EMAIL_CHANNEL_META[c].pipeline === "resend")
  .map((c) => ({ purpose: c, channel: "EMAIL" as const, label: EMAIL_CHANNEL_META[c].label }));

const EXTRA_ROUTE_PURPOSES: RoutePurpose[] = [
  { purpose: "INBOX", channel: "EMAIL", label: "Bandeja de entrada" },
  { purpose: "CAMPAIGN", channel: "EMAIL", label: "Campañas" },
  { purpose: "APPOINTMENT", channel: "SMS", label: "Citas (SMS)" },
  { purpose: "INVOICE", channel: "SMS", label: "Facturas (SMS)" },
  { purpose: "QUOTE", channel: "SMS", label: "Cotizaciones (SMS)" },
];

export const ROUTE_PURPOSES: RoutePurpose[] = [...EMAIL_ROUTE_PURPOSES, ...EXTRA_ROUTE_PURPOSES];
