import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { VideoAdmin } from "@/components/sales-crm/VideoAdmin";

export default async function VideosPage() {
  const { actor, t, locale } = await loadCrmPage("manage_sequences");
  if (!actor) return <PermissionDenied t={t} />;
  const rows = await db.platformVideo.findMany({ orderBy: [{ key: "asc" }, { language: "asc" }] });
  const c = identityCopy(locale).videos;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={c.title} subtitle={c.help} />
      <VideoAdmin locale={locale} rows={rows.map((r) => ({ key: r.key, language: r.language, title: r.title, description: r.description, url: r.url, thumbnailUrl: r.thumbnailUrl, status: r.status, allowWebsite: r.allowWebsite, allowOutreach: r.allowOutreach }))} />
    </div>
  );
}
