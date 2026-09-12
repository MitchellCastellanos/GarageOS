"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";

interface EmbedSnippetCardProps {
  bookingUrl: string | null;
}

export function EmbedSnippetCard({ bookingUrl }: EmbedSnippetCardProps) {
  if (!bookingUrl) return null;

  const embedUrl = `${bookingUrl}?embed=1`;
  const snippet = `<iframe src="${embedUrl}" style="width:100%;max-width:480px;height:720px;border:0" loading="lazy" title="Reservar cita"></iframe>`;

  function copy() {
    navigator.clipboard.writeText(snippet);
    toast.success("Código copiado");
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">Widget para tu sitio web</h2>
        <p className="text-sm text-slate-500 mt-1">
          Si ya tienes un sitio propio, pega este código donde quieras mostrar el
          formulario de citas — sin header ni footer, solo el calendario.
        </p>
      </div>

      <div className="relative">
        <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4 overflow-x-auto">
          <code>{snippet}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          className="absolute top-2 right-2 flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
        >
          <Copy className="w-3.5 h-3.5" />
          Copiar
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Ajusta el ancho/alto del iframe a tu diseño. Si no tienes sitio propio, usa la
        landing pública en la sección de citas más arriba, o configura un dominio
        propio abajo.
      </p>
    </div>
  );
}
