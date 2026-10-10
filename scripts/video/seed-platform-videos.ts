// Registers (or updates) the four approved GarageOS videos in the existing PlatformVideo registry.
//
//   npx tsx scripts/video/seed-platform-videos.ts --cdn-base https://videos.example-cdn.ca --site https://www.garage-os.ca            # dry run
//   npx tsx scripts/video/seed-platform-videos.ts --cdn-base https://videos.example-cdn.ca --site https://www.garage-os.ca --yes     # write as DRAFT
//   npx tsx scripts/video/seed-platform-videos.ts ... --yes --publish                                                               # write and PUBLISH
//
// Files are expected at <cdn-base>/garageos-<commercial|teaser>-<en|fr>-v1.mp4 (see docs/sales-video.md). Nothing is written without
// --yes, nothing is published without --publish, and a URL that is not a real public https link is refused. The same thing can be
// done by hand in Platform → Sales → Settings → Videos.
import { db } from "../../src/lib/db";
import { canPublish, safeHttpsUrl } from "../../src/domain/platform-video";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);
const cdn = (arg("cdn-base") ?? "").replace(/\/+$/, "");
const site = (arg("site") ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
const version = arg("version") ?? "v1";
if (!safeHttpsUrl(cdn) || !safeHttpsUrl(site)) { console.error("Both --cdn-base and --site (or NEXT_PUBLIC_APP_URL) must be real https URLs."); process.exit(1); }

const TITLES = {
  commercial: { EN: "GarageOS in 60 seconds", FR: "GarageOS en 60 secondes" },
  teaser: { EN: "GarageOS in 15 seconds", FR: "GarageOS en 15 secondes" },
} as const;
const DESCRIPTION = { EN: "One connected system for independent repair shops.", FR: "Un seul système connecté pour les garages indépendants." } as const;

const plan = (["commercial", "teaser"] as const).flatMap((key) => (["EN", "FR"] as const).map((language) => ({
  key, language, title: TITLES[key][language], description: DESCRIPTION[language],
  url: `${cdn}/garageos-${key}-${language.toLowerCase()}-${version}.mp4`, thumbnailUrl: `${site}/video/thumb-${language.toLowerCase()}.jpg`,
})));

console.log(`Target database: ${new URL(process.env.DATABASE_URL ?? "postgresql://unset/").host}`);
for (const p of plan) console.log(`${p.key.padEnd(10)} ${p.language}  ${p.url}  ${canPublish(p) ? "" : "(NOT publishable)"}`);
if (!flag("yes")) { console.log("\nDry run. Add --yes to write (as DRAFT) and --publish to publish."); process.exit(0); }

for (const p of plan) {
  const status = flag("publish") && canPublish(p) ? "PUBLISHED" : "DRAFT";
  const data = { title: p.title, description: p.description, url: p.url, thumbnailUrl: p.thumbnailUrl, status, allowWebsite: true, allowOutreach: true, publishedAt: status === "PUBLISHED" ? new Date() : null } as const;
  await db.platformVideo.upsert({ where: { key_language: { key: p.key, language: p.language } }, create: { key: p.key, language: p.language, ...data }, update: data });
  console.log(`${status.padEnd(9)} ${p.key} ${p.language}`);
}
console.log("Done. The public pages pick the change up within 5 minutes (or immediately when saved through the admin screen).");
await db.$disconnect();
