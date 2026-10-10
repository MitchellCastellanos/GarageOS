#!/usr/bin/env node
// Checks that the CDN serves the four videos the way a <video> element needs: HTTPS, video/mp4, byte ranges (206), long cache,
// and a plausible size. Read-only (HEAD + a 1 KB ranged GET). No credentials.
//   node scripts/video/verify-cdn.mjs https://videos.example-cdn.ca [v1]
const base = (process.argv[2] ?? "").replace(/\/+$/, "");
const version = process.argv[3] ?? "v1";
if (!/^https:\/\//.test(base)) { console.error("usage: verify-cdn.mjs https://<cdn-host> [version]"); process.exit(2); }
const expected = { commercial: [10e6, 40e6], teaser: [2e6, 12e6] }; // sanity bounds in bytes (approved files: ~19 MB and ~5 MB)
let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };
for (const kind of ["commercial", "teaser"]) for (const lang of ["en", "fr"]) {
  const url = `${base}/garageos-${kind}-${lang}-${version}.mp4`;
  try {
    const h = await fetch(url, { method: "HEAD", redirect: "follow" });
    const len = Number(h.headers.get("content-length") ?? 0);
    const cc = h.headers.get("cache-control") ?? "";
    ok(h.status === 200, `${kind}-${lang}: HEAD ${h.status}`);
    ok((h.headers.get("content-type") ?? "").startsWith("video/mp4"), `${kind}-${lang}: content-type ${h.headers.get("content-type")}`);
    ok((h.headers.get("accept-ranges") ?? "").includes("bytes"), `${kind}-${lang}: accept-ranges ${h.headers.get("accept-ranges")}`);
    ok(/max-age=(\d+)/.test(cc) && Number(/max-age=(\d+)/.exec(cc)[1]) >= 86400, `${kind}-${lang}: cache-control "${cc}" (>= 1 day; use immutable with versioned names)`);
    ok(len >= expected[kind][0] && len <= expected[kind][1], `${kind}-${lang}: ${(len / 1e6).toFixed(1)} MB`);
    const r = await fetch(url, { headers: { Range: "bytes=0-1023" } });
    ok(r.status === 206 && /^bytes 0-1023\//.test(r.headers.get("content-range") ?? ""), `${kind}-${lang}: range request -> ${r.status} ${r.headers.get("content-range")}`);
    await r.arrayBuffer();
  } catch (e) { ok(false, `${kind}-${lang}: ${e.message}`); }
}
process.exit(bad ? 1 : 0);
