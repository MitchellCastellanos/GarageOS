import type { Metadata } from "next";
import { RecoverForm } from "@/components/sales-crm/RecoverForm";

export const metadata: Metadata = { title: "GarageOS", robots: { index: false, follow: false } };

export default async function SalesRecoverPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10"><RecoverForm locale={lang === "fr" ? "fr" : "en"} /></main>;
}
