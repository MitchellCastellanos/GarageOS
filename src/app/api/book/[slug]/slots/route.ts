import { NextRequest, NextResponse } from "next/server";
import {
  getAvailableSlots,
  getBookableDates,
  getDateWindow,
  getShopBySlug,
  getShopServiceDurations,
} from "@/lib/booking-slots";
import { resolveServiceDuration } from "@/lib/service-catalog";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);

  if (!shop) {
    return NextResponse.json({ error: "Reservas no disponibles" }, { status: 404 });
  }

  const date = req.nextUrl.searchParams.get("date");
  const service = req.nextUrl.searchParams.get("service");
  const serviceDurations = await getShopServiceDurations(shop.id);
  const durationMinutes = resolveServiceDuration(service, shop.bookingSlotMinutes, serviceDurations);

  if (date) {
    // Sin filtro de mecánico: un horario aparece disponible en cuanto
    // cualquier mecánico del taller esté libre — el sitio no deja elegir uno.
    const slots = await getAvailableSlots(shop, date, undefined, undefined, durationMinutes);
    return NextResponse.json({ slots });
  }

  // Tope de 90 días (3 meses) — coincide con el máximo que ya permite
  // Configuración → bookingAdvanceDays (ver booking-settings.ts).
  const windowDays = Math.min(shop.bookingAdvanceDays, 90);
  const availableDates = await getBookableDates(shop, windowDays, undefined, durationMinutes);

  return NextResponse.json({
    shop: {
      name: shop.name,
      phone: shop.phone,
      address: shop.address,
      logoUrl: shop.logoUrl,
      timezone: shop.timezone,
      bookingSlotMinutes: shop.bookingSlotMinutes,
    },
    dates: getDateWindow(shop, windowDays),
    availableDates,
  });
}
