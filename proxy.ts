import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAppUrl, getRootDomain } from "@/config/app";

// Proxy corre en runtime Node.js por defecto (Next.js 16) — necesario porque
// el cliente Prisma usa el adapter pg, que abre sockets TCP.
export const config = {
  matcher: ["/"],
};

const RESERVED_SUBDOMAINS = new Set(["www", "app", "admin", "platform", "api"]);

function hostWithoutPort(host: string): string {
  return host.split(":")[0].toLowerCase();
}

// Cache en memoria del proceso (por instancia serverless tibia) de host -> slug.
// Evita un roundtrip a la BD por cada visita a "/" en un dominio propio/subdominio
// — el único camino cacheable, ya que el matcher del proxy es solo "/". TTL corto:
// un dominio recién verificado o desconectado tarda como mucho esto en reflejarse.
const HOST_SLUG_CACHE_TTL_MS = 60_000;
const hostSlugCache = new Map<string, { slug: string | null; expiresAt: number }>();

/**
 * Resuelve el slug del taller a partir del Host de la request: por
 * subdominio (`taller.garageos.com`) o por dominio propio verificado
 * (`citas.sutaller.com`, guardado en ShopDomain). Ver docs/domain-model.md.
 */
async function resolveShopSlugFromHost(host: string): Promise<string | null> {
  const cached = hostSlugCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.slug;

  const slug = await resolveShopSlugFromHostUncached(host);
  hostSlugCache.set(host, { slug, expiresAt: Date.now() + HOST_SLUG_CACHE_TTL_MS });
  return slug;
}

async function resolveShopSlugFromHostUncached(host: string): Promise<string | null> {
  const rootDomain = getRootDomain();

  if (rootDomain && host !== rootDomain && host.endsWith(`.${rootDomain}`)) {
    const subdomain = host.slice(0, -(rootDomain.length + 1));
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain) && !subdomain.includes(".")) {
      const shop = await db.shop.findUnique({
        where: { slug: subdomain },
        select: { slug: true },
      });
      if (shop?.slug) return shop.slug;
    }
    return null;
  }

  const domainRow = await db.shopDomain.findUnique({
    where: { domain_purpose: { domain: host, purpose: "LANDING" } },
    select: { status: true, shop: { select: { slug: true } } },
  });
  if (domainRow?.status === "VERIFIED" && domainRow.shop.slug) {
    return domainRow.shop.slug;
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const hostHeader = request.headers.get("host");
  if (!hostHeader) return NextResponse.next();

  const host = hostWithoutPort(hostHeader);
  const appHost = hostWithoutPort(new URL(getAppUrl()).host);
  if (host === appHost) return NextResponse.next();

  const slug = await resolveShopSlugFromHost(host);
  if (!slug) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/book/${slug}`;
  return NextResponse.rewrite(url);
}
