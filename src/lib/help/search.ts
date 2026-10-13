import type { HelpSearchEntry } from "./index";

/** Minúsculas y sin diacríticos (« réservation » encuentra « reservation »), puntuación → espacio. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface HelpSearchResult {
  entry: HelpSearchEntry;
  score: number;
}

/**
 * Búsqueda local, sin servicio externo: todos los términos deben aparecer (título, resumen, categoría o texto);
 * puntúa título > resumen > categoría > texto. Consultas de menos de 2 caracteres no devuelven nada.
 */
export function searchHelp(entries: readonly HelpSearchEntry[], query: string, limit = 8): HelpSearchResult[] {
  const terms = normalizeText(query).split(" ").filter((t) => t.length >= 2);
  if (terms.length === 0) return [];
  const results: HelpSearchResult[] = [];
  for (const entry of entries) {
    const title = normalizeText(entry.title);
    const summary = normalizeText(entry.summary);
    const category = normalizeText(entry.category);
    const text = normalizeText(entry.text);
    let score = 0;
    let all = true;
    for (const term of terms) {
      const hit = (title.includes(term) ? 5 : 0) + (summary.includes(term) ? 3 : 0) + (category.includes(term) ? 2 : 0) + (text.includes(term) ? 1 : 0);
      if (hit === 0) { all = false; break; }
      score += hit;
    }
    if (all) results.push({ entry, score });
  }
  return results.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title)).slice(0, limit);
}
