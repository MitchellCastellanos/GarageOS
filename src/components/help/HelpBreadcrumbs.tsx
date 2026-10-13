import Link from "next/link";
import { HELP_UI, type Crumb, type HelpLocale } from "@/lib/help";

/** Fil d'Ariane accesible: <nav aria-label> + lista ordenada; la página actual lleva aria-current="page" y no es enlace. */
export function HelpBreadcrumbs({ locale, crumbs }: { locale: HelpLocale; crumbs: Crumb[] }) {
  return (
    <nav aria-label={HELP_UI[locale].breadcrumb} className="text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className="font-medium text-slate-700">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="text-brand-blue hover:underline focus-visible:outline-2 focus-visible:outline-brand-blue">{crumb.label}</Link>
              )}
              {!last && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
