# GarageOS Brand Kit

GarageOS is a SaaS operating platform for automotive repair shops. The
visual identity uses the **Connected / Modular** mark: three rounded
diagonal modules that communicate integration, workflow, and a unified
operating system for the garage.

## Core identity

-   **Deep Navy:** `#07182F`
-   **Primary Blue:** `#1769FF`
-   **Bright Blue:** `#2583FF`
-   **Off White:** `#F8FAFC`
-   **White:** `#FFFFFF`
-   Wordmark: **GarageOS**, with `Garage` in Deep Navy and `OS` in the
    GarageOS blue family.
-   Avoid automotive clichés such as gears, wrenches, pistons, tires, or
    cars in the core identity.

## Package contents

### `logos/`

-   `garageos-logo-horizontal.png` --- primary horizontal lockup: mark +
    wordmark. Use in navigation, marketing, documents, and general brand
    applications.
-   `garageos-logo-stacked.png` --- vertical/stacked lockup. Useful for
    centered layouts, onboarding, splash screens, and presentations.
-   `garageos-wordmark.png` --- wordmark only. Use when the brand mark
    is already present or horizontal space is constrained.
-   `garageos-logo-white.png` --- horizontal lockup intended for dark
    backgrounds; Garage is white while OS and the mark retain the blue
    identity.
-   `garageos-logo-monochrome-dark.png` --- single-color dark/navy
    treatment for invoices, print, PDFs, and restrained applications.
-   `garageos-logo-monochrome-white.png` --- single-color white
    treatment for dark photography, dark UI, footers, and video.
-   `garageos-logo-horizontal-v2.png` --- generated attempt at fixing
    the broken-"Garage"-text defect in `garageos-logo-horizontal.png`
    (see Integration notes). **Not usable as delivered either:** it
    composites the lockup onto an unrequested off-white torn-paper card
    with a blue glow/halo around the mark, instead of plain alpha
    transparency, and has visible edge noise. Not copied into
    `public/`; needs another regeneration pass with an explicit
    "no card, no paper texture, no halo/glow, pure transparent
    background" constraint before it replaces the original.

### `marks/`

-   `garageos-imagotipo.png` --- standalone Connected / Modular brand
    mark. Use for branded UI accents and applications where the full
    wordmark is unnecessary.
-   `garageos-favicon.png` --- square master of the mark intended as the
    source for browser favicon sizes.
-   `garageos-email-mark.png` --- standalone mark, generated to fill the
    gap this kit's own "not present" list originally flagged; for
    transactional email headers. See Integration notes — has some edge
    noise at full resolution (same class of artifact as the two files
    above), acceptable at the small sizes it's actually used at. Wired
    in as `public/brand/email-mark.png` (256px); not yet referenced from
    `src/emails/`.

### `app/`

-   `garageos-app-icon.png` --- application icon master with white mark
    on the GarageOS blue field.
-   `garageos-social-avatar.png` --- social/profile avatar treatment
    with the blue mark on a deep navy field.

### `graphics/`

-   `garageos-brand-pattern.png` --- the official repeating diagonal
    module pattern, for texture on dark brand panels.
-   `garageos-og-image.png` --- 1734×907 (≈1.91:1) social share image:
    mark + wordmark + tagline on the brand pattern over Deep Navy.
    Generated to fill the gap this kit's own "not present" list
    originally flagged; see Integration notes. Wired in as
    `public/og-image.png` (cropped to the standard 1200×630) via
    `openGraph.images`/`twitter.images` in `src/app/layout.tsx`.

## Usage guidance

Use the primary horizontal logo on light backgrounds whenever practical.
Use `garageos-logo-white.png` or the monochrome-white treatment on dark
backgrounds. The standalone mark is appropriate for compact UI, avatars,
favicons, loading states, and product surfaces where GarageOS is already
identified nearby.

Keep clear space around the logo and preserve the mark's geometry,
angle, relative module sizes, and rounded ends. Do not stretch, rotate,
recolor individual modules arbitrarily, add outlines, add drop
shadows/glows, or rebuild the mark from different shapes.

## Production note

This kit organizes the supplied approved artwork; it does **not** redraw
the logo. Some supplied artwork was generated/exported with backgrounds
already baked into the source image. In particular, the primary
horizontal and stacked reference images do not contain true alpha
transparency in their supplied originals. The PNG conversion preserves
their visible artwork rather than attempting destructive automatic
background removal.

## Assets not present in the original supplied batch

Two assets from the planned full package were not present as distinct
files in the originally uploaded set: `garageos-email-mark.png` and
`garageos-brand-pattern.png`. Both have since been added —
`garageos-brand-pattern.png` was actually already in the upload under
`marks/brand pattern.png` and got moved/renamed to
`graphics/garageos-brand-pattern.png` to match this document's
structure (otherwise unedited); `garageos-email-mark.png` and a
`graphics/garageos-og-image.png` (not part of the original planned
package, but needed once the site went live with no social-share
image) were generated separately — see Integration notes for their
quality caveats.

## Integration notes (added when wiring this kit into the app)

Two files in this kit have a defect that made them unusable as supplied.
Both were worked around in `src/components/marketing/` and
`src/app/apple-icon.png` rather than by editing the source files here:

-   **`logos/garageos-logo-horizontal.png`** — the "Garage" portion of the
    wordmark is rendered fully opaque **white**, not Deep Navy as this
    document describes, so it is invisible on the white/light backgrounds
    it's meant for. Confirmed by sampling pixel values, not a rendering
    artifact. Not copied into the app; the header/footer instead compose
    the standalone mark (`marks/garageos-imagotipo.png`) with a real
    `GarageOS` text node, which also keeps the wordmark crisp and
    selectable instead of a flattened raster.
-   **`app/garageos-app-icon.png`** — the rounded-square icon does not
    fill its canvas edge-to-edge; there's a fully opaque near-black
    margin around it instead of the blue field this document describes.
    Visible as black corners behind the icon on any surface that doesn't
    apply its own additional rounding (e.g. `apple-touch-icon`). The app
    build script chroma-keys that near-black margin to Primary Blue
    before resizing (safe because no real part of the mark uses
    near-black) rather than shipping the defect.

If regenerating this kit from source, both should be fixed at the
origin: the horizontal lockup's "Garage" text should be Deep Navy, and
the app icon's blue field should extend to all four edges of the canvas.

## Suggested web implementation

For a typical web/PWA project, use the horizontal logo in the public
marketing navbar, the app icon as the PWA/mobile master, the favicon
master to derive browser-specific favicon sizes, and the monochrome
versions for generated PDFs/invoices where predictable reproduction
matters.
