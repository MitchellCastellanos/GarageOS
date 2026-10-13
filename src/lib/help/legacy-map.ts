import type { HelpCategoryId } from "./types";

/**
 * Mapa de equivalencias `/guides/<slug>` → artículo del Centro de ayuda. Cubre las 13 guías existentes; un test exige
 * que cada guía tenga destino. Las guías NO se eliminan ni se redirigen todavía: solo declaran como canonical el
 * artículo equivalente (ver `src/app/(site)/guides/[slug]/page.tsx`). Los 301 llegan en un PR aparte, con este mapa.
 */
export const GUIDE_TO_HELP: Record<string, { category: HelpCategoryId; related?: string[] }> = {
  "set-up-your-shop": { category: "getting-started", related: ["import-your-data", "configure-online-booking"] },
  "import-your-data": { category: "getting-started", related: ["clients-and-vehicles", "set-up-your-shop"] },
  "configure-online-booking": { category: "appointments", related: ["set-up-your-shop", "clients-and-vehicles"] },
  "clients-and-vehicles": { category: "client-records", related: ["customer-portal", "configure-online-booking"] },
  "digital-vehicle-inspections": { category: "inspect-authorize", related: ["estimate-to-invoice", "approval-history"] },
  "estimate-to-invoice": { category: "estimates-invoices", related: ["approval-history", "work-orders"] },
  "approval-history": { category: "estimates-invoices", related: ["estimate-to-invoice", "digital-vehicle-inspections"] },
  "work-orders": { category: "run-the-shop", related: ["estimate-to-invoice", "manage-inventory"] },
  "manage-inventory": { category: "run-the-shop", related: ["work-orders", "multi-location"] },
  "multi-location": { category: "run-the-shop", related: ["set-up-your-shop", "manage-inventory"] },
  "maintenance-reminders": { category: "communicate-retain", related: ["branded-communications", "customer-portal"] },
  "customer-portal": { category: "communicate-retain", related: ["branded-communications", "clients-and-vehicles"] },
  "branded-communications": { category: "communicate-retain", related: ["maintenance-reminders", "customer-portal"] },
};
