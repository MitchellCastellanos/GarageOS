import "server-only";
import type { MapConfig } from "@/components/sales-field/RouteMap";

/**
 * Interactive-map gate. The map renders ONLY when the owner has configured an approved tile style (MAP_STYLE_URL, https) AND the
 * attribution text that provider requires (MAP_ATTRIBUTION). Both are public values shipped to the browser: never put a secret
 * key in them (use a domain-restricted public token). No provider is configured or approved today, so by default this is null and
 * the planner runs list-first with a schematic plot.
 */
export function getMapConfig(env: NodeJS.ProcessEnv = process.env): MapConfig | null {
  const styleUrl = (env.MAP_STYLE_URL ?? "").trim(), attribution = (env.MAP_ATTRIBUTION ?? "").trim();
  if (!styleUrl || !attribution) return null;
  try { if (new URL(styleUrl).protocol !== "https:") return null; } catch { return null; }
  return { styleUrl, attribution };
}
