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

### `marks/`

-   `garageos-imagotipo.png` --- standalone Connected / Modular brand
    mark. Use for branded UI accents and applications where the full
    wordmark is unnecessary.
-   `garageos-favicon.png` --- square master of the mark intended as the
    source for browser favicon sizes.

### `app/`

-   `garageos-app-icon.png` --- application icon master with white mark
    on the GarageOS blue field.
-   `garageos-social-avatar.png` --- social/profile avatar treatment
    with the blue mark on a deep navy field.

### `graphics/`

Reserved for secondary GarageOS graphic assets such as the official
brand pattern.

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

## Assets not present in the supplied batch

Two assets from the planned full package were not present as distinct
files in the uploaded set:

-   `garageos-email-mark.png`
-   `garageos-brand-pattern.png`

The `graphics/` directory is retained so the pattern can be added later
without changing the package structure.

## Suggested web implementation

For a typical web/PWA project, use the horizontal logo in the public
marketing navbar, the app icon as the PWA/mobile master, the favicon
master to derive browser-specific favicon sizes, and the monochrome
versions for generated PDFs/invoices where predictable reproduction
matters.
