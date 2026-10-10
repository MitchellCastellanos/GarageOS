import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/portal/PortalShell";
import { PortalRequestForm } from "@/components/portal/PortalRequestForm";

export const dynamic = "force-dynamic";

/** Página pública de un taller para pedir su enlace del portal. No revela si un correo existe. */
export default async function PortalRequestPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const shop = await db.shop.findUnique({ where: { slug }, select: { name: true, logoUrl: true, brandColor: true, defaultLanguage: true } });
  if (!shop) notFound();
  const initial = lang === "fr" || lang === "en" ? lang : shop.defaultLanguage === "FR" ? "fr" : "en";
  return (
    <PortalShell shop={shop} lang={initial}>
      <PortalRequestForm slug={slug} lang={initial} />
    </PortalShell>
  );
}
