/**
 * QA-06: internal link audit over the PRERENDERED HTML (`.next/server/app/**.html`, produced by `next build`).
 *
 * Pages audited = every URL in the sitemap (`buildSitemapEntries`, the single source of truth for "indexable").
 * Enforced:
 *  1. No broken internal links: every internal `<a href>` resolves to a prerendered page, a registered route, a static file
 *     in `public/`, or an allowed dynamic/private prefix (/book, /admin, /watch, /api, /portal, /quote, ...).
 *  2. No in-site link to the legacy `/guides/*` URLs (they 301 to the Help Center).
 *  3. No EN indexable page links to a noindex FR draft, except the language switcher (`<a hreflang=...>`).
 *  4. No orphan: every indexable page except the home has >= 1 inbound link from ANOTHER indexable page (switcher excluded).
 * Prints an inbound-count table; writes it to the file named by WRITE_LINK_REPORT (relative to the repo root) when set.
 *
 * Skips with "run `next build` first" when `.next` is missing; CI builds first and scripts/ci/check-skips.mjs fails on the skip.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PRIVATE_ROUTE_PREFIXES } from "../src/lib/privacy/private-paths";
import { cleanPath, isFrenchPath, isIndexablePath, PUBLIC_ROUTES } from "../src/lib/seo/routes";
import { buildSitemapEntries } from "../src/lib/seo/sitemap-entries";

const root = process.cwd();
const BUILT = path.join(root, ".next/server/app");
const built = fs.existsSync(path.join(BUILT, "index.html"));
const skip = !built && "run `next build` first";

/** Dynamic / app prefixes whose pages are not prerendered but are legitimate link targets. */
const ALLOWED_PREFIXES = [...PRIVATE_ROUTE_PREFIXES, "/book", "/watch"];
/** Files served from the app router (metadata routes) rather than from `public/`. */
const ALLOWED_FILES = new Set(["/sitemap.xml", "/robots.txt", "/icon.png", "/apple-icon.png", "/favicon.ico"]);
const HOSTS = new Set(["garage-os.ca", "www.garage-os.ca", "localhost"]);

function walkHtml(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${base}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walkHtml(path.join(dir, entry.name), rel));
    else if (entry.name.endsWith(".html")) out.push(rel);
  }
  return out;
}

function pathOfHtml(rel: string): string {
  const p = rel.replace(/\.html$/, "");
  return p === "/index" ? "/" : p;
}
const fileOfPath = (p: string) => path.join(BUILT, p === "/" ? "index.html" : `${p.slice(1)}.html`);
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');

interface Link {
  href: string; // normalised internal path
  raw: string;
  switcher: boolean;
  /** false when the link is in the header/nav or footer (site chrome). */
  contextual: boolean;
}

/** Internal `<a href>` targets of one HTML document, normalised (no hash/query/trailing slash). External/mailto/tel/javascript ignored. */
function extractInternalLinks(html: string): Link[] {
  // Site chrome (header/nav, footer) sits inside <main> in the layout, so "contextual" links = outside <header>/<footer>.
  const chrome: Array<[number, number]> = [];
  for (const m of html.matchAll(/<(header|footer)[\s>][\s\S]*?<\/\1>/g)) chrome.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  const links: Link[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>/g)) {
    const attrs = ` ${m[1]}`;
    const hrefMatch = attrs.match(/\shref="([^"]*)"/);
    if (!hrefMatch) continue;
    const raw = decode(hrefMatch[1]).trim();
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|sms:|javascript:|data:)/i.test(raw)) continue;
    let target = raw;
    if (/^\/\//.test(target)) target = `https:${target}`;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      let url: URL;
      try {
        url = new URL(target);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol) || !HOSTS.has(url.hostname)) continue; // external
      target = url.pathname + url.search;
    }
    if (!target.startsWith("/")) continue; // relative hrefs are not used on the site
    const index = m.index ?? 0;
    links.push({
      href: cleanPath(target),
      raw,
      switcher: /\shreflang="/i.test(attrs),
      contextual: !chrome.some(([a, b]) => index >= a && index < b),
    });
  }
  return links;
}

interface Audit {
  indexable: string[];
  /** page -> links found in its prerendered HTML */
  links: Map<string, Link[]>;
  known: (p: string) => boolean;
}

let cached: Audit | null = null;
function audit(): Audit {
  if (cached) return cached;
  const indexable = [...new Set(buildSitemapEntries().map((e) => new URL(e.url).pathname).map(cleanPath))].sort();
  const prerendered = new Set(walkHtml(BUILT).map(pathOfHtml));
  const registered = new Set<string>();
  for (const r of PUBLIC_ROUTES) {
    registered.add(r.en);
    if (r.fr) registered.add(r.fr);
  }
  const publicDir = path.join(root, "public");
  const known = (p: string): boolean => {
    if (prerendered.has(p) || registered.has(p) || ALLOWED_FILES.has(p)) return true;
    if (ALLOWED_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) return true;
    return fs.existsSync(path.join(publicDir, p)) && fs.statSync(path.join(publicDir, p)).isFile();
  };
  const links = new Map<string, Link[]>();
  for (const page of indexable) {
    const file = fileOfPath(page);
    assert.ok(fs.existsSync(file), `${page}: in the sitemap but not prerendered at ${path.relative(root, file)}`);
    links.set(page, extractInternalLinks(fs.readFileSync(file, "utf8")));
  }
  cached = { indexable, links, known };
  return cached;
}

const isLegacyGuide = (p: string) => p === "/guides" || p.startsWith("/guides/");

test("link audit: every internal link resolves (no broken internal links)", { skip }, () => {
  const { links, known } = audit();
  const broken: string[] = [];
  for (const [page, list] of links) {
    for (const l of list) if (!isLegacyGuide(l.href) && !known(l.href)) broken.push(`${page} -> ${l.raw}`);
  }
  assert.deepEqual([...new Set(broken)], [], `broken internal links:\n${broken.join("\n")}`);
});

test("link audit: no in-site link to legacy /guides/* (301 to the Help Center)", { skip }, () => {
  const bad: string[] = [];
  for (const [page, list] of audit().links) for (const l of list) if (isLegacyGuide(l.href)) bad.push(`${page} -> ${l.raw}`);
  assert.deepEqual([...new Set(bad)], [], `links to legacy guides:\n${bad.join("\n")}`);
});

test("link audit: EN indexable pages do not link to noindex FR drafts (language switcher excepted)", { skip }, () => {
  const bad: string[] = [];
  for (const [page, list] of audit().links) {
    if (isFrenchPath(page)) continue;
    for (const l of list) if (!l.switcher && isFrenchPath(l.href) && !isIndexablePath(l.href)) bad.push(`${page} -> ${l.raw}`);
  }
  assert.deepEqual([...new Set(bad)], [], `EN -> noindex FR links:\n${bad.join("\n")}`);
});

/** inbound[target] = pages (other than itself) that link to it; body = same, counting only links outside the header/footer chrome. */
function inboundCounts() {
  const { indexable, links } = audit();
  const set = new Set(indexable);
  const all = new Map<string, Set<string>>(indexable.map((p) => [p, new Set()]));
  const body = new Map<string, Set<string>>(indexable.map((p) => [p, new Set()]));
  for (const [page, list] of links) {
    for (const l of list) {
      if (l.switcher || l.href === page || !set.has(l.href)) continue;
      all.get(l.href)!.add(page);
      if (l.contextual) body.get(l.href)!.add(page);
    }
  }
  return { all, body };
}

function renderReport(): string {
  const { indexable } = audit();
  const { all, body } = inboundCounts();
  const rows = indexable.map((p) => `| \`${p}\` | ${all.get(p)!.size} | ${body.get(p)!.size} |`);
  return [
    "# Internal link audit",
    "",
    "Generated by `tests/link-audit.test.ts` from the prerendered HTML after `next build` (`WRITE_LINK_REPORT=docs/link-audit.md`).",
    "Counts = distinct OTHER indexable (sitemap) pages linking to the page; language-switcher links excluded.",
    "\"Contextual\" counts only links outside the header and footer (i.e. editorial/body links, not site chrome).",
    "",
    "| Page | Inbound (all) | Inbound (contextual) |",
    "|---|---:|---:|",
    ...rows,
    "",
  ].join("\n");
}

test("link audit: no orphan pages (every sitemap URL except the home has an inbound link from another indexable page)", { skip }, () => {
  const { indexable } = audit();
  const { all } = inboundCounts();
  const report = renderReport();
  console.log(report);
  const target = process.env.WRITE_LINK_REPORT;
  if (target) {
    const out = path.resolve(root, target);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, report);
  }
  const orphans = indexable.filter((p) => p !== "/" && all.get(p)!.size === 0);
  assert.deepEqual(orphans, [], `orphan pages (no inbound link from another indexable page):\n${orphans.join("\n")}`);
});

test("link audit: extractor normalises hrefs and ignores non-internal targets", () => {
  const html = [
    '<a href="/pricing/#plans">a</a>',
    '<a href="/help?x=1#y">b</a>',
    '<a href="https://www.garage-os.ca/about/">c</a>',
    '<a href="https://example.com/pricing">d</a>',
    '<a href="mailto:x@y.z">e</a>',
    '<a href="tel:+15145550100">f</a>',
    '<a href="javascript:void(0)">g</a>',
    '<a class="x" href="/fr/produit" hreflang="fr-CA">h</a>',
  ].join("");
  const links = extractInternalLinks(html);
  assert.deepEqual(
    links.map((l) => l.href),
    ["/pricing", "/help", "/about", "/fr/produit"],
  );
  assert.deepEqual(links.map((l) => l.switcher), [false, false, false, true]);
});
