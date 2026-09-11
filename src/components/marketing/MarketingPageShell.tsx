import { MarketingLocaleProvider } from "@/components/marketing/MarketingLocaleProvider";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export function MarketingPageShell({ children }: { children: React.ReactNode }) {
  return (
    <MarketingLocaleProvider>
      <main className="min-h-full bg-white">
        <MarketingHeader />
        {children}
        <MarketingFooter />
      </main>
    </MarketingLocaleProvider>
  );
}
