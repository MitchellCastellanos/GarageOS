"use client";

import { useEffect } from "react";

// Bilingual on purpose: this boundary renders outside the localized page that failed. It never prints the error message.
export default function SalesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[sales] view failed", error.digest ?? ""); }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
      <h1 className="text-lg font-semibold text-rose-900">Something went wrong · Une erreur est survenue</h1>
      <p className="mt-2 text-sm text-rose-900/80">This view could not be loaded. Nothing was changed. · Cette vue n’a pas pu être chargée. Rien n’a été modifié.</p>
      <button type="button" onClick={reset} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800">Try again · Réessayer</button>
    </div>
  );
}
