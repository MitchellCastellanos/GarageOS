import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = {
  title: "Gestión diaria para talleres independientes",
};

// Placeholder — el dashboard operativo (src/app/admin) es la prioridad actual.
// Esta landing pública se diseña después; ver docs/roadmap.md.
export default function HomePage() {
  return (
    <main className="min-h-full flex items-center justify-center bg-slate-950 text-center px-4 py-24">
      <div className="max-w-lg">
        <p className="font-sans font-black uppercase text-red-500 text-sm tracking-[0.3em] mb-4">
          {APP_NAME}
        </p>
        <h1 className="font-sans font-black uppercase text-white text-3xl sm:text-4xl leading-tight tracking-tight">
          Gestión diaria para talleres mecánicos independientes
        </h1>
        <p className="mt-4 text-slate-400">
          Clientes, vehículos, agenda, cotizaciones y facturas en un solo lugar.
        </p>
        <Link
          href="/admin/login"
          className="mt-8 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold uppercase tracking-wide text-sm px-6 py-3.5 rounded-xl transition-colors"
        >
          Entrar al panel
        </Link>
      </div>
    </main>
  );
}
