import "server-only";
import type { MapConfig } from "@/components/sales-field/RouteMap";

const MAPBOX_ATTRIBUTION =
  '<a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer">© Mapbox</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a> ' +
  '<a href="https://www.mapbox.com/map-feedback/" target="_blank" rel="noopener noreferrer"><strong>Improve this map</strong></a>';

/**
 * Interactive-map gate. The map renders ONLY when the owner has configured an approved basemap:
 *  1. Mapbox (MAP_PROVIDER=mapbox + MAPBOX_PUBLIC_TOKEN): Mapbox raster tiles drawn by the existing MapLibre integration. The token
 *     is PUBLIC by design (shipped to the browser) so it MUST be a "pk." token restricted to the GarageOS domains in the Mapbox
 *     account; a secret "sk." token is refused here and can never reach the client bundle.
 *  2. Any other approved style (MAP_STYLE_URL, https + MAP_ATTRIBUTION), unchanged.
 * Otherwise null: the planner runs list-first with the schematic plot.
 */
export function getMapConfig(env: NodeJS.ProcessEnv = process.env): MapConfig | null {
  if ((env.MAP_PROVIDER ?? "").trim().toLowerCase() === "mapbox") {
    const token = (env.MAPBOX_PUBLIC_TOKEN ?? "").trim();
    const style = (env.MAPBOX_MAP_STYLE ?? "mapbox/streets-v12").trim();
    if (!/^pk\.[A-Za-z0-9_.-]{20,}$/.test(token) || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(style)) return null;
    return { rasterTiles: [`https://api.mapbox.com/styles/v1/${style}/tiles/512/{z}/{x}/{y}?access_token=${token}`], tileSize: 512, attribution: MAPBOX_ATTRIBUTION };
  }
  const styleUrl = (env.MAP_STYLE_URL ?? "").trim(), attribution = (env.MAP_ATTRIBUTION ?? "").trim();
  if (!styleUrl || !attribution) return null;
  try { if (new URL(styleUrl).protocol !== "https:") return null; } catch { return null; }
  return { styleUrl, attribution };
}
