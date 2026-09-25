// Quién recibe una alerta interna y por qué canal — lógica pura, sin DB ni
// SDKs, para poder probarla directamente (staff-alerts.ts no se puede probar
// importándolo tal cual: arrastra "server-only", que solo Next.js sabe
// resolver correctamente; fuera de su bundler siempre lanza).

export interface StaffAlertOwner {
  userId: string;
  email: string;
  emailVerified: boolean;
  language: "EN" | "FR";
}

export interface StaffNotificationPreference {
  inApp: boolean;
  email: boolean;
}

export interface StaffAlertRecipientPlan {
  userId: string;
  language: "EN" | "FR";
  /** Se crea una fila de StaffNotification (+ push en tiempo real) para este usuario. */
  createInApp: boolean;
  /** Se agrega su email al lote de este idioma (requiere email verificado, además de la preferencia). */
  includeInEmailBatch: boolean;
}

/**
 * Un owner sin preferencia guardada usa el default (ambos canales activos).
 * El email además exige que el correo esté verificado — el in-app no.
 */
export function planStaffAlertRecipients(
  owners: StaffAlertOwner[],
  preferences: Map<string, StaffNotificationPreference>,
  defaultPreference: StaffNotificationPreference
): StaffAlertRecipientPlan[] {
  return owners.map((owner) => {
    const pref = preferences.get(owner.userId) ?? defaultPreference;
    return {
      userId: owner.userId,
      language: owner.language,
      createInApp: pref.inApp,
      includeInEmailBatch: pref.email && owner.emailVerified,
    };
  });
}

/** Agrupa los emails a mandar por idioma (un envío por idioma, como ya hacía sendStaffAlert). */
export function groupEmailBatchByLanguage(
  owners: StaffAlertOwner[],
  plan: StaffAlertRecipientPlan[]
): Record<"EN" | "FR", string[]> {
  const emailByUser = new Map(owners.map((o) => [o.userId, o.email]));
  const batch: Record<"EN" | "FR", string[]> = { EN: [], FR: [] };
  for (const entry of plan) {
    if (entry.includeInEmailBatch) {
      const email = emailByUser.get(entry.userId);
      if (email) batch[entry.language].push(email);
    }
  }
  return batch;
}
