"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { HELP_UI, type HelpSearchEntry } from "@/lib/help";
import { searchHelp } from "@/lib/help/search";

/**
 * Búsqueda del Centro de ayuda (cliente, índice local recibido del servidor). Accesible: <search> con etiqueta visible,
 * estado `aria-live="polite"` que anuncia el número de resultados o el estado vacío; los resultados son enlaces normales
 * (teclado nativo). Los artículos están hoy solo en inglés: en la interfaz francesa se avisa y el contenido lleva lang="en".
 */
export function HelpSearch({ entries }: { entries: HelpSearchEntry[] }) {
  const { locale } = useMarketingLocale();
  const ui = HELP_UI[locale];
  const [query, setQuery] = useState("");
  const inputId = useId();
  const statusId = useId();
  const trimmed = query.trim();
  const results = useMemo(() => searchHelp(entries, trimmed), [entries, trimmed]);
  const tooShort = trimmed.length > 0 && trimmed.length < 2;

  let status = "";
  if (tooShort) status = ui.searchTooShort;
  else if (trimmed.length >= 2) status = results.length > 0 ? ui.searchResults(results.length) : ui.noResults(trimmed);

  return (
    <div role="search" className="mb-12">
      <label htmlFor={inputId} className="mb-2 block text-sm font-semibold text-slate-900">{ui.searchLabel}</label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ui.searchPlaceholder}
          autoComplete="off"
          aria-describedby={statusId}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-blue"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">
            {ui.clear}
          </button>
        )}
      </div>
      {locale === "fr" && ui.englishOnly && <p className="mt-2 text-xs text-slate-500">{ui.englishOnly}</p>}
      <p id={statusId} role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-slate-600">{status}</p>
      {results.length > 0 && (
        <ul lang="en" className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {results.map(({ entry }) => (
            <li key={entry.id}>
              <Link href={entry.url} className="block p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">
                <span className="block text-xs font-semibold uppercase tracking-wide text-brand-blue">{entry.category}</span>
                <span className="mt-1 block font-semibold text-slate-900">{entry.title}</span>
                <span className="mt-1 block text-sm text-slate-600">{entry.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {trimmed.length >= 2 && results.length === 0 && (
        <p className="mt-2 text-sm text-slate-600">
          {ui.noResultsHelp}{" "}
          <Link href="/contact" className="font-semibold text-brand-blue hover:underline">{ui.contactUs}</Link>
        </p>
      )}
    </div>
  );
}
