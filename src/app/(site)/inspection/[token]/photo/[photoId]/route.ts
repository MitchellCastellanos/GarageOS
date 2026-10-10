import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { can } from "@/lib/subscription";
import { SHORT_SIGNED_URL_TTL, trySignedUrlForPrivateDocument } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Foto DVI de un reporte compartido. El bucket es privado: primero se valida el
 * token del reporte, el plan del taller y que la foto pertenezca A ESA inspección;
 * solo entonces se redirige a una URL firmada de 60 s (no cacheable).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  const { token, photoId } = await params;
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!token || token.length < 16) return notFound();

  const photo = await db.inspectionPhoto.findFirst({
    where: { id: photoId, inspectionItem: { inspection: { shareToken: token } } },
    select: { storagePath: true, inspectionItem: { select: { inspection: { select: { shopId: true } } } } },
  });
  if (!photo) return notFound();

  const shopId = photo.inspectionItem.inspection.shopId;
  if (!(await can(shopId, "dvi.customerReport"))) return notFound();

  const url = await trySignedUrlForPrivateDocument(shopId, photo.storagePath, SHORT_SIGNED_URL_TTL);
  if (!url) return notFound();

  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
