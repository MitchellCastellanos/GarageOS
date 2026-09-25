// Mapa central de entitlements — ver docs/subscription-plans.md ("Future
// implementation guidance"). Ningún otro módulo debe comparar `plan === "..."`
// directamente para decidir si una función está disponible: todo pasa por
// `can()` (src/lib/subscription.ts) y las claves de abajo, así la matriz de
// precios y el código nunca pueden divergir en silencio.

export type Plan = "CORE" | "PRO" | "COMPLETE";

export const PLANS: Plan[] = ["CORE", "PRO", "COMPLETE"];

export const PLAN_LABELS: Record<Plan, string> = {
  CORE: "Core",
  PRO: "Pro",
  COMPLETE: "Complete",
};

/** Orden de "tamaño" del plan — para saber si un upgrade lo desbloquea. */
const PLAN_RANK: Record<Plan, number> = { CORE: 0, PRO: 1, COMPLETE: 2 };

export function planAtLeast(plan: Plan, minPlan: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[minPlan];
}

/**
 * Capacidades con enforcement real en el código hoy. Cada clave apunta al
 * plan mínimo que la incluye — `null` significa "incluido en todos los
 * planes" (no debería gatearse en ningún punto).
 *
 * Esta lista es intencionalmente más chica que el catálogo completo de
 * docs/subscription-plans.md: solo incluye funciones que ya existen en el
 * producto. Las marcadas "Future" en ese doc (API pública,
 * QuickBooks, DVI avanzado, reportes avanzados, etc.) no tienen todavía una
 * pantalla o acción real que gatear — cuando se construyan, se agregan acá.
 */
export const CAPABILITY_MIN_PLAN = {
  "inventory.manage": "PRO",
  "communications.campaigns": "PRO",
  "branding.customDomain": "PRO",
  "branding.customSender": "PRO",
  // Plantillas Modern/Bold/Minimal y tipografías alternativas de la página
  // pública de reservas. Classic, logo, color, fotos, íconos y destacados
  // quedan en todos los planes (ver src/lib/booking-page.ts).
  "bookingPage.advancedDesign": "PRO",
  "organization.multiLocation": "COMPLETE",
} as const satisfies Record<string, Plan>;

export type CapabilityKey = keyof typeof CAPABILITY_MIN_PLAN;

export function minPlanFor(capability: CapabilityKey): Plan {
  return CAPABILITY_MIN_PLAN[capability];
}

export function planIncludes(plan: Plan, capability: CapabilityKey): boolean {
  return planAtLeast(plan, minPlanFor(capability));
}

/**
 * Límites numéricos por plan (no son booleanos on/off).
 *
 * smsSegmentsPerMonth: cupo de SMS salientes por mes calendario, en segmentos
 * (lo que cobra Twilio — ver countSmsSegments en src/domain/sms.ts). Al
 * agotarse, los avisos automáticos caen a email; no hay cobro de excedente.
 * VALORES PROVISIONALES: docs/subscription-plans.md solo define "Allowance /
 * Larger / Largest" — confirmar cifras comerciales antes del lanzamiento.
 * GarageOS puede fijar otro cupo por taller (Shop.smsMonthlyAllowanceOverride).
 */
export const PLAN_LIMITS: Record<
  Plan,
  { users: number | null; locations: number | null; smsSegmentsPerMonth: number }
> = {
  CORE: { users: 3, locations: 1, smsSegmentsPerMonth: 300 },
  PRO: { users: null, locations: 1, smsSegmentsPerMonth: 1000 },
  COMPLETE: { users: null, locations: null, smsSegmentsPerMonth: 2500 },
};

/** Precio público de referencia (CAD) — debe reflejar docs/subscription-plans.md. */
export const PLAN_PRICING_CAD: Record<Plan, { monthly: number; yearly: number }> = {
  CORE: { monthly: 149, yearly: 1490 },
  PRO: { monthly: 249, yearly: 2490 },
  COMPLETE: { monthly: 399, yearly: 3990 },
};
