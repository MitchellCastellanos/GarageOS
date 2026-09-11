"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink, FileText, X } from "lucide-react";

export type PaymentReceiptView = {
  id: string;
  label: string;
  url: string;
  fileName: string;
  isImage: boolean;
};

export function InvoicePaymentReceipts({ receipts }: { receipts: PaymentReceiptView[] }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (receipts.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {receipts.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
          >
            <div className="px-3 py-2 border-b border-slate-100 bg-white">
              <p className="text-sm font-medium text-slate-900">{r.label}</p>
              <p className="text-xs text-slate-500 truncate">{r.fileName}</p>
            </div>
            {r.isImage ? (
              <button
                type="button"
                onClick={() => setPreviewUrl(r.url)}
                className="block w-full relative aspect-[4/3] bg-slate-100 hover:opacity-95 transition-opacity"
              >
                <Image
                  src={r.url}
                  alt={r.fileName}
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 100vw, 320px"
                  unoptimized
                />
              </button>
            ) : (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-8 text-sm text-blue-600 hover:text-blue-800"
              >
                <FileText className="w-5 h-5" />
                Ver comprobante PDF
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <div className="px-3 py-2 border-t border-slate-100 bg-white">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Abrir en pestaña nueva
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          onClick={() => setPreviewUrl(null)}
          onKeyDown={(e) => e.key === "Escape" && setPreviewUrl(null)}
          role="dialog"
          aria-modal
        >
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="w-6 h-6" />
          </button>
          <div
            className="relative w-full max-w-3xl aspect-[4/3]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={previewUrl}
              alt="Comprobante"
              fill
              className="object-contain"
              sizes="100vw"
              unoptimized
            />
          </div>
        </div>
      )}
    </>
  );
}
