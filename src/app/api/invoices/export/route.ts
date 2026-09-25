import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatClientName } from "@/lib/client-name";
import { ensureFullShopDate, parseShopDateTime } from "@/lib/shop-timezone";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.shopId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const shopId = session.user.shopId;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { timezone: true } });
  const timeZone = shop?.timezone ?? "America/Montreal";
  const start = parseShopDateTime(ensureFullShopDate(from), "00:00", timeZone);
  const end = parseShopDateTime(ensureFullShopDate(to), "23:59", timeZone);
  end.setMinutes(end.getMinutes() + 1);

  const invoices = await db.invoice.findMany({
    where: { shopId, status: "PAID", paidAt: { gte: start, lt: end } },
    include: { client: true },
    orderBy: { paidAt: "asc" },
  });

  const header = [
    "Invoice number",
    "Paid at",
    "Client",
    "Subtotal",
    "Tax",
    "Total",
  ];
  const rows = invoices.map((inv) => [
    inv.invoiceNumber,
    inv.paidAt?.toISOString() ?? "",
    formatClientName(inv.client),
    inv.subtotal.toString(),
    inv.taxAmount.toString(),
    inv.total.toString(),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell))).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoices-${from}-to-${to}.csv"`,
    },
  });
}
