import { getResolvedEmailMatrix, type ShopEmailConfig } from "@/lib/email-config";

interface EmailRoutingPreviewProps {
  shop: ShopEmailConfig;
}

export function EmailRoutingPreview({ shop }: EmailRoutingPreviewProps) {
  const matrix = getResolvedEmailMatrix(shop);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">Correos automáticos</h2>
        <p className="text-sm text-slate-500 mt-1">
          Todos los correos al cliente salen de info@ — el mismo que aparece en la
          factura. Configura el buzón en IONOS y Resend enviará en tu nombre.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Canal</th>
              <th className="px-4 py-3 font-semibold">Remitente (FROM)</th>
              <th className="px-4 py-3 font-semibold">Respuestas (Reply-To)</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matrix.map((row) => (
              <tr key={row.channel} className={!row.implemented ? "opacity-60" : undefined}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{row.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{row.description}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">
                  {row.ok ? row.from : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">
                  {row.ok ? row.replyTo : "—"}
                </td>
                <td className="px-4 py-3">
                  {!row.implemented ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      Próximamente
                    </span>
                  ) : row.ok ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                      Listo
                    </span>
                  ) : (
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                      title={row.error}
                    >
                      Falta config
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Newsletter usará {shop.newsletterEmail?.trim() || "newsletter@"} con Brevo/Mailchimp
        cuando esté activo — no pasa por Resend.
      </p>
    </div>
  );
}