// Renders the Garage Laurent documents (06, 14, 15/PDF, 16, 19, 20) with the product's own email
// components and generateInvoicePdf, straight from the seeded DB. No transport, no sends, no DB writes.
// Usage: DATABASE_URL=<local dev db> npx tsx scripts/demo-journey/render-documents.ts <outDir>
// Output: <outDir>/{fr,en}/<name>.html and <outDir>/{fr,en}/invoice-camille.pdf (screenshots are taken by shoot-documents.mjs).
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render } from "@react-email/render";
import { db } from "@/lib/db";
import { AppointmentEmail } from "@/emails/AppointmentEmail";
import { InvoiceEmail } from "@/emails/InvoiceEmail";
import { PlainMessageEmail } from "@/emails/PlainMessageEmail";
import { ServiceReminderEmail } from "@/emails/ServiceReminderEmail";
import { WORK_ORDER_READY_COPY } from "@/lib/email";
import { generateInvoicePdf } from "@/lib/pdf";
import { serializeInvoiceForPdf } from "@/lib/invoice-serialize";
import { formatClientName } from "@/domain/client-name";
import { formatCurrency } from "@/lib/utils";

const outRoot = process.argv[2];
if (!outRoot) throw new Error("Usage: render-documents.ts <outDir>");
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to render from a non-local database.");

const ID = (k: string) => `mkt-gl-v1-${k}`;
const DEMO_URL = "https://garageos.com/demo"; // static, token-free target

async function main() {
  const shop = await db.shop.findUniqueOrThrow({ where: { id: ID("shop") } });
  const appt = await db.appointment.findUniqueOrThrow({ where: { id: ID("appt-demo-civic-oil") }, include: { client: true } });
  const wo = await db.workOrder.findUniqueOrThrow({ where: { id: ID("wo-sophie") }, include: { client: true, vehicle: true } });
  const rem = await db.serviceReminder.findUniqueOrThrow({ where: { id: ID("rem-camille-oil") }, include: { vehicle: { include: { client: true } } } });
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: ID("campaign-winter") } });
  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id: ID("inv-camille") },
    include: { client: true, vehicles: { include: { vehicle: true, lineItems: true } }, paymentEntries: true, shop: true },
  });

  for (const lang of ["FR", "EN"] as const) {
    const dir = path.join(outRoot, lang.toLowerCase());
    fs.mkdirSync(dir, { recursive: true });
    const write = async (name: string, el: React.ReactElement) => fs.writeFileSync(path.join(dir, `${name}.html`), await render(el));
    const locale = lang === "FR" ? "fr-CA" : "en-CA";

    await write("06-confirmation-email", React.createElement(AppointmentEmail, {
      type: "confirmation", clientName: formatClientName(appt.client), shopName: shop.name, title: appt.title,
      startsAtFormatted: new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: "America/Montreal" }).format(appt.startsAt),
      shopPhone: shop.phone, shopEmail: shop.email, language: lang, manageUrl: DEMO_URL, bookingUrl: DEMO_URL,
    }));

    const copy = WORK_ORDER_READY_COPY[lang];
    const vehicleDescription = `${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}`;
    await write("14-ready-email", React.createElement(PlainMessageEmail, {
      shopName: shop.name, headerSubtitle: copy.subtitle,
      bodyText: copy.body({ shop, to: "", clientName: formatClientName(wo.client), workOrderId: wo.id, orderNumber: wo.orderNumber, vehicleDescription, language: lang }),
      footerText: `This email was sent by ${shop.name}.`, lang: lang.toLowerCase(),
    }));

    // Invoice: same renderers as the product; the English variant only switches the render language in memory.
    const inv = { ...invoice, language: lang };
    const vehicleDesc = invoice.vehicles.map((iv) => `${iv.vehicle.year} ${iv.vehicle.make} ${iv.vehicle.model}`).join(", ");
    await write("16-invoice-email", React.createElement(InvoiceEmail, {
      clientName: formatClientName(invoice.client), shopName: shop.name, shopPhone: shop.phone, shopEmail: shop.email, shopAddress: shop.address,
      shopLogoUrl: shop.logoUrl, etransferEnabled: shop.etransferEnabled, etransferEmail: shop.etransferEmail,
      invoiceNumber: invoice.invoiceNumber, totalFormatted: formatCurrency(Number(invoice.total)), vehicleDescription: vehicleDesc,
      dueDateFormatted: null, language: lang, bookingUrl: DEMO_URL,
    }));
    fs.writeFileSync(path.join(dir, "invoice-camille.pdf"), await generateInvoicePdf(serializeInvoiceForPdf(inv)));

    await write("19-maintenance-reminder-email", React.createElement(ServiceReminderEmail, {
      clientName: formatClientName(rem.vehicle.client), vehicleDescription: `${rem.vehicle.year} ${rem.vehicle.make} ${rem.vehicle.model}`,
      licensePlate: rem.vehicle.licensePlate ?? "", serviceType: rem.serviceType, dueDate: rem.dueDate, dueMileage: rem.dueMileage,
      mileageUnit: "km", shopName: shop.name, shopPhone: shop.phone, shopEmail: shop.email, language: lang,
    }));

    await write("20-campaign-email", React.createElement(PlainMessageEmail, {
      shopName: shop.name, headerSubtitle: campaign.subject ?? campaign.name, bodyText: campaign.bodyHtml,
      footerText: `Recibiste este correo porque eres cliente de ${shop.name}.`, unsubscribeUrl: null,
    }));
  }
  console.log(`rendered into ${outRoot}`);
}
main().finally(() => db.$disconnect());
