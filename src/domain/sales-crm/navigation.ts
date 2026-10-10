// External navigation links for ONE destination at a time. Coordinates only (validated numbers), so there is nothing to
// inject and nothing to mis-encode. Multi-stop navigation is not assumed to be supported by any of these apps.
export type NavApp = "google" | "apple" | "waze";
export const NAV_APPS: readonly NavApp[] = ["google", "apple", "waze"];

export function validCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const num = (n: number) => n.toFixed(6);

/** Returns an https URL that opens turn-by-turn directions to the destination, or null for an invalid coordinate. */
export function navigationUrl(app: NavApp, lat: number, lng: number): string | null {
  if (!validCoordinate(lat, lng)) return null;
  const ll = `${num(lat)},${num(lng)}`;
  switch (app) {
    case "google": return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll)}&travelmode=driving`;
    case "apple": return `https://maps.apple.com/?daddr=${encodeURIComponent(ll)}&dirflg=d`;
    case "waze": return `https://www.waze.com/ul?ll=${encodeURIComponent(ll)}&navigate=yes`;
    default: return null;
  }
}
