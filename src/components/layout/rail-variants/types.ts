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
   * el sub-ítem no es visible en el riel hasta que se abre la categoría, y el
   * punto no puede desaparecer mientras tanto. */
  unread: boolean;
}
