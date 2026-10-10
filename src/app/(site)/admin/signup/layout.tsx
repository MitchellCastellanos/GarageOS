import { AuthHero } from "@/components/auth/AuthHero";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingLocaleProvider";

export default function SignupLayout({
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
