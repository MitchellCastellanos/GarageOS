import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAppUrl, getRootDomain } from "@/config/app";
import { createHostSlugCache, hostWithoutPort, resolveShopSlugSafely, type HostLookups } from "@/lib/shop-host";

// IMPORTANT: Next.js only discovers `proxy.ts` next to the `app` directory. This project keeps `app` under `src/`, so the file must be
// `src/proxy.ts` (a copy at the repository root is ignored by the build). tests/proxy-location.test.ts pins this.
//
// Proxy corre en runtime Node.js por defecto (Next.js 16) — necesario porque el cliente Prisma usa el adapter pg, que abre sockets TCP.
export const config = {
  matcher: ["/"],
};

// Cache en memoria del proceso (por instancia serverless tibia) de host -> slug. Evita un roundtrip a la BD por cada visita a "/" en un
// dominio propio/subdominio — el único camino cacheable, ya que el matcher del proxy es solo "/". TTL corto: un dominio recién verificado
// o desconectado tarda como mucho esto en reflejarse. Los errores/timeouts no se cachean.
const cache = createHostSlugCache();

const lookups: HostLookups = {
  get rootDomain() {
    return getRootDomain();
  },
  async shopSlugBySubdomain(subdomain) {
    const shop = await db.shop.findUnique({ where: { slug: subdomain }, select: { slug: true } });
    return shop?.slug ?? null;
  },
  async shopSlugByVerifiedDomain(domain) {
    const row = await db.shopDomain.findUnique({
      where: { domain_purpose: { domain, purpose: "LANDING" } },
      select: { status: true, shop: { select: { slug: true } } },
    });
    return row?.status === "VERIFIED" && row.shop.slug ? row.shop.slug : null;
  },
};

export async function proxy(request: NextRequest) {
  const hostHeader = request.headers.get("host");
  if (!hostHeader) return NextResponse.next();

  const host = hostWithoutPort(hostHeader);
  const appHost = hostWithoutPort(new URL(getAppUrl()).host);
  // The application's own host never touches the database.
  if (host === appHost) return NextResponse.next();

  const slug = await resolveShopSlugSafely(host, lookups, cache, {
    // Kind only (never the host or any value): "timeout" or the error message of the lookup.
    onError: (kind) => console.error("[proxy] host lookup failed:", kind === "timeout" ? "timeout" : "error"),
  });
  if (!slug) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/book/${slug}`;
  return NextResponse.rewrite(url);
}
