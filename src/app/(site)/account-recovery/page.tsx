import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN, salesRecoverPath } from "@/lib/routes";

export const metadata: Metadata = { title: "GarageOS", robots: { index: false, follow: false } };
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "mcastellanos@garage-os.ca";

/** Neutral landing for the login's "Forgot password": shop users and GarageOS sales staff have different recovery paths. */
export default async function AccountRecoveryPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const fr = (await searchParams).lang === "fr";
  const t = fr
    ? { h: "Récupération de compte", shop: "Je suis un garage (propriétaire ou employé)", shopBody: "Écrivez-nous depuis l’adresse de votre compte et nous vous aiderons à rétablir l’accès :", sales: "Je fais partie de l’équipe des ventes GarageOS", salesBody: "Utilisez la récupération par courriel de votre compte corporatif.", salesCta: "Récupérer mon compte ventes", back: "Retour à la connexion", other: "English" }
    : { h: "Account recovery", shop: "I run or work in a shop", shopBody: "Write to us from your account's email address and we will help you regain access:", sales: "I am part of the GarageOS sales team", salesBody: "Use recovery with your corporate account.", salesCta: "Recover my sales account", back: "Back to sign in", other: "Français" };
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-10">
      <div className="space-y-5 rounded-xl border bg-white p-6">
        <h1 className="text-xl font-semibold text-slate-900">{t.h}</h1>
        <section><h2 className="font-medium text-slate-900">{t.shop}</h2><p className="mt-1 text-sm text-slate-600">{t.shopBody}</p>
          <a className="mt-1 inline-flex min-h-11 items-center break-all text-sm font-medium text-blue-700" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></section>
        <section><h2 className="font-medium text-slate-900">{t.sales}</h2><p className="mt-1 text-sm text-slate-600">{t.salesBody}</p>
          <Link className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-blue-700" href={`${salesRecoverPath}${fr ? "?lang=fr" : ""}`}>{t.salesCta}</Link></section>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><Link className="inline-flex min-h-11 items-center text-blue-700" href={ADMIN.login}>{t.back}</Link>
          <Link className="inline-flex min-h-11 items-center text-slate-500" href={`/account-recovery${fr ? "" : "?lang=fr"}`}>{t.other}</Link></div>
      </div>
    </main>
  );
}
