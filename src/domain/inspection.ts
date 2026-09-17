export const INSPECTION_CHECKLIST_CATEGORIES = [
  "TIRES",
  "BRAKES",
  "BATTERY",
  "LIGHTS",
  "FLUIDS",
  "WIPERS",
  "SUSPENSION",
  "EXHAUST",
  "BELTS_HOSES",
  "MIRRORS_GLASS",
] as const;

export type InspectionChecklistCategory = (typeof INSPECTION_CHECKLIST_CATEGORIES)[number];

/** Un hallazgo cuenta como pendiente de trabajo si no está en buen estado. */
export function isFinding(condition: string): boolean {
  return condition === "ATTENTION" || condition === "SERVICE_REQUIRED";
}

export function countFindings(items: { condition: string }[]): number {
  return items.filter((item) => isFinding(item.condition)).length;
}
