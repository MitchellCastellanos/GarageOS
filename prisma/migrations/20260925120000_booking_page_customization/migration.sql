-- Personalización guiada de la página pública de reservas (/book/[slug]).
-- Ver docs/booking-page-customization-plan.md y src/lib/booking-page.ts.

-- CreateEnum
CREATE TYPE "garageos"."BookingPageTemplate" AS ENUM ('CLASSIC', 'MODERN', 'BOLD', 'MINIMAL');

-- CreateEnum
CREATE TYPE "garageos"."BookingPageTypography" AS ENUM ('GARAGE', 'MODERN', 'CLASSIC', 'PREMIUM');

-- Defaults = la página de hoy: plantilla Classic, tipografía condensada
-- (Oswald) y sin fotos propias (cae al fondo con color de marca).
ALTER TABLE "garageos"."Shop"
  ADD COLUMN "bookingCoverImageUrl" TEXT,
  ADD COLUMN "bookingShopImageUrl" TEXT,
  ADD COLUMN "bookingTemplate" "garageos"."BookingPageTemplate" NOT NULL DEFAULT 'CLASSIC',
  ADD COLUMN "bookingTypography" "garageos"."BookingPageTypography" NOT NULL DEFAULT 'GARAGE',
  ADD COLUMN "bookingPagePublishedAt" TIMESTAMP(3);

ALTER TABLE "garageos"."ShopBookingService"
  ADD COLUMN "iconKey" TEXT,
  ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- Hasta hoy la franja de servicios destacados mostraba 5 servicios fijos.
-- Para que los talleres con catálogo propio no pierdan esa franja, se
-- destacan sus primeros 5 servicios activos (mismo orden del catálogo).
-- iconKey queda NULL: el render infiere un ícono a partir del nombre.
UPDATE "garageos"."ShopBookingService" AS s
SET "isFeatured" = true
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "shopId" ORDER BY "sortOrder" ASC, "createdAt" ASC) AS rn
  FROM "garageos"."ShopBookingService"
  WHERE "isActive" = true
) AS ranked
WHERE s."id" = ranked."id" AND ranked.rn <= 5;
