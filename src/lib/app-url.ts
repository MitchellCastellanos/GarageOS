/** URL pública de la app — logos en emails, links absolutos, etc. */
export { getAppUrl } from "@/config/app";

/** Logo de respaldo cuando el taller no tiene logo propio. GarageOS no tiene logo genérico todavía. */
export function getDefaultEmailLogoUrl(): string | null {
  return null;
}
