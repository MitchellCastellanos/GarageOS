/** Rutas del panel del taller (bajo /admin). El sitio público vive en /. */
export const ADMIN = {
  login: "/admin/login",
  dashboard: "/admin/dashboard",
  clients: "/admin/clients",
  invoices: "/admin/invoices",
  quotes: "/admin/quotes",
  appointments: "/admin/appointments",
  reminders: "/admin/reminders",
  accounting: "/admin/accounting",
  caja: "/admin/caja",
  settings: "/admin/settings",
} as const;

/** Panel super-admin de la plataforma — separado del /admin de cada taller */
export const PLATFORM = {
  home: "/platform",
  shop: (id: string) => `/platform/shops/${id}`,
} as const;

export function adminPath(path: string): string {
  const segment = path.startsWith("/") ? path : `/${path}`;
  return `/admin${segment}`;
}
