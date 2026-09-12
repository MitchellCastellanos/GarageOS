"use client";

import { createContext, useContext } from "react";
import type { AdminLocale } from "@/lib/admin-locale";

const AdminLocaleContext = createContext<AdminLocale | null>(null);

export function AdminLocaleProvider({
  locale,
  children,
}: {
  locale: AdminLocale;
  children: React.ReactNode;
}) {
  return <AdminLocaleContext.Provider value={locale}>{children}</AdminLocaleContext.Provider>;
}

export function useAdminLocale(): AdminLocale {
  const locale = useContext(AdminLocaleContext);
  if (!locale) throw new Error("useAdminLocale must be used within an AdminLocaleProvider");
  return locale;
}
