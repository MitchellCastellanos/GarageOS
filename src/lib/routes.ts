/** Rutas del panel del taller (bajo /admin). El sitio público vive en /. */
export const ADMIN = {
  login: "/admin/login",
  signup: "/admin/signup",
  dashboard: "/admin/dashboard",
  clients: "/admin/clients",
  invoices: "/admin/invoices",
  quotes: "/admin/quotes",
  workOrders: "/admin/work-orders",
  appointments: "/admin/appointments",
  reminders: "/admin/reminders",
  accounting: "/admin/accounting",
  caja: "/admin/caja",
  inbox: "/admin/inbox",
  campaigns: "/admin/campaigns",
  notifications: "/admin/notifications",
  inventory: "/admin/inventory",
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
