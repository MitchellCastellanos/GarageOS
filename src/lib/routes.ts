/** Rutas del panel del taller (bajo /admin). El sitio público vive en /. */
export const ADMIN = {
  login: "/admin/login",
  signup: "/admin/signup",
  verifyEmailSent: "/admin/verify-email-sent",
  dashboard: "/admin/dashboard",
  clients: "/admin/clients",
  invoices: "/admin/invoices",
  quotes: "/admin/quotes",
  workOrders: "/admin/work-orders",
  inspections: "/admin/inspections",
  appointments: "/admin/appointments",
  reminders: "/admin/reminders",
  accounting: "/admin/accounting",
  reports: "/admin/reports",
  organization: "/admin/organization",
  caja: "/admin/caja",
  inbox: "/admin/inbox",
  campaigns: "/admin/campaigns",
  inventory: "/admin/inventory",
  import: "/admin/import",
  tireStorage: "/admin/tire-storage",
  settings: "/admin/settings",
  billing: "/admin/settings?tab=billing",
  support: "/admin/support",
  onboarding: "/admin/onboarding",
} as const;

/** Panel super-admin de la plataforma — separado del /admin de cada taller */
export const PLATFORM = {
  sales: "/platform/sales",
  salesNew: "/platform/sales/new",
  salesDemo: (id: string) => `/platform/sales/${id}`,
  salesDemos: "/platform/sales/demos",
  salesProspects: "/platform/sales/prospects",
  salesProspectNew: "/platform/sales/prospects/new",
  salesProspectImport: "/platform/sales/prospects/import",
  salesDuplicates: "/platform/sales/prospects/duplicates",
  salesAssignment: "/platform/sales/prospects/assignment",
  salesEvidence: "/platform/sales/prospects/evidence",
  salesProspect: (id: string) => `/platform/sales/prospects/${id}`,
  salesPipeline: "/platform/sales/pipeline",
  salesTasks: "/platform/sales/tasks",
  salesTeam: "/platform/sales/team",
  salesTeamNew: "/platform/sales/team/new",
  salesTeamMember: (id: string) => `/platform/sales/team/${id}`,
  salesNeeds: "/platform/sales/settings/needs",
  salesInbox: "/platform/sales/inbox",
  salesThread: (id: string) => `/platform/sales/inbox/${id}`,
  salesCompose: "/platform/sales/inbox/new",
  salesOutreach: "/platform/sales/outreach",
  salesCalendar: "/platform/sales/calendar",
  salesAvailability: "/platform/sales/calendar/availability",
  salesComms: "/platform/sales/settings/communications",
  salesAccount: "/platform/sales/account",
  salesTerritories: "/platform/sales/settings/territories",
  salesVideos: "/platform/sales/settings/videos",
  home: "/platform",
  shop: (id: string) => `/platform/shops/${id}`,
  analytics: "/platform/analytics",
  messages: "/platform/messages",
  message: (id: string) => `/platform/messages/${id}`,
} as const;

/** Public (unauthenticated) landing for a sales-staff invitation; the secret travels in the URL fragment. */
export const salesInvitePath = (staffId: string) => `/sales-invite/${staffId}`;

export const salesRecoverPath = "/sales-recover";
export const salesRecoveryEmailPath = (staffId: string) => `/sales-recovery-email/${staffId}`;

export function adminPath(path: string): string {
  const segment = path.startsWith("/") ? path : `/${path}`;
  return `/admin${segment}`;
}
