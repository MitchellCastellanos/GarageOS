// Host → shop resolution used by src/proxy.ts (custom booking domains and `<slug>.<root domain>` subdomains).
// Kept out of the proxy file so it can be unit-tested with injected lookups. See docs/domain-model.md.

export const RESERVED_SUBDOMAINS = new Set(["www", "app", "admin", "platform", "api"]);

/** A host that never answers must not hold the home page hostage: past this the request is served normally (fail open). */
export const HOST_LOOKUP_TIMEOUT_MS = 1500;
export const HOST_SLUG_CACHE_TTL_MS = 60_000;

export function hostWithoutPort(host: string): string {
  return host.split(":")[0].toLowerCase();
}

export interface HostLookups {
  rootDomain: string | null;
  /** Slug of the shop with this subdomain, or null. */
  shopSlugBySubdomain(subdomain: string): Promise<string | null>;
  /** Slug of the shop owning a VERIFIED landing domain, or null. */
  shopSlugByVerifiedDomain(domain: string): Promise<string | null>;
}

export async function resolveShopSlug(host: string, l: HostLookups): Promise<string | null> {
  const rootDomain = l.rootDomain;
  if (rootDomain && host !== rootDomain && host.endsWith(`.${rootDomain}`)) {
    const subdomain = host.slice(0, -(rootDomain.length + 1));
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain) && !subdomain.includes(".")) return l.shopSlugBySubdomain(subdomain);
    return null;
  }
  return l.shopSlugByVerifiedDomain(host);
}

/** Rejects with `Error("timeout")` after `ms`; the underlying promise is left to settle on its own. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export interface HostSlugCache {
  get(host: string, now: number): { slug: string | null } | undefined;
  set(host: string, slug: string | null, now: number): void;
}

export function createHostSlugCache(ttlMs: number = HOST_SLUG_CACHE_TTL_MS): HostSlugCache {
  const map = new Map<string, { slug: string | null; expiresAt: number }>();
  return {
    get(host, now) {
      const hit = map.get(host);
      return hit && hit.expiresAt > now ? { slug: hit.slug } : undefined;
    },
    set(host, slug, now) {
      // Bound memory: hostnames are attacker-controlled (Host header).
      if (map.size >= 1000) map.clear();
      map.set(host, { slug, expiresAt: now + ttlMs });
    },
  };
}

/**
 * Cached, time-boxed, fail-open resolution. Errors and timeouts are NOT cached (a transient database problem must not pin a custom
 * domain to the marketing site for a minute) and resolve to null, i.e. the request is served as a normal request.
 */
export async function resolveShopSlugSafely(
  host: string,
  l: HostLookups,
  cache: HostSlugCache,
  opts: { now?: () => number; timeoutMs?: number; onError?: (kind: string) => void } = {},
): Promise<string | null> {
  const now = opts.now ?? Date.now;
  const hit = cache.get(host, now());
  if (hit) return hit.slug;
  try {
    const slug = await withTimeout(resolveShopSlug(host, l), opts.timeoutMs ?? HOST_LOOKUP_TIMEOUT_MS);
    cache.set(host, slug, now());
    return slug;
  } catch (e) {
    opts.onError?.(e instanceof Error ? e.message : "error");
    return null;
  }
}
