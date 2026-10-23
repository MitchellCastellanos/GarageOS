import { Check } from "lucide-react";
import { LocaleLink as Link } from "@/components/marketing/LocaleLink";
import { FEATURE_PAGES, featurePath, relatedHref, type FeaturePage } from "@/lib/feature-pages";
import type { MarketingLocale } from "@/lib/marketing-locale";

const UI: Record<MarketingLocale, { whatItDoes: string; howItWorks: string; plans: string; related: string; demo: string; start: string; allFeatures: string; others: string }> = {
  en: { whatItDoes: "What it does", howItWorks: "How it works", plans: "Plans", related: "Keep going", demo: "See the demo", start: "Start free trial", allFeatures: "All features", others: "More features" },
  fr: { whatItDoes: "Ce que ça fait", howItWorks: "Comment ça fonctionne", plans: "Forfaits", related: "Pour aller plus loin", demo: "Voir la démo", start: "Essai gratuit", allFeatures: "Toutes les fonctionnalités", others: "Autres fonctionnalités" },
};

/** Página de detalle de una función (server component: el contenido va en el HTML). Los CTA usan LocaleLink. */
export function FeaturePageView({ locale, page }: { locale: MarketingLocale; page: FeaturePage }) {
  const ui = UI[locale];
  const hero = page.hero[locale];
  return (
    <div lang={locale}>
      <header className="border-b border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">{hero.eyebrow}</p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">{hero.h1}</h1>
          <p className="mt-4 leading-relaxed text-slate-600">{hero.intro}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo" data-cta="demo_interactive" className="rounded-lg bg-brand-blue px-6 py-3 text-sm font-semibold text-white hover:bg-brand-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">{ui.demo}</Link>
            <Link href="/get-started" data-cta="signup_start" className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">{ui.start}</Link>
          </div>
        </div>
      </header>

      <section className="bg-white" aria-labelledby="fp-benefits">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 id="fp-benefits" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{ui.whatItDoes}</h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            {page.benefits[locale].map((b) => (
              <li key={b.title} className="rounded-2xl border border-slate-100 bg-white p-6">
                <h3 className="flex items-start gap-2 font-semibold text-slate-900"><Check aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-slate-50" aria-labelledby="fp-steps">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 id="fp-steps" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{ui.howItWorks}</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {page.steps[locale].map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-slate-100 bg-white p-6">
                <p className="text-xs font-semibold text-brand-blue">{i + 1}</p>
                <h3 className="mt-1 font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-slate-600"><strong className="text-slate-900">{ui.plans} · </strong>{page.plans[locale]}</p>
        </div>
      </section>

      <section className="bg-white" aria-labelledby="fp-related">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="fp-related" className="text-xl font-bold text-slate-900">{ui.related}</h2>
          <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {page.related.map((r) => (
              <li key={r.href}><Link href={relatedHref(locale, r.href)} className="font-semibold text-brand-blue hover:underline">{r.label[locale]} →</Link></li>
            ))}
            <li><Link href={locale === "fr" ? "/fr/fonctionnalites" : "/features"} className="font-semibold text-brand-blue hover:underline">{ui.allFeatures} →</Link></li>
          </ul>
          <p className="mt-6 text-sm text-slate-500">{ui.others}: {FEATURE_PAGES.filter((p) => p.id !== page.id).map((p, i, a) => (
            <span key={p.id}><Link href={featurePath(locale, p)} className="text-brand-blue hover:underline">{p.hero[locale].h1}</Link>{i < a.length - 1 ? " · " : ""}</span>
          ))}</p>
        </div>
      </section>
    </div>
  );
}
