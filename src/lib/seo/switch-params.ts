import { sanitizeCampaignValue } from "@/lib/privacy/private-paths";

/** Únicos parámetros que se conservan al cambiar de idioma: campaña de marketing. Nada con forma de token. */
const CARRIED = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

/** Devuelve `?utm_…` saneado (o cadena vacía) a partir del query de la página actual. */
export function carriedSearch(search: string): string {
  const source = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const key of CARRIED) {
    const value = sanitizeCampaignValue(source.get(key) ?? "");
    if (value) out.set(key, value);
  }
  const text = out.toString();
  return text ? `?${text}` : "";
}
