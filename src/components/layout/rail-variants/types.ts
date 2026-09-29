import type { LucideIcon } from "lucide-react";

export interface RailNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  locked: boolean;
  unread: boolean;
}

export interface RailNavGroup {
  label: string;
  icon: LucideIcon;
  items: RailNavItem[];
  /** Alguno de sus sub-ítems es la ruta activa. */
  active: boolean;
  /** Alguno de sus sub-ítems tiene un punto "en vivo" — se agrega aquí porque
   * en los layouts colapsados (flyout, dos columnas) el sub-ítem no es visible
   * hasta que se abre la categoría, y el punto no puede desaparecer. */
  unread: boolean;
}

export type RailVariant = "stacked" | "flyout" | "accordion" | "twocolumn";

export const RAIL_VARIANT_STORAGE_KEY = "garageos-admin-rail-variant-preview";

export const RAIL_VARIANTS: { value: RailVariant; label: string }[] = [
  { value: "stacked", label: "Actual" },
  { value: "flyout", label: "Flyout" },
  { value: "accordion", label: "Acordeón" },
  { value: "twocolumn", label: "2 columnas" },
];
