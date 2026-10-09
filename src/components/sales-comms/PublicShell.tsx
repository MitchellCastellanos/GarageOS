import type { ReactNode } from "react";
import { getAppUrl } from "@/config/app";

/** Branded frame for the public (unauthenticated) sales pages: GarageOS header, narrow card, no CRM data. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="rounded-t-2xl bg-slate-900 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, same as the transactional emails */}
          <img src={`${getAppUrl()}/brand/logo-monochrome-white.png`} alt="GarageOS" width={140} height={47} />
        </div>
        <div className="rounded-b-2xl border border-t-0 border-slate-200 bg-white p-5 sm:p-7">{children}</div>
        <p className="mt-4 text-center text-xs text-slate-500">GarageOS · www.garage-os.ca</p>
      </div>
    </main>
  );
}

export const publicMeta = { robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" as const };
