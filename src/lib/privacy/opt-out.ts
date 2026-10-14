/** Do Not Track (`DNT: 1`) y Global Privacy Control (`Sec-GPC: 1`): el visitante pide no ser medido. */
export function isTrackingOptOut(headers: { get(name: string): string | null }): boolean {
  return headers.get("dnt")?.trim() === "1" || headers.get("sec-gpc")?.trim() === "1";
}
