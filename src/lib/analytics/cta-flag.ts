/**
 * Privacy gate for CTA click collection (Analytics v2). OFF unless the server environment variable ANALYTICS_CTA_ENABLED is exactly "true".
 * Server-side only: read by the root layout (to decide whether the listener is rendered at all) and by POST /api/track/event (which answers
 * 204 immediately when off). Do NOT enable in production before the privacy notice has been legally reviewed (docs/analytics-v2-contract.md §11).
 */
export function ctaCollectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ANALYTICS_CTA_ENABLED === "true";
}
