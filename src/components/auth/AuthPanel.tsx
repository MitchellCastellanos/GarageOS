import Link from "next/link";

interface AuthPanelProps {
  topBarText: string;
  topBarLinkHref: string;
  topBarLinkLabel: string;
  children: React.ReactNode;
}

// Lado derecho (claro) de /admin/login y /admin/signup: barra superior con
// el link cruzado entre las dos pantallas + la tarjeta del formulario.
export function AuthPanel({ topBarText, topBarLinkHref, topBarLinkLabel, children }: AuthPanelProps) {
  return (
    <div className="flex-1 relative overflow-hidden bg-slate-50">
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-brand-blue/10 blur-3xl" />
      <div className="pointer-events-none absolute top-0 right-0 w-64 h-64 rounded-full bg-brand-blue/5 blur-2xl" />

      <div className="relative flex justify-end px-6 py-6 sm:px-10">
        <p className="text-sm text-slate-500">
          {topBarText}{" "}
          <Link
            href={topBarLinkHref}
            className="inline-block ml-1 font-semibold text-brand-blue bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition-colors"
          >
            {topBarLinkLabel}
          </Link>
        </p>
      </div>

      <div className="relative flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
