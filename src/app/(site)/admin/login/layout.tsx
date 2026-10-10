import { AuthHero } from "@/components/auth/AuthHero";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingLocaleProvider";

// Layout para rutas sin autenticación (login, signup) — pantalla partida,
// sin sidebar ni topbar del admin. Bilingüe EN/FR igual que el homepage.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingLocaleProvider>
      <div className="min-h-screen w-full flex">
        <AuthHero />
        {children}
      </div>
    </MarketingLocaleProvider>
  );
}
