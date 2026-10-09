import type { Metadata } from "next";
import { ConfirmRecoveryEmail } from "@/components/sales-crm/ConfirmRecoveryEmail";

export const metadata: Metadata = { title: "GarageOS", robots: { index: false, follow: false } };

export default async function ConfirmRecoveryEmailPage({ params, searchParams }: { params: Promise<{ staffId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ staffId }, { lang }] = await Promise.all([params, searchParams]);
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10"><ConfirmRecoveryEmail staffId={staffId} locale={lang === "fr" ? "fr" : "en"} /></main>;
}
