import type { Metadata } from "next";
import { InviteForm } from "@/components/sales-crm/InviteForm";

// Public landing for a sales-staff invitation. No data about the invitee is looked up or shown here: the single-use
// secret travels in the URL fragment and is verified only when the password form is submitted.
export const metadata: Metadata = { title: "GarageOS", robots: { index: false, follow: false } };

export default async function SalesInvitePage({ params, searchParams }: { params: Promise<{ staffId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ staffId }, { lang }] = await Promise.all([params, searchParams]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <InviteForm staffId={staffId} locale={lang === "fr" ? "fr" : "en"} />
    </main>
  );
}
