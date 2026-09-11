export function PageHero({
  eyebrow,
  heading,
  description,
}: {
  eyebrow: string;
  heading: string;
  description?: string;
}) {
  return (
    <section className="bg-slate-50 border-b border-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">{eyebrow}</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">{heading}</h1>
        {description && <p className="mt-4 text-slate-600 leading-relaxed">{description}</p>}
      </div>
    </section>
  );
}
