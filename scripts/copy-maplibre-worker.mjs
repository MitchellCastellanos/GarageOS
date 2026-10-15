// maplibre-gl 6 locates its web worker relative to the bundled chunk, which Next does not emit -> 404 (HTML) in production.
// We serve the worker from /public and point maplibre at it with setWorkerUrl() (see RouteMap.tsx). Copied from node_modules so it
// always matches the installed maplibre-gl version; the copy is git-ignored.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";

const src = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
if (!existsSync(src)) { console.warn(`[maplibre-worker] ${src} not found — skipping`); process.exit(0); }
mkdirSync("public", { recursive: true });
copyFileSync(src, "public/maplibre-gl-worker.mjs");
console.log("[maplibre-worker] copied to public/maplibre-gl-worker.mjs");
