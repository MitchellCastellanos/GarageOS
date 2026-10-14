import { HELP_CATEGORIES } from "./categories";
import { GUIDE_TO_HELP } from "./legacy-map";

/**
 * 301 permanentes de las URLs históricas `/guides/*` (sin importaciones con alias `@/`: lo carga next.config.ts).
 * Cada guía conserva su slug en el Centro de ayuda; la categoría sale de `GUIDE_TO_HELP`.
 */
export const LEGACY_GUIDE_REDIRECTS: { source: string; destination: string }[] = [
  ...Object.entries(GUIDE_TO_HELP).map(([slug, { category }]) => {
    const categorySlug = HELP_CATEGORIES.find((c) => c.id === category)!.slug.en;
    return { source: `/guides/${slug}`, destination: `/help/${categorySlug}/${slug}` };
  }),
  { source: "/guides", destination: "/help" },
];
