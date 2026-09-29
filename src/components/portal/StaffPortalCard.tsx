"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { createPortalLinkForClient, revokeClientPortalLinks, sendPortalLinkToClient } from "@/actions/portal";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { PORTAL_ADMIN_DICT } from "@/lib/admin-locale/portal";

const btn = "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function StaffPortalCard({ clientId, activeLinks, hasEmail, canWrite }: { clientId: string; activeLinks: number; hasEmail: boolean; canWrite: boolean }) {
  const t = PORTAL_ADMIN_DICT[useAdminLocale()];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shownLink, setShownLink] = useState<string | null>(null);

  const fail = (code?: string) => toast.error(t.errors[(code as keyof typeof t.errors) ?? "generic"] ?? t.errors.generic);

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden />
        <div>
          <h2 className="font-semibold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500">{t.description}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">{t.activeLinks(activeLinks)}</p>
        </div>
      </div>
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            disabled={pending || !hasEmail}
            onClick={() =>
              start(async () => {
                const res = await sendPortalLinkToClient(clientId);
                if ("error" in res) { fail(res.error); return; }
                toast.success(t.sent(res.sentTo));
                router.refresh();
              })
            }
          >
            {pending ? t.sending : t.sendEmail}
          </button>
          <button
            type="button"
            className={btn}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await createPortalLinkForClient(clientId);
                if ("error" in res) { fail(res.error); return; }
                setShownLink(res.url);
                try {
                  await navigator.clipboard.writeText(res.url);
                  toast.success(t.copied);
                } catch {
                  /* el enlace queda visible abajo para copiarlo a mano */
                }
                router.refresh();
              })
            }
          >
            {pending ? t.creating : t.copyLink}
          </button>
          {activeLinks > 0 && (
            <button
              type="button"
              className={`${btn} text-red-700`}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t.confirmRevoke)) return;
                start(async () => {
                  const res = await revokeClientPortalLinks(clientId);
                  if ("error" in res) { fail(res.error); return; }
                  setShownLink(null);
                  toast.success(t.revoked(res.revoked));
                  router.refresh();
                });
              }}
            >
              {pending ? t.revoking : t.revoke}
            </button>
          )}
        </div>
      )}
      {!hasEmail && canWrite && <p className="text-xs text-slate-500">{t.noEmail}</p>}
      {shownLink && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          <p className="mb-1 font-medium">{t.linkShownOnce}</p>
          <input readOnly value={shownLink} onFocus={(e) => e.currentTarget.select()} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs" />
        </div>
      )}
    </section>
  );
}
