import { getVoiceSettingsView } from "@/actions/sales-voice-settings";
import { callingCopy } from "@/lib/admin-locale/sales-calling";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { VoiceSettingsPanel } from "@/components/sales-calling/VoiceSettingsPanel";

export const dynamic = "force-dynamic";

export default async function VoiceSettingsPage() {
  const { actor, t, locale } = await loadCrmPage("manage_lead_radar");
  if (!actor) return <PermissionDenied t={t} />;
  const c = callingCopy(locale).voice;
  const view = await getVoiceSettingsView();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={c.title} subtitle={c.subtitle} />
      <VoiceSettingsPanel view={view} locale={locale} />
    </div>
  );
}
