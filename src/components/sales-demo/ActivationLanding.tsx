"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { inspectSalesDemoActivation } from "@/actions/sales-demo-conversion";
import { ActivationForm } from "@/components/sales-demo/ActivationForm";
import { conversionCopy } from "@/lib/admin-locale/sales-demo-conversion";

export function ActivationLanding({ demoId, initialLocale }: { demoId: string; initialLocale: string }) {
  const [details, setDetails] = useState<{ shopName: string; locale: string; existing: boolean; signedIn: boolean; token: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    let live = true;
    // Fragments stay in the browser: tokens never enter request URLs, logs,
    // referrers, server-rendered HTML, or browser storage.
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    inspectSalesDemoActivation(demoId, token).then((result) => {
      if (!live) return;
      if (result.error || !result.details) setInvalid(true);
      else setDetails({ ...result.details, token });
    }).catch(() => { if (live) setInvalid(true); });
    return () => { live = false; };
  }, [demoId]);
  const t = conversionCopy(details?.locale ?? initialLocale);
  return <div className="w-full min-w-0 max-w-xl space-y-5 rounded-xl border bg-white p-5 sm:p-8">
    <h1 className="break-words text-2xl font-semibold">{t.ready}</h1>
    {details ? <><h2 className="break-words text-lg">{details.shopName}</h2><p>{t.stays}</p><ActivationForm demoId={demoId} {...details} /></> : invalid ?
      <><p role="alert">{t.invalid}</p><Link className="inline-flex min-h-11 items-center text-blue-700" href="/admin/login?callbackUrl=%2Fadmin%2Factivation-payment">{t.login}</Link></> : <p role="status">{t.pending}</p>}
  </div>;
}
