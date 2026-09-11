/**
 * GarageOS "Connected / Modular" brand mark — official artwork from the
 * brand kit (garageos-brand-kit/), not a redrawn approximation. See
 * garageos-brand-kit/README.md for usage rules.
 *
 * Two variants: the standalone mark (transparent, for lockups next to the
 * "GarageOS" wordmark text) and the app-icon badge (mark on a filled blue
 * rounded square, for tiny contexts where the mark alone would float
 * without a container — favicons, in-mockup app badges).
 */
export function GarageOSLogo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- fixed small brand icon reused at many sizes across components; a plain <img> avoids next/image's per-size intrinsic-dimension bookkeeping for what is already a small pre-optimized asset
  return <img src="/brand/mark.png" alt="GarageOS" className={className} />;
}

export function GarageOSAppIcon({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- see GarageOSLogo above
  return <img src="/brand/app-icon.png" alt="GarageOS" className={`${className} rounded-[22%]`} />;
}
