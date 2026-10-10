/**
 * Tabla única de rutas públicas bilingües. De aquí salen los enlaces localizados, el selector de idioma, y (en los
 * siguientes PRs) el sitemap y los hreflang. Una página nueva se registra aquí o no existe para el selector.
 *
 * Reglas:
 *  - EN vive en la ruta actual sin prefijo; FR vive bajo `/fr/` con slug traducido.
 *  - `frStatus: "live"` = la página francesa existe; "planned" = prevista (todavía no hay archivo de ruta);
 *    "none" = no se prevé equivalente francés por ahora.
 *  - `frIndexable: false` mantiene la página francesa fuera de buscadores (noindex) hasta que haya sitemap y hreflang.
 *  - Fallback del selector de idioma (explícito y determinista, ver `switchTarget`): equivalente exacto → si no existe,
 *    el ancestro (`parent`) más cercano que sí exista en el otro idioma → si no, la home de ese idioma.
 */
import type { MarketingLocale } from "@/lib/marketing-locale";

export type FrStatus = "live" | "planned" | "none";

export interface PublicRoute {
  id: string;
  en: string;
  fr?: string;
  frStatus: FrStatus;
  frIndexable?: boolean;
  /** Id de la página "ancestro" usada como fallback cuando no hay equivalente exacto. */
  parent?: string;
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { id: "home", en: "/", fr: "/fr", frStatus: "live", frIndexable: false },
  { id: "product", en: "/product", fr: "/fr/produit", frStatus: "planned", parent: "home" },
  { id: "features", en: "/features", fr: "/fr/fonctionnalites", frStatus: "planned", parent: "home" },
  { id: "pricing", en: "/pricing", fr: "/fr/tarifs", frStatus: "planned", parent: "home" },
  { id: "integrations", en: "/integrations", fr: "/fr/integrations", frStatus: "planned", parent: "home" },
  { id: "demo", en: "/demo", fr: "/fr/demo", frStatus: "planned", parent: "home" },
  { id: "getStarted", en: "/get-started", fr: "/fr/commencer", frStatus: "planned", parent: "home" },
  { id: "quickStart", en: "/quick-start", fr: "/fr/demarrage-rapide", frStatus: "planned", parent: "help" },
  { id: "about", en: "/about", fr: "/fr/a-propos", frStatus: "planned", parent: "home" },
  { id: "contact", en: "/contact", fr: "/fr/contact", frStatus: "planned", parent: "home" },
  { id: "privacy", en: "/privacy", fr: "/fr/confidentialite", frStatus: "planned", parent: "home" },
  { id: "terms", en: "/terms", fr: "/fr/conditions", frStatus: "planned", parent: "home" },
  { id: "changelog", en: "/changelog", fr: "/fr/nouveautes", frStatus: "planned", parent: "help" },
  { id: "help", en: "/help", fr: "/fr/aide", frStatus: "planned", parent: "home" },
  // Sin equivalente francés hasta la tanda de Resources: caen en su ancestro.
  { id: "guides", en: "/guides", frStatus: "none", parent: "help" },
  { id: "blog", en: "/blog", frStatus: "none", parent: "home" },
];

export interface RouteFamily {
  prefix: string;
  routeId: string;
}

const FR_PREFIX = "/fr";

/** Quita query, hash y barra final (salvo la raíz). */
export function cleanPath(input: string): string {
  const path = (input.split(/[?#]/)[0] || "/").trim();
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : "/";
}

export function isFrenchPath(pathname: string): boolean {
  const path = cleanPath(pathname);
  return path === FR_PREFIX || path.startsWith(`${FR_PREFIX}/`);
}

export interface RouteMatch {
  route: PublicRoute;
  /** Idioma de la ruta que se está visitando. */
  locale: MarketingLocale;
  /** true si es una página hija dinámica (p. ej. /guides/<slug>), no la ruta registrada en sí. */
  child: boolean;
}

export type SwitchTarget =
  | { kind: "current" }
  | { kind: "link"; href: string; fallback: boolean }
  /** Ruta no registrada (login, registro…): el idioma se cambia en el sitio, sin navegar. */
  | { kind: "inplace" };

/** Lógica de rutas sobre una tabla dada (la real, o una de prueba). */
export function createRouter(routes: readonly PublicRoute[], families: readonly RouteFamily[]) {
  const byId = new Map(routes.map((route) => [route.id, route] as const));
  const home = routes.find((route) => route.id === "home")!;

  function matchRoute(pathname: string): RouteMatch | null {
    const path = cleanPath(pathname);
    for (const route of routes) {
      if (route.en === path) return { route, locale: "en", child: false };
      if (route.fr && route.fr === path) return { route, locale: "fr", child: false };
    }
    for (const family of families) {
      if (path.startsWith(family.prefix) && path.length > family.prefix.length) {
        const route = byId.get(family.routeId);
        if (route) return { route, locale: "en", child: true };
      }
    }
    return null;
  }

  /**
   * Idioma que fija la ruta: "fr" bajo /fr, "en" en una página pública registrada, `null` en cualquier otra ruta
   * (login, registro…), donde el idioma sigue siendo una preferencia del usuario.
   */
  function fixedLocaleForPath(pathname: string): MarketingLocale | null {
    if (isFrenchPath(pathname)) return "fr";
    return matchRoute(pathname) ? "en" : null;
  }

  const frontDoor = (locale: MarketingLocale) => (locale === "fr" ? home.fr! : home.en);
  const hrefIn = (route: PublicRoute, locale: MarketingLocale) =>
    locale === "en" ? route.en : route.frStatus === "live" && route.fr ? route.fr : null;

  /**
   * A dónde lleva el selector de idioma desde `pathname` hacia `target`.
   *  1. Misma página en el otro idioma si existe (`fallback: false`; una página hija dinámica cae en el índice de su
   *     familia, con `fallback: true`).
   *  2. Si no, el ancestro más cercano que exista en ese idioma (`fallback: true`).
   *  3. Si no, la home de ese idioma (`fallback: true`).
   * Rutas desconocidas (login, registro…) → `inplace`; una /fr/… no registrada se trata como francesa.
   */
  function switchTarget(pathname: string, target: MarketingLocale): SwitchTarget {
    const match = matchRoute(pathname);
    if (!match) {
      if (!isFrenchPath(pathname)) return { kind: "inplace" };
      return target === "fr" ? { kind: "current" } : { kind: "link", href: frontDoor("en"), fallback: true };
    }
    if (match.locale === target) return { kind: "current" };
    // Una página registrada tiene equivalente exacto; una hija dinámica (/guides/<slug>) solo puede caer en su familia.
    const same = hrefIn(match.route, target);
    if (same) return { kind: "link", href: same, fallback: match.child };
    const seen = new Set<string>([match.route.id]);
    let ancestor = match.route.parent ? byId.get(match.route.parent) : undefined;
    while (ancestor && !seen.has(ancestor.id)) {
      seen.add(ancestor.id);
      const href = hrefIn(ancestor, target);
      if (href) return { kind: "link", href, fallback: true };
      ancestor = ancestor.parent ? byId.get(ancestor.parent) : undefined;
    }
    return { kind: "link", href: frontDoor(target), fallback: true };
  }

  /**
   * Localiza un enlace interno escrito en inglés para el idioma de la página: en francés, si la página destino ya
   * tiene equivalente `live`, apunta a ella; si no, se deja el enlace tal cual (nunca se inventa una URL).
   */
  function localizeHref(href: string, locale: MarketingLocale): string {
    if (locale !== "fr" || !href.startsWith("/") || href.startsWith("//")) return href;
    const cut = href.search(/[?#]/);
    const path = cut === -1 ? href : href.slice(0, cut);
    const suffix = cut === -1 ? "" : href.slice(cut);
    const route = routes.find((r) => r.en === cleanPath(path));
    return route && route.frStatus === "live" && route.fr ? `${route.fr}${suffix}` : href;
  }

  /**
   * ¿Debe indexarse esta página pública? Las inglesas, siempre. Las francesas, solo si están `live` y no marcadas
   * `frIndexable: false` (piloto a la espera de sitemap y hreflang). Una ruta no registrada se considera indexable aquí:
   * quien llama aplica sus propias reglas (privadas, tokens…).
   */
  function isIndexablePath(pathname: string): boolean {
    const match = matchRoute(pathname);
    if (!match || match.locale === "en") return true;
    return match.route.frStatus === "live" && match.route.frIndexable !== false;
  }

  return { matchRoute, fixedLocaleForPath, switchTarget, localizeHref, isIndexablePath, getRoute: (id: string) => byId.get(id) };
}

/** Familias dinámicas (páginas hijas de una ruta registrada): `/guides/<slug>` hereda el fallback de `guides`. */
export const ROUTE_FAMILIES: readonly RouteFamily[] = [
  { prefix: "/guides/", routeId: "guides" },
  { prefix: "/blog/", routeId: "blog" },
];

const router = createRouter(PUBLIC_ROUTES, ROUTE_FAMILIES);
export const { matchRoute, fixedLocaleForPath, switchTarget, localizeHref, isIndexablePath, getRoute } = router;
