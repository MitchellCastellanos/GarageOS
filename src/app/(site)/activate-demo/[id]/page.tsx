import { ActivationLanding } from "@/components/sales-demo/ActivationLanding";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function ActivationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { id } = await params; const { lang } = await searchParams;
  return <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10 sm:items-center"><ActivationLanding demoId={id} initialLocale={lang === "fr" ? "fr" : "en"} /></main>;
}
