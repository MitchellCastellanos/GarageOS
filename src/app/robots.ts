import type { MetadataRoute } from "next";
import { PRIVATE_ROUTE_PREFIXES } from "@/lib/privacy/private-paths";

/**
 * Lo público (marketing, Resources, /watch, páginas de reserva de cada taller) queda rastreable. Se bloquean
 * la aplicación, las APIs y las rutas con token. Con barra final o `$` para no capturar rutas públicas futuras
 * que compartan prefijo (p. ej. /quote-software).
 *
 * Esto reduce el rastreo, no es seguridad: los enlaces con token se protegen con el propio token y llevan además
 * `noindex` (metadata y X-Robots-Tag). Si Search Console llegara a mostrar una URL privada indexada, hay que quitar
 * su Disallow temporalmente para que el rastreador pueda leer el `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_ROUTE_PREFIXES.flatMap((prefix) => [`${prefix}/`, `${prefix}$`]), "/book/*/manage/"],
      },
    ],
  };
}
