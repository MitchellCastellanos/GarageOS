import type { Metadata } from "next";

// Todo /admin (login, registro, verificación, onboarding y el panel) es de aplicación: nunca indexable. Las
// páginas públicas de adquisición son /get-started y /pricing. No es una medida de seguridad: el acceso lo
// controla la sesión.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
