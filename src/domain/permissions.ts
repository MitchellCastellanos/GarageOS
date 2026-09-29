// Roles y permisos (Block 8) — modelo puro y testeable.
//
// Tres roles en todos los planes (OWNER / MECHANIC / VIEWER) con permisos por defecto sensatos.
// Pro+ (`permissions.advanced`) permite al dueño ajustar permisos delegables por usuario
// (otorgar / revocar) sobre los del rol. Configuración del taller (ajustes, equipo, facturación,
// dominios, ubicaciones) es SIEMPRE solo del dueño: no es delegable en V1.

export type Role = "OWNER" | "MECHANIC" | "VIEWER";

export const PERMISSIONS = [
  /** Base de toda escritura operativa (citas, órdenes, cotizaciones, inventario, mensajes…). */
  "ops.write",
  "customers.view",
  "customers.write",
  "invoices.view",
  "invoices.write",
  "payments.write",
  /** Reembolsar facturas pagadas (Block 9) — por defecto solo el dueño. */
  "refunds.write",
  "inventory.write",
  "dvi.write",
  /** Contabilidad, caja, documentos contables e ingresos. */
  "financial.view",
  /** Reportes/analítica del negocio (Block 5). */
  "reports.view",
  "campaigns.manage",
  "import.run",
  /** Ajustes, equipo, facturación, dominios, ubicaciones — nunca delegable. */
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permisos que un dueño puede otorgar/revocar por usuario en Pro+. */
export const DELEGABLE_PERMISSIONS: readonly Permission[] = [
  "ops.write",
  "customers.write",
  "invoices.view",
  "invoices.write",
  "payments.write",
  "refunds.write",
  "inventory.write",
  "dvi.write",
  "financial.view",
  "reports.view",
  "campaigns.manage",
  "import.run",
];

const ROLE_DEFAULTS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  // Personal de taller/mostrador: opera todo el flujo (incluye facturar y cobrar) pero no ve
  // contabilidad/reportes, no envía campañas, no importa datos ni toca configuración.
  MECHANIC: ["ops.write", "customers.view", "customers.write", "invoices.view", "invoices.write", "payments.write", "inventory.write", "dvi.write"],
  // Solo lectura de la operación: clientes y facturas, sin finanzas ni escritura.
  VIEWER: ["customers.view", "invoices.view"],
};

export function isRole(value: unknown): value is Role {
  return value === "OWNER" || value === "MECHANIC" || value === "VIEWER";
}

export function isDelegable(permission: string): permission is Permission {
  return (DELEGABLE_PERMISSIONS as readonly string[]).includes(permission);
}

export function defaultPermissions(role: Role): ReadonlySet<Permission> {
  return new Set(ROLE_DEFAULTS[role]);
}

export interface PermissionOverrides {
  grants: readonly string[];
  denies: readonly string[];
}

/**
 * Permisos efectivos. El OWNER siempre tiene todos (no se puede recortar a un dueño). Los
 * overrides solo cuentan con `advanced` (plan Pro+) y solo sobre permisos delegables; una
 * revocación gana sobre un otorgamiento.
 */
export function resolvePermissions(role: string, overrides: PermissionOverrides | null, advanced: boolean): ReadonlySet<Permission> {
  if (!isRole(role)) return new Set();
  const perms = new Set(ROLE_DEFAULTS[role]);
  if (role === "OWNER" || !advanced || !overrides) return perms;
  for (const g of overrides.grants) if (isDelegable(g)) perms.add(g);
  for (const d of overrides.denies) if (isDelegable(d)) perms.delete(d);
  return perms;
}

/** Normaliza lo que llega del cliente: solo permisos delegables, sin repetidos, sin contradicciones. */
export function sanitizeOverrides(input: { grants?: unknown; denies?: unknown }, role: Role): PermissionOverrides {
  const clean = (v: unknown) => [...new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && isDelegable(x)) : [])];
  const defaults: readonly string[] = ROLE_DEFAULTS[role];
  const denies = clean(input.denies).filter((p) => defaults.includes(p));
  const grants = clean(input.grants).filter((p) => !defaults.includes(p) && !denies.includes(p));
  return { grants, denies };
}
