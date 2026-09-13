"use client";

import { toast } from "sonner";
import { Copy, ExternalLink, MessageCircle, Share2 } from "lucide-react";

interface ShareBookingCardProps {
  shopName: string;
  bookingUrl: string | null;
}

function copyToClipboard(text: string, message: string) {
  navigator.clipboard.writeText(text);
  toast.success(message);
}

export function ShareBookingCard({ shopName, bookingUrl }: ShareBookingCardProps) {
  if (!bookingUrl) return null;

  const embedUrl = `${bookingUrl}?embed=1`;
  const iframeSnippet = `<iframe src="${embedUrl}" style="width:100%;max-width:480px;height:720px;border:0" loading="lazy" title="Reservar cita"></iframe>`;
  const buttonSnippet = `<a href="${bookingUrl}" target="_blank" rel="noopener" style="display:inline-block;background:#0d9488;color:#fff;font-family:sans-serif;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">Reservar cita</a>`;
  const caption = `¡Reserva tu cita en ${shopName} en línea! 🔧🚗`;

  const shareLinks = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${caption}\n${bookingUrl}`)}`,
      className: "bg-emerald-600 hover:bg-emerald-700",
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(bookingUrl)}`,
      className: "bg-blue-600 hover:bg-blue-700",
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(bookingUrl)}`,
      className: "bg-slate-800 hover:bg-slate-900",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
      <div>
        <h2 className="font-semibold text-slate-900">Comparte tu página de citas</h2>
        <p className="text-sm text-slate-500 mt-1">
          Un solo enlace con el slug de tu taller — pégalo en tu bio, WhatsApp, o úsalo
          para un botón o widget en tu sitio.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 bg-teal-50 border border-teal-100 rounded-lg">
        <code className="text-xs text-teal-800 flex-1 break-all">{bookingUrl}</code>
        <button
          type="button"
          onClick={() => copyToClipboard(bookingUrl, "Enlace copiado")}
          className="p-2 text-teal-700 hover:bg-teal-100 rounded-lg"
          title="Copiar enlace"
        >
          <Copy className="w-4 h-4" />
        </button>
        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-teal-700 hover:bg-teal-100 rounded-lg"
          title="Abrir página de reservas"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-2">Compartir en redes</h3>
        <div className="flex flex-wrap gap-2">
          {shareLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 text-white text-sm font-medium px-4 py-2 rounded-lg ${link.className}`}
            >
              <Share2 className="w-3.5 h-3.5" />
              {link.label}
            </a>
          ))}
          <button
            type="button"
            onClick={() => copyToClipboard(`${caption}\n${bookingUrl}`, "Texto copiado")}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg border border-slate-200"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Copiar texto
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          &ldquo;{caption}&rdquo; — úsalo tal cual en Instagram/TikTok donde no hay enlace directo,
          o copia el texto para pegarlo donde quieras.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-2">Botón para tu sitio web</h3>
        <SnippetBlock code={buttonSnippet} />
        <p className="text-xs text-slate-400 mt-2">
          Un botón simple que lleva a tu página de citas — pégalo donde quieras un
          &ldquo;Reservar cita&rdquo;.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-2">Widget embebido</h3>
        <SnippetBlock code={iframeSnippet} />
        <p className="text-xs text-slate-400 mt-2">
          Si prefieres mostrar el calendario completo dentro de tu sitio en vez de un botón
          — sin header ni footer, solo el formulario.
        </p>
      </div>
    </div>
  );
}

function SnippetBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4 overflow-x-auto">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => copyToClipboard(code, "Código copiado")}
        className="absolute top-2 right-2 flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
      >
        <Copy className="w-3.5 h-3.5" />
        Copiar
      </button>
    </div>
  );
}
