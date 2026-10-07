// Seed reproducible del taller de muestra "Garage Laurent" para capturas de marketing.
//
//   npm run seed:marketing-garage-laurent -- --dry-run
//   npm run seed:marketing-garage-laurent -- [--ref-date=YYYY-MM-DD] [--access-file=<ruta local>] [--issue-portal-link]
//
// Variables: DATABASE_URL (o DATABASE_URL_POOLED / DIRECT_URL, que db.ts también lee) y DEMO_OWNER_PASSWORD
// (solo hace falta la primera vez; nunca se imprime ni se reescribe en reejecuciones).
//
// Garantías:
//  - Idempotente: cada fila tiene un id estable (prefijo mkt-gl-v1-). Lo que existe se conserva tal cual;
//    no hay borrados ni actualizaciones de datos de negocio, así que un cambio hecho en la UI no se revierte.
//  - Una sola transacción. --dry-run ejecuta todo y revierte: el conteo que imprime es exacto.
//  - Conflictos (slug o correo ocupados por otro taller/cuenta) detienen el proceso antes de escribir nada.
//  - Sin servicios externos: no envía avisos, no crea objetos en Stripe/Twilio/Resend/QuickBooks, no genera
//    fotos ni logos. Los enlaces de portal/aprobación se escriben solo al archivo que indiques.
//  - Bases no locales requieren --allow-remote (protección frente a una URL de producción en el entorno).
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import { allocateNextInvoiceNumber, allocateNextQuoteNumber, allocateNextWorkOrderNumber } from "@/lib/invoice-number";
import { reconcileWorkOrderConsumption } from "@/lib/inventory-consumption";
import { recordFinancialEvent } from "@/lib/financial-events";
import { generatePortalToken, hashPortalToken, portalLinkExpiry } from "@/domain/portal";
import {
  buildQuoteApprovalSnapshot,
  generateQuoteApprovalToken,
  hashQuoteApprovalSnapshot,
  quoteApprovalExpiry,
  quoteApprovalInclude,
} from "@/lib/quote-approval";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";
import { normalizeTireSize } from "@/domain/tire-storage";
import { planReminder } from "@/domain/reminder-rules";
import { formatShopDate } from "@/lib/shop-timezone";
import * as D from "./marketing/garage-laurent-dataset";

const { id, SEED_KEY, SHOP_SLUG, SHOP_TZ, OWNER_EMAIL } = D;
const SHOP_ID = id("shop");
const OWNER_ID = id("user-etienne");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// ── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

class SeedConflict extends Error {}
class DryRunRollback extends Error {
  constructor() {
    super("DRY_RUN_ROLLBACK");
  }
}

function fail(message: string): never {
  process.stderr.write(`\n[seed] DETENIDO — no se escribió nada.\n${message}\n`);
  process.exit(1);
}

function assertTarget(): void {
  const urls = ["DATABASE_URL_POOLED", "DATABASE_URL", "DIRECT_URL"]
    .map((k) => process.env[k])
    .filter((u): u is string => !!u && u.trim() !== "");
  if (urls.length === 0) fail("Falta DATABASE_URL. Usa una base local o de Preview dedicada.");
  const hosts = urls.map((u) => {
    try {
      return new URL(u).hostname;
    } catch {
      fail("Una URL de base de datos no es válida (no se muestra por seguridad).");
    }
  });
  const remote = hosts.some((h) => !LOCAL_HOSTS.has(h));
  if (remote && !flag("allow-remote")) {
    fail(
      "La base configurada no es local. Este seed solo debe correr contra una base local o Preview dedicada.\n" +
        "Si de verdad es la base correcta, repite el comando con --allow-remote.",
    );
  }
  process.stdout.write(`[seed] Destino: ${remote ? "remoto (confirmado con --allow-remote)" : "local"}\n`);
}

// ── Recuento ───────────────────────────────────────────────────────────────

const stats = new Map<string, { created: number; existing: number }>();
function tally(model: string, created: boolean, n = 1) {
  const s = stats.get(model) ?? { created: 0, existing: 0 };
  if (created) s.created += n;
  else s.existing += n;
  stats.set(model, s);
}
const present = (count: () => Promise<number>) => count().then((n) => n > 0);

/** Crea la fila solo si no existe. Devuelve true si se creó. */
async function ensure(model: string, exists: () => Promise<boolean>, create: () => Promise<unknown>): Promise<boolean> {
  if (await exists()) {
    tally(model, false);
    return false;
  }
  await create();
  tally(model, true);
  return true;
}

// ── Conflictos ─────────────────────────────────────────────────────────────

async function assertNoConflicts(tx: Prisma.TransactionClient): Promise<void> {
  const bySlug = await tx.shop.findUnique({ where: { slug: SHOP_SLUG }, select: { id: true } });
  if (bySlug && bySlug.id !== SHOP_ID) {
    throw new SeedConflict(`El slug "${SHOP_SLUG}" ya pertenece a otro taller. No se reutiliza ni sobrescribe.`);
  }
  const byId = await tx.shop.findUnique({ where: { id: SHOP_ID }, select: { slug: true } });
  if (byId && byId.slug !== SHOP_SLUG) throw new SeedConflict("El id de taller del seed existe con otro slug.");

  const staffEmails = [D.OWNER_EMAIL, D.STAFF.mathieu.email, D.STAFF.olivier.email];
  for (const email of staffEmails) {
    const user = await tx.user.findUnique({ where: { email }, select: { shopId: true } });
    if (user && user.shopId !== SHOP_ID) {
      throw new SeedConflict(`Un correo del seed (${email}) ya pertenece a otra cuenta. Revisa antes de continuar.`);
    }
  }
  for (const c of D.CLIENTS) {
    const clientCount = await tx.client.count({ where: { id: id(`client-${c.key}`), shopId: { not: SHOP_ID } } });
    if (clientCount > 0) throw new SeedConflict(`Conflicto de id de cliente ${c.key} en otro taller.`);
  }
}

// ── Escritura ──────────────────────────────────────────────────────────────

interface Ctx {
  tx: Prisma.TransactionClient;
  refDate: string;
  ownerPasswordHash: string | null;
  ownerName: string;
  portalTokenForFile: string | null;
  shareTokenForFile: string | null;
  approvalTokenForFile: string | null;
  portalRequested: boolean;
  shopTaxLines: Prisma.InputJsonValue;
  mechanicIds: Record<D.MechanicKey, string>;
  clientIds: Record<D.ClientKey, string>;
  vehicleIds: Record<D.ClientKey, string>;
  partIds: Record<D.PartKey, string>;
}

const json = (v: unknown) => v as unknown as Prisma.InputJsonValue;
const money = (v: string) => new Decimal(v).toFixed(2);

/** Líneas de estimado / factura (sin pieza: el modelo no la guarda ahí). */
function lineCreates(prefix: string, lines: D.LineSpec[]) {
  return lines.map((l, i) => ({
    id: id(`${prefix}-${i}`),
    description: l.description,
    itemType: l.itemType,
    quantity: l.quantity,
    unitPrice: money(l.unitPrice),
    lineTotal: D.lineTotal(l),
    sortOrder: i,
  }));
}

/** Líneas de orden de trabajo: sin total guardado, con la pieza que consumen. */
function woLineCreates(prefix: string, lines: D.LineSpec[], partIds: Record<D.PartKey, string>) {
  return lines.map((l, i) => ({
    id: id(`${prefix}-${i}`),
    description: l.description,
    itemType: l.itemType,
    quantity: l.quantity,
    unitPrice: money(l.unitPrice),
    sortOrder: i,
    partId: l.partKey ? partIds[l.partKey as D.PartKey] : null,
  }));
}

async function seedShop(ctx: Ctx, now: Date): Promise<void> {
  const { tx } = ctx;
  const existing = await tx.shop.findUnique({ where: { id: SHOP_ID }, select: { communicationsSuspendedAt: true, onboardingCompletedAt: true } });
  await ensure("Shop", async () => !!existing, () =>
    tx.shop.create({
      data: {
        id: SHOP_ID,
        name: "Garage Laurent",
        slug: SHOP_SLUG,
        brandColor: "#15363D",
        address: "1234, rue de Démonstration, Montréal (Québec)",
        phone: "+1 514 555 0100",
        email: "bonjour.garage.laurent@example.com",
        currency: "CAD",
        defaultLanguage: "FR",
        timezone: SHOP_TZ,
        taxLines: ctx.shopTaxLines,
        taxId: null,
        bookingEnabled: true,
        bookingSlotMinutes: 60,
        bookingLeadTimeHours: 24,
        bookingAdvanceDays: 30,
        // Diseño elegido para un taller profesional: plantilla MODERN, tipografía MODERN. Las fotos y el
        // logo quedan en null: se suben después desde Configuración / Reservas.
        bookingTemplate: "MODERN",
        bookingTypography: "MODERN",
        bookingPagePublishedAt: now,
        onboardingCompletedAt: now,
        // Ningún envío real: suspensión de comunicaciones activa mientras los contactos son ficticios.
        communicationsSuspendedAt: now,
        createdAt: D.at(D.addDays(ctx.refDate, -90), "09:00"),
      },
    }),
  );
  if (existing) {
    const fix: Prisma.ShopUpdateInput = {};
    if (!existing.onboardingCompletedAt) fix.onboardingCompletedAt = now;
    if (!existing.communicationsSuspendedAt) fix.communicationsSuspendedAt = now;
    if (Object.keys(fix).length > 0) await tx.shop.update({ where: { id: SHOP_ID }, data: fix });
  }

  await ensure("Subscription", () => present(() => tx.subscription.count({ where: { shopId: SHOP_ID } })), () =>
    tx.subscription.create({
      data: {
        shopId: SHOP_ID,
        plan: "COMPLETE",
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
        // Sin Stripe: ni customer ni subscription ni contacto de facturación.
        billingEmail: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
      },
    }),
  );

  for (let dow = 0; dow <= 6; dow++) {
    const hours = D.SHOP_HOURS[dow];
    await ensure("ShopWorkingHours", () => present(() => tx.shopWorkingHours.count({ where: { id: id(`shop-hours-${dow}`) } })), () =>
      tx.shopWorkingHours.create({
        data: { id: id(`shop-hours-${dow}`), shopId: SHOP_ID, dayOfWeek: dow, openTime: hours?.open ?? "09:00", closeTime: hours?.close ?? "17:00", isClosed: hours === null },
      }),
    );
  }

  for (const s of D.SERVICES) {
    await ensure("ShopBookingService", () => present(() => tx.shopBookingService.count({ where: { id: id(`svc-${s.key}`) } })), () =>
      tx.shopBookingService.create({
        data: {
          id: id(`svc-${s.key}`),
          shopId: SHOP_ID,
          labelFr: s.labelFr,
          labelEn: s.labelEn,
          labelEs: s.labelEs,
          durationMinutes: 60,
          isActive: true,
          sortOrder: D.SERVICES.findIndex((x) => x.key === s.key),
          iconKey: s.iconKey,
          isFeatured: s.featured,
        },
      }),
    );
  }
}

async function seedPeople(ctx: Ctx): Promise<void> {
  const { tx } = ctx;
  const owner = await tx.user.findUnique({ where: { email: OWNER_EMAIL } });
  await ensure("User(owner)", async () => !!owner, () => {
    if (!ctx.ownerPasswordHash) throw new Error("DEMO_OWNER_PASSWORD es obligatoria la primera vez (la cuenta aún no existe).");
    return tx.user.create({
      data: {
        id: OWNER_ID,
        shopId: SHOP_ID,
        name: ctx.ownerName,
        email: OWNER_EMAIL,
        emailVerified: new Date(),
        passwordHash: ctx.ownerPasswordHash,
        role: "OWNER",
        bookable: false,
        preferredLocale: "FR",
        // Nunca recibe avisos reales de facturación.
        receiveBillingNotifications: false,
      },
    });
  });
  if (owner) {
    // Solo si la cuenta no tiene contraseña todavía: no se resetea en reejecuciones.
    if (!owner.passwordHash) {
      if (!ctx.ownerPasswordHash) throw new Error("La cuenta owner existe sin contraseña: define DEMO_OWNER_PASSWORD para completarla.");
      await tx.user.update({ where: { id: owner.id }, data: { passwordHash: ctx.ownerPasswordHash } });
    }
    if (!owner.emailVerified) await tx.user.update({ where: { id: owner.id }, data: { emailVerified: new Date() } });
  }

  for (const m of [D.STAFF.mathieu, D.STAFF.olivier]) {
    const mid = ctx.mechanicIds[m.key as D.MechanicKey];
    await ensure(`User(${m.key})`, () => present(() => tx.user.count({ where: { id: mid } })), () =>
      tx.user.create({
        data: { id: mid, shopId: SHOP_ID, name: m.name, email: m.email, role: "MECHANIC", bookable: true, preferredLocale: "FR" },
      }),
    );
    for (let dow = 0; dow <= 6; dow++) {
      const hours = D.SHOP_HOURS[dow];
      await ensure("MechanicWorkingHours", () => present(() => tx.mechanicWorkingHours.count({ where: { id: id(`mh-${m.key}-${dow}`) } })), () =>
        tx.mechanicWorkingHours.create({
          data: { id: id(`mh-${m.key}-${dow}`), userId: mid, dayOfWeek: dow, openTime: hours?.open ?? "09:00", closeTime: hours?.close ?? "17:00", isClosed: hours === null },
        }),
      );
    }
  }
}

async function seedCatalogAndClients(ctx: Ctx): Promise<void> {
  const { tx } = ctx;
  const saved: [string, D.LineType, string][] = [
    ["Main-d’œuvre — vidange d’huile", "LABOUR", "110.00"],
    ["Huile moteur synthétique 0W-20", "PART", "12.00"],
    ["Filtre à huile", "PART", "18.00"],
    ["Jeu de plaquettes de frein avant", "PART", "125.00"],
    ["Main-d’œuvre — remplacement des plaquettes avant", "LABOUR", "110.00"],
    ["Changement de pneus sur jantes", "LABOUR", "60.00"],
    ["Équilibrage des roues", "LABOUR", "40.00"],
    ["Entreposage saisonnier des pneus", "LABOUR", "90.00"],
  ];
  for (const [description, itemType, unitPrice] of saved) {
    await ensure("SavedLineItem", async () => !!(await tx.savedLineItem.findUnique({ where: { shopId_description: { shopId: SHOP_ID, description } } })), () =>
      tx.savedLineItem.create({ data: { id: id(`saved-${createHash("sha1").update(description).digest("hex").slice(0, 10)}`), shopId: SHOP_ID, description, itemType, unitPrice, useCount: 1 } }),
    );
  }

  for (const c of D.CLIENTS) {
    const cid = ctx.clientIds[c.key];
    await ensure("Client", () => present(() => tx.client.count({ where: { id: cid } })), () =>
      tx.client.create({
        data: {
          id: cid,
          shopId: SHOP_ID,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          language: "FR",
          notes: "Client fictif — dossier de démonstration. Aucun destinataire réel.",
          notifyChannel: "AUTO",
          marketingEmailConsent: c.consent,
          marketingSmsConsent: false,
          consentSource: c.consent ? D.CONSENT_SOURCE : null,
          consentAt: c.consent ? D.at(D.addDays(ctx.refDate, -60), "10:00") : null,
          demoSeedBatchId: SEED_KEY,
          createdAt: D.at(D.addDays(ctx.refDate, -90), "10:00"),
        },
      }),
    );
    const vid = ctx.vehicleIds[c.key];
    await ensure("Vehicle", () => present(() => tx.vehicle.count({ where: { id: vid } })), () =>
      tx.vehicle.create({
        data: {
          id: vid,
          clientId: cid,
          make: c.vehicle.make,
          model: c.vehicle.model,
          year: c.vehicle.year,
          licensePlate: c.vehicle.plate,
          color: c.vehicle.color,
          vin: null,
          mileageUnit: "KM",
          demoSeedBatchId: SEED_KEY,
          createdAt: D.at(D.addDays(ctx.refDate, -90), "10:05"),
        },
      }),
    );
  }

  for (const p of D.PARTS) {
    const pid = ctx.partIds[p.key];
    await ensure("InventoryPart", () => present(() => tx.inventoryPart.count({ where: { id: pid } })), async () => {
      await tx.inventoryPart.create({
        data: {
          id: pid,
          shopId: SHOP_ID,
          sku: p.sku,
          name: p.name,
          unitCost: money(p.unitCost),
          unitPrice: money(p.unitPrice),
          quantityOnHand: p.onHand,
          reorderThreshold: p.threshold,
          isActive: true,
        },
      });
      // Stock inicial registrado como movimiento real; el consumo de las órdenes lo descuenta después.
      await tx.inventoryMovement.create({
        data: { id: id(`mov-recv-${p.key}`), shopId: SHOP_ID, partId: pid, type: "RECEIVE", quantity: p.onHand, note: "Stock inicial — dossier de démonstration" },
      });
    });
  }
}

/** Factura histórica: creada como lo hace createInvoice (INVOICE_ISSUED) y cobrada al instante. */
async function seedHistoricalInvoice(ctx: Ctx, spec: D.HistoricalInvoice): Promise<void> {
  const { tx } = ctx;
  const client = D.CLIENTS.find((c) => c.key === spec.client)!;
  const issuedAt = D.at(D.historicalInvoiceDay(spec, ctx.refDate), "13:30");
  const invoiceId = id(`inv-${spec.key}`);
  if (await present(() => tx.invoice.count({ where: { id: invoiceId } }))) {
    tally("Invoice", false);
    return;
  }
  const t = D.totalsFor(spec.lines);
  const invoiceNumber = await allocateNextInvoiceNumber(tx, SHOP_ID);
  await tx.invoice.create({
    data: {
      id: invoiceId, shopId: SHOP_ID, clientId: ctx.clientIds[spec.client], invoiceNumber, status: "PAID",
      issuedAt, paidAt: issuedAt, subtotal: t.subtotal, taxRate: t.taxRate, taxAmount: t.taxAmount, total: t.total,
      taxSnapshot: json(t.snapshot), taxRegistration: null, currency: "CAD", language: "FR", paymentMode: spec.method,
      demoSeedBatchId: SEED_KEY,
      vehicles: { create: { id: id(`iv-${spec.key}`), vehicleId: ctx.vehicleIds[spec.client], mileageIn: client.vehicle.mileage, mileageOut: client.vehicle.mileage, sortOrder: 0,
        lineItems: { create: lineCreates(`il-${spec.key}`, spec.lines) } } },
    },
  });
  tally("Invoice", true);
  tally("InvoiceLineItem", true, spec.lines.length);
  await tx.invoicePaymentEntry.create({ data: { id: id(`pay-${spec.key}`), invoiceId, method: spec.method, amount: t.total, sortOrder: 0, createdAt: issuedAt } });
  await recordFinancialEvent(tx, { shopId: SHOP_ID, invoiceId, type: "INVOICE_ISSUED", amount: t.total, data: { invoiceNumber, subtotal: t.subtotal, taxAmount: t.taxAmount, taxLines: t.snapshot.lines } });
  await recordFinancialEvent(tx, { shopId: SHOP_ID, invoiceId, type: "PAYMENT_RECORDED", amount: t.total, data: { invoiceNumber, mode: spec.method, payments: [{ method: spec.method, amount: t.total }] } });
  if (spec.method === "CASH") {
    await tx.cashDrawerEntry.create({
      data: { id: id(`cash-${spec.key}`), shopId: SHOP_ID, type: "CASH_IN", amount: t.total, description: `Paiement comptant — ${invoiceNumber}`, occurredAt: issuedAt, linkedInvoiceId: invoiceId, paymentMethod: "CASH", createdById: OWNER_ID },
    });
  }
}

/** Camille: inspección → estimación → aprobación (hash del snapshot) → orden de trabajo → factura pagada → recordatorio. */
async function seedCamilleJourney(ctx: Ctx): Promise<void> {
  const { tx } = ctx;
  const camille = D.CLIENTS[0];
  const cid = ctx.clientIds.camille;
  const vid = ctx.vehicleIds.camille;
  const jobDay = D.prevBusinessDay(D.addDays(ctx.refDate, -24));
  const approvalDay = D.nextBusinessDay(jobDay);
  const quoteId = id("quote-camille");
  const woId = id("wo-camille");
  const invoiceId = id("inv-camille");
  const t = D.totalsFor(D.CAMILLE_LINES);
  const issued = D.at(approvalDay, "16:30");

  // Estimación (DRAFT: nunca se marcó como enviada; la aprobación la registra la clienta).
  if (!(await present(() => tx.quote.count({ where: { id: quoteId } })))) {
    const quoteNumber = await allocateNextQuoteNumber(tx, SHOP_ID);
    await tx.quote.create({
      data: {
        id: quoteId, shopId: SHOP_ID, clientId: cid, quoteNumber, status: "DRAFT",
        issuedAt: D.at(jobDay, "11:30"), validUntil: D.at(D.addDays(jobDay, 30), "17:00"),
        subtotal: t.subtotal, taxRate: t.taxRate, taxAmount: t.taxAmount, total: t.total,
        taxSnapshot: json(t.snapshot), language: "FR", demoSeedBatchId: SEED_KEY,
        vehicles: { create: { id: id("qv-camille"), vehicleId: vid, mileageIn: camille.vehicle.mileage, mileageOut: camille.vehicle.mileage, sortOrder: 0,
          lineItems: { create: lineCreates("qli-camille", D.CAMILLE_LINES) } } },
      },
    });
    tally("Quote", true);
    tally("QuoteLineItem", true, D.CAMILLE_LINES.length);
  } else tally("Quote", false);

  // Aprobación histórica: snapshot real del estimado tal como estaba al aprobar.
  const approvalId = id("approval-camille");
  if (!(await present(() => tx.quoteApproval.count({ where: { id: approvalId } })))) {
    const full = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, include: quoteApprovalInclude });
    const snapshot = buildQuoteApprovalSnapshot(full);
    await tx.quoteApproval.create({
      data: {
        id: approvalId, quoteId, decision: "ACCEPTED", documentHash: hashQuoteApprovalSnapshot(snapshot), documentSnapshot: json(snapshot),
        actorName: "Camille Tremblay", recordedAt: D.at(approvalDay, "09:20"), channel: D.APPROVAL_CHANNEL,
      },
    });
    tally("QuoteApproval", true);
    await tx.quote.update({ where: { id: quoteId }, data: { status: "ACCEPTED" } });
  } else tally("QuoteApproval", false);

  // Factura por conversión de la estimación (como convertQuoteToInvoice: sin evento INVOICE_ISSUED).
  const invoiceExisted = await present(() => tx.invoice.count({ where: { id: invoiceId } }));
  if (!invoiceExisted) {
    const invoiceNumber = await allocateNextInvoiceNumber(tx, SHOP_ID);
    await tx.invoice.create({
      data: {
        id: invoiceId, shopId: SHOP_ID, clientId: cid, invoiceNumber, status: "PAID", issuedAt: issued, paidAt: D.at(approvalDay, "16:45"),
        subtotal: t.subtotal, taxRate: t.taxRate, taxAmount: t.taxAmount, total: t.total, taxSnapshot: json(t.snapshot),
        taxRegistration: null, currency: "CAD", language: "FR", paymentMode: "CARD",
        notes: "Merci de votre confiance. Conservez cette facture pour votre dossier d’entretien.", demoSeedBatchId: SEED_KEY,
        vehicles: { create: { id: id("iv-camille"), vehicleId: vid, mileageIn: camille.vehicle.mileage, mileageOut: camille.vehicle.mileage, sortOrder: 0,
          lineItems: { create: lineCreates("il-camille", D.CAMILLE_LINES) } } },
      },
    });
    tally("Invoice", true);
    tally("InvoiceLineItem", true, D.CAMILLE_LINES.length);
    await tx.invoicePaymentEntry.create({ data: { id: id("pay-camille"), invoiceId, method: "CARD", amount: t.total, sortOrder: 0, createdAt: D.at(approvalDay, "16:45") } });
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { invoiceNumber: true } });
    await recordFinancialEvent(tx, { shopId: SHOP_ID, invoiceId, type: "PAYMENT_RECORDED", amount: t.total, data: { invoiceNumber: inv.invoiceNumber, mode: "CARD", payments: [{ method: "CARD", amount: t.total }] } });
    await tx.quote.update({ where: { id: quoteId }, data: { status: "CONVERTED", convertedInvoiceId: invoiceId } });
  } else tally("Invoice", false);

  // Orden de trabajo terminada y facturada, vinculada a la estimación y la factura.
  const woExisted = await present(() => tx.workOrder.count({ where: { id: woId } }));
  if (!woExisted) {
    const orderNumber = await allocateNextWorkOrderNumber(tx, SHOP_ID);
    await tx.workOrder.create({
      data: {
        id: woId, shopId: SHOP_ID, clientId: cid, vehicleId: vid, quoteId, invoiceId, mechanicId: ctx.mechanicIds.mathieu,
        orderNumber, status: "INVOICED", jobStatus: "COMPLETED", concern: "Vidange d’huile et vérification d’un bruit au freinage.",
        diagnosis: "Plaquettes avant usées. Remplacement recommandé. Entretien d’huile effectué.",
        mileageIn: camille.vehicle.mileage, mileageOut: camille.vehicle.mileage, demoSeedBatchId: SEED_KEY,
        createdAt: D.at(approvalDay, "09:30"), lines: { create: woLineCreates("wol-camille", D.CAMILLE_LINES, ctx.partIds) },
      },
    });
    tally("WorkOrder", true);
    tally("WorkOrderLine", true, D.CAMILLE_LINES.length);
  } else tally("WorkOrder", false);
  // Idempotente: solo descuenta lo que la orden aún no tiene registrado.
  const wo = await tx.workOrder.findUniqueOrThrow({ where: { id: woId }, select: { orderNumber: true } });
  await reconcileWorkOrderConsumption(tx, SHOP_ID, woId, { orderNumber: wo.orderNumber });

  // Inspección del día de la visita, vinculada a la orden, con hallazgos preparados para fotos.
  const inspId = id("insp-camille");
  if (!(await present(() => tx.inspection.count({ where: { id: inspId } })))) {
    await tx.inspection.create({
      data: {
        id: inspId, shopId: SHOP_ID, clientId: cid, vehicleId: vid, workOrderId: woId, mechanicId: ctx.mechanicIds.mathieu,
        mileage: camille.vehicle.mileage, notes: "Inspection réalisée pendant la vidange.", createdAt: D.at(jobDay, "10:15"),
        shareToken: randomBytes(24).toString("base64url"),
        items: { create: [
          { id: id("ii-camille-tires"), category: "TIRES", condition: "ATTENTION", notes: "Usure inégale observée. Prévoir une vérification de l’alignement.", sortOrder: 0 },
          { id: id("ii-camille-brakes"), category: "BRAKES", condition: "SERVICE_REQUIRED", notes: "Plaquettes avant usées; remplacement recommandé.", sortOrder: 1 },
          { id: id("ii-camille-lights"), category: "LIGHTS", condition: "GOOD", notes: "Fonctionnement vérifié.", sortOrder: 2 },
          { id: id("ii-camille-battery"), category: "BATTERY", condition: "GOOD", notes: "Bornes propres, aucun problème observé.", sortOrder: 3 },
          { id: id("ii-camille-fluids"), category: "FLUIDS", condition: "GOOD", notes: "Niveaux vérifiés.", sortOrder: 4 },
          { id: id("ii-camille-wipers"), category: "WIPERS", condition: "ATTENTION", notes: "Performance réduite; remplacement à prévoir.", sortOrder: 5 },
        ] },
      },
    });
    tally("Inspection", true);
    tally("InspectionItem", true, 6);
  } else tally("Inspection", false);

  // Recordatorio por la regla real: próximo servicio a 6 meses / 8 000 km.
  const ruleId = id("rule-oil");
  await ensure("ReminderRule", () => present(() => tx.reminderRule.count({ where: { id: ruleId } })), () =>
    tx.reminderRule.create({ data: { id: ruleId, shopId: SHOP_ID, name: D.OIL_RULE.name, keyword: D.OIL_RULE.keyword, intervalMonths: D.OIL_RULE.intervalMonths, intervalKm: D.OIL_RULE.intervalKm, leadDays: D.OIL_RULE.leadDays, isActive: true } }),
  );
  const plan = planReminder({ ...D.OIL_RULE, id: ruleId }, issued, camille.vehicle.mileage);
  if (!plan || !plan.dueDate) throw new Error("La regla de vidange no produjo fecha de recordatorio.");
  await ensure("ServiceReminder", () => present(() => tx.serviceReminder.count({ where: { id: id("rem-camille-oil") } })), () =>
    tx.serviceReminder.create({
      data: {
        id: id("rem-camille-oil"), shopId: SHOP_ID, vehicleId: vid, serviceType: D.OIL_RULE.name, dueDate: plan.dueDate, dueMileage: plan.dueMileage,
        remindAt: plan.remindAt, notes: "Auto: relacionado con la orden de trabajo de Camille", status: "PENDING", ruleId, workOrderId: woId, createdAt: issued,
      },
    }),
  );

  // Portal de la clienta: solo hash en la BD (generatePortalToken / hashPortalToken / portalLinkExpiry).
  const now = new Date();
  const activeLinks = await tx.customerPortalAccess.count({ where: { shopId: SHOP_ID, clientId: cid, revokedAt: null, expiresAt: { gt: now } } });
  if (ctx.portalRequested && activeLinks > 0) {
    await tx.customerPortalAccess.updateMany({ where: { shopId: SHOP_ID, clientId: cid, revokedAt: null }, data: { revokedAt: now } });
  }
  if (ctx.portalRequested || activeLinks === 0) {
    const token = generatePortalToken();
    await tx.customerPortalAccess.create({
      data: { id: randomUUID(), shopId: SHOP_ID, clientId: cid, tokenHash: hashPortalToken(token), createdVia: "STAFF", createdById: OWNER_ID, expiresAt: portalLinkExpiry(now) },
    });
    ctx.portalTokenForFile = token;
    tally("CustomerPortalAccess", true);
  } else tally("CustomerPortalAccess", false);

  const insp = await tx.inspection.findUniqueOrThrow({ where: { id: inspId }, select: { shareToken: true } });
  ctx.shareTokenForFile = insp.shareToken;
}

/** Alexandre: estimación pendiente con token de aprobación real (sin enviarla). */
async function seedAlexandreEstimate(ctx: Ctx): Promise<void> {
  const { tx } = ctx;
  const quoteId = id("quote-alexandre");
  const day = D.prevBusinessDay(ctx.refDate);
  const t = D.totalsFor(D.ALEXANDRE_LINES);
  const alex = D.CLIENTS[1];
  if (!(await present(() => tx.quote.count({ where: { id: quoteId } })))) {
    const quoteNumber = await allocateNextQuoteNumber(tx, SHOP_ID);
    await tx.quote.create({
      data: {
        id: quoteId, shopId: SHOP_ID, clientId: ctx.clientIds.alexandre, quoteNumber, status: "DRAFT", issuedAt: D.at(day, "15:00"),
        validUntil: D.at(D.addDays(ctx.refDate, 30), "17:00"), subtotal: t.subtotal, taxRate: t.taxRate, taxAmount: t.taxAmount, total: t.total,
        taxSnapshot: json(t.snapshot), language: "FR", demoSeedBatchId: SEED_KEY,
        vehicles: { create: { id: id("qv-alexandre"), vehicleId: ctx.vehicleIds.alexandre, mileageIn: alex.vehicle.mileage, mileageOut: alex.vehicle.mileage, sortOrder: 0,
          lineItems: { create: lineCreates("qli-alexandre", D.ALEXANDRE_LINES) } } },
      },
    });
    tally("Quote", true);
    tally("QuoteLineItem", true, D.ALEXANDRE_LINES.length);
  } else tally("Quote", false);

  // Token de aprobación con el helper real; se renueva solo si venció o ya se consumió.
  const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, select: { approvalToken: true, approvalTokenExpiresAt: true, approvalTokenConsumedAt: true } });
  const now = new Date();
  if (!q.approvalToken || !q.approvalTokenExpiresAt || q.approvalTokenExpiresAt <= now || q.approvalTokenConsumedAt) {
    const token = generateQuoteApprovalToken();
    await tx.quote.update({ where: { id: quoteId }, data: { approvalToken: token, approvalTokenExpiresAt: quoteApprovalExpiry(now), approvalTokenConsumedAt: null } });
    ctx.approvalTokenForFile = token;
  } else {
    ctx.approvalTokenForFile = q.approvalToken;
  }
}

/** Sophie: orden lista para recoger y factura emitida pendiente de pago (sin marcar avisos). */
async function seedSophieReady(ctx: Ctx): Promise<void> {
  const { tx } = ctx;
  const day = D.prevBusinessDay(ctx.refDate);
  const woId = id("wo-sophie");
  const invoiceId = id("inv-sophie");
  const t = D.totalsFor(D.SOPHIE_LINES);
  if (await present(() => tx.workOrder.count({ where: { id: woId } }))) {
    tally("WorkOrder", false);
    tally("Invoice", false);
    return;
  }
  const invoiceNumber = await allocateNextInvoiceNumber(tx, SHOP_ID);
  await tx.invoice.create({
    data: {
      id: invoiceId, shopId: SHOP_ID, clientId: ctx.clientIds.sophie, invoiceNumber, status: "DRAFT", issuedAt: D.at(day, "16:00"),
      subtotal: t.subtotal, taxRate: t.taxRate, taxAmount: t.taxAmount, total: t.total, taxSnapshot: json(t.snapshot), taxRegistration: null,
      currency: "CAD", language: "FR", demoSeedBatchId: SEED_KEY,
      vehicles: { create: { id: id("iv-sophie"), vehicleId: ctx.vehicleIds.sophie, mileageIn: D.CLIENTS[2].vehicle.mileage, mileageOut: D.CLIENTS[2].vehicle.mileage, sortOrder: 0,
        lineItems: { create: lineCreates("il-sophie", D.SOPHIE_LINES) } } },
    },
  });
  tally("Invoice", true);
  tally("InvoiceLineItem", true, D.SOPHIE_LINES.length);
  await recordFinancialEvent(tx, { shopId: SHOP_ID, invoiceId, type: "INVOICE_ISSUED", amount: t.total, data: { invoiceNumber, subtotal: t.subtotal, taxAmount: t.taxAmount, taxLines: t.snapshot.lines } });
  const orderNumber = await allocateNextWorkOrderNumber(tx, SHOP_ID);
  await tx.workOrder.create({
    data: {
      id: woId, shopId: SHOP_ID, clientId: ctx.clientIds.sophie, vehicleId: ctx.vehicleIds.sophie, invoiceId, mechanicId: ctx.mechanicIds.olivier,
      orderNumber, status: "INVOICED", jobStatus: "READY_FOR_PICKUP", readyForPickupNotifiedAt: null,
      concern: "Inspection des freins et entretien demandé", mileageIn: D.CLIENTS[2].vehicle.mileage, mileageOut: D.CLIENTS[2].vehicle.mileage,
      demoSeedBatchId: SEED_KEY, createdAt: D.at(day, "09:00"),
      lines: { create: woLineCreates("wol-sophie", D.SOPHIE_LINES, ctx.partIds) },
    },
  });
  tally("WorkOrder", true);
  tally("WorkOrderLine", true, D.SOPHIE_LINES.length);
}

/** Nicolas: orden en servicio para diagnóstico. */
async function seedNicolasInService(ctx: Ctx): Promise<void> {
  const { tx } = ctx;
  const woId = id("wo-nicolas");
  if (await present(() => tx.workOrder.count({ where: { id: woId } }))) {
    tally("WorkOrder", false);
    return;
  }
  const orderNumber = await allocateNextWorkOrderNumber(tx, SHOP_ID);
  await tx.workOrder.create({
    data: {
      id: woId, shopId: SHOP_ID, clientId: ctx.clientIds.nicolas, vehicleId: ctx.vehicleIds.nicolas, mechanicId: ctx.mechanicIds.olivier,
      orderNumber, status: "IN_PROGRESS", jobStatus: "IN_SERVICE", concern: "Voyant moteur allumé — diagnostic demandé",
      mileageIn: D.CLIENTS[3].vehicle.mileage, demoSeedBatchId: SEED_KEY, createdAt: D.at(D.prevBusinessDay(ctx.refDate), "08:45"),
      lines: { create: woLineCreates("wol-nicolas", D.NICOLAS_LINES, ctx.partIds) },
    },
  });
  tally("WorkOrder", true);
  tally("WorkOrderLine", true, D.NICOLAS_LINES.length);
}

async function seedAppointments(ctx: Ctx): Promise<void> {
  const { tx } = ctx;
  const now = new Date();
  for (const a of D.resolveAppointments(ctx.refDate)) {
    const apptId = id(`appt-${a.key}`);
    const client = D.CLIENTS.find((c) => c.key === a.client)!;
    const past = a.startsAt < now;
    const createdAt = new Date(a.startsAt.getTime() - (past ? 10 : 3) * 86_400_000);
    const created = await ensure("Appointment", () => present(() => tx.appointment.count({ where: { id: apptId } })), () =>
      tx.appointment.create({
        data: {
          id: apptId, shopId: SHOP_ID, clientId: ctx.clientIds[a.client], vehicleId: ctx.vehicleIds[a.client], mechanicId: ctx.mechanicIds[a.mechanic],
          title: a.title, startsAt: a.startsAt, endsAt: a.endsAt, durationMinutes: D.APPOINTMENT_MINUTES, status: a.status, source: a.source,
          demoSeedBatchId: SEED_KEY, createdAt, updatedAt: createdAt,
        },
      }),
    );
    if (!created) continue;
    const byWeb = a.source === "PUBLIC_WEB";
    await tx.appointmentEvent.create({
      data: {
        id: id(`appt-ev-${a.key}-created`), shopId: SHOP_ID, appointmentId: apptId, type: "CREATED",
        actorType: byWeb ? "CLIENT" : "STAFF", actorUserId: byWeb ? null : OWNER_ID, actorName: byWeb ? `${client.firstName} ${client.lastName}` : D.STAFF.owner.name,
        changes: {}, notice: null, noticeOutcome: null, createdAt,
      },
    });
    if (a.status === "COMPLETED" || a.status === "CANCELLED") {
      await tx.appointmentEvent.create({
        data: {
          id: id(`appt-ev-${a.key}-close`), shopId: SHOP_ID, appointmentId: apptId, type: a.status === "CANCELLED" ? "CANCELLED" : "STATUS_CHANGED",
          actorType: "STAFF", actorUserId: OWNER_ID, actorName: D.STAFF.owner.name,
          changes: { status: { from: "SCHEDULED", to: a.status } }, notice: null, noticeOutcome: null, createdAt: a.endsAt,
        },
      });
    }
  }
}

async function seedFutureItems(ctx: Ctx): Promise<void> {
  const { tx } = ctx;
  const isabelle = ctx.vehicleIds.isabelle;
  const francois = ctx.vehicleIds.francois;
  const plans = [
    { key: "rem-isabelle-rotation", vehicleId: isabelle, serviceType: "Rotation des pneus", days: 60, dueMileage: 56800 },
    { key: "rem-francois-oil", vehicleId: francois, serviceType: "Vidange d’huile synthétique", days: 75, dueMileage: 145900 },
  ];
  for (const p of plans) {
    const dueDate = D.at(D.addDays(ctx.refDate, p.days), "09:00");
    await ensure("ServiceReminder", () => present(() => tx.serviceReminder.count({ where: { id: id(p.key) } })), () =>
      tx.serviceReminder.create({
        data: { id: id(p.key), shopId: SHOP_ID, vehicleId: p.vehicleId, serviceType: p.serviceType, dueDate, dueMileage: p.dueMileage,
          remindAt: new Date(dueDate.getTime() - 14 * 86_400_000), notes: "Rappel de démonstration — aucun envoi effectué", status: "PENDING" },
      }),
    );
  }

  // Almacenamiento de neumáticos de Alexandre (check-in registrado, sin aviso marcado como enviado).
  const setId = id("tire-alexandre");
  const checkedInAt = D.at(D.prevBusinessDay(D.addDays(ctx.refDate, -10)), "10:00");
  const location = "Étagère B — emplacement 12";
  await ensure("TireStorageSet", () => present(() => tx.tireStorageSet.count({ where: { id: setId } })), async () => {
    await tx.tireStorageSet.create({
      data: {
        id: setId, shopId: SHOP_ID, clientId: ctx.clientIds.alexandre, vehicleId: ctx.vehicleIds.alexandre, season: "SUMMER",
        size: normalizeTireSize("225/65R17") ?? "225/65R17", quantity: 4, condition: "GOOD", withRims: false, storageLocation: location,
        status: "STORED", checkedInAt, expectedPickupDate: new Date(`${D.addDays(ctx.refDate, 150)}T00:00:00.000Z`),
        notes: "Entreposage saisonnier — dossier de démonstration.", checkInNotifiedAt: null,
        pickupReminder14SentAt: null, pickupReminder3SentAt: null,
      },
    });
    await tx.tireStorageEvent.create({ data: { id: id("tire-ev-alexandre-checkin"), shopId: SHOP_ID, setId, type: "CHECK_IN", location, note: "Entreposage saisonnier — dossier de démonstration.", createdAt: checkedInAt } });
  });

  const campaignId = id("campaign-winter");
  await ensure("Campaign", () => present(() => tx.campaign.count({ where: { id: campaignId } })), () =>
    tx.campaign.create({
      data: {
        id: campaignId, shopId: SHOP_ID, name: "Préparation à la saison hivernale", channel: "EMAIL",
        subject: "Votre véhicule est-il prêt pour l’hiver?",
        bodyHtml: [
          "Bonjour,",
          "",
          "La saison froide approche. L’équipe de Garage Laurent est là pour vous aider à préparer votre véhicule : changement de pneus, vérification des freins et entretien préventif.",
          "",
          "Prenez rendez-vous sur notre page de réservation ou appelez-nous pour trouver une plage qui vous convient.",
          "",
          "Au plaisir de vous accueillir,",
          "L’équipe de Garage Laurent",
        ].join("\n"),
        segment: json({ type: "ALL_CONSENTED" }), status: "DRAFT", createdByUserId: OWNER_ID,
      },
    }),
  );
}

/** Historial de 8 semanas + escenarios principales en orden cronológico (numeración INV-n creciente). */
async function seedAllInvoicesInOrder(ctx: Ctx): Promise<void> {
  type Job = { date: string; run: () => Promise<void> };
  const jobs: Job[] = D.HISTORICAL_INVOICES.map((h) => ({
    date: D.prevBusinessDay(D.addDays(ctx.refDate, -h.calendarDaysAgo)),
    run: () => seedHistoricalInvoice(ctx, h),
  }));
  jobs.push({ date: D.nextBusinessDay(D.prevBusinessDay(D.addDays(ctx.refDate, -24))), run: () => seedCamilleJourney(ctx) });
  jobs.push({ date: D.prevBusinessDay(ctx.refDate), run: () => seedSophieReady(ctx) });
  jobs.sort((a, b) => a.date.localeCompare(b.date));
  for (const j of jobs) await j.run();
}

// ── Orquestación ───────────────────────────────────────────────────────────

function idMaps() {
  const clientIds = Object.fromEntries(D.CLIENTS.map((c) => [c.key, id(`client-${c.key}`)])) as Record<D.ClientKey, string>;
  const vehicleIds = Object.fromEntries(D.CLIENTS.map((c) => [c.key, id(`vehicle-${c.key}`)])) as Record<D.ClientKey, string>;
  const partIds = Object.fromEntries(D.PARTS.map((p) => [p.key, id(`part-${p.key}`)])) as Record<D.PartKey, string>;
  const mechanicIds = { mathieu: id("user-mathieu"), olivier: id("user-olivier") } as Record<D.MechanicKey, string>;
  return { clientIds, vehicleIds, partIds, mechanicIds };
}

async function runSeed(refDate: string, ownerPasswordHash: string | null, portalRequested: boolean, dryRun: boolean) {
  const ids = idMaps();
  const ctx: Ctx = {
    tx: undefined as unknown as Prisma.TransactionClient,
    refDate,
    ownerPasswordHash,
    ownerName: D.STAFF.owner.name,
    portalTokenForFile: null,
    shareTokenForFile: null,
    approvalTokenForFile: null,
    portalRequested,
    shopTaxLines: json(D.TAX_LINES),
    mechanicIds: ids.mechanicIds,
    clientIds: ids.clientIds,
    vehicleIds: ids.vehicleIds,
    partIds: ids.partIds,
  };
  const now = new Date();
  try {
    await db.$transaction(
      async (tx) => {
        ctx.tx = tx;
        await assertNoConflicts(tx);
        await seedShop(ctx, now);
        await seedPeople(ctx);
        await seedCatalogAndClients(ctx);
        await seedAllInvoicesInOrder(ctx);
        await seedAlexandreEstimate(ctx);
        await seedNicolasInService(ctx);
        await seedAppointments(ctx);
        await seedFutureItems(ctx);
        if (dryRun) throw new DryRunRollback();
      },
      { timeout: 180_000, maxWait: 20_000 },
    );
  } catch (err) {
    if (err instanceof DryRunRollback) return { ctx, committed: false };
    throw err;
  }
  return { ctx, committed: true };
}

async function main() {
  assertTarget();
  const dryRun = flag("dry-run");
  const refDate = option("ref-date") ?? formatShopDate(new Date(), SHOP_TZ);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(refDate)) fail("--ref-date debe tener formato YYYY-MM-DD.");

  D.assertBriefTotals();
  const agendaErrors = D.agendaProblems(D.resolveAppointments(refDate));
  if (agendaErrors.length > 0) fail(`La agenda calculada incumple el horario o se solapa:\n${agendaErrors.join("\n")}`);

  const ownerPassword = process.env.DEMO_OWNER_PASSWORD;
  if (ownerPassword !== undefined && ownerPassword.length < 8) fail("DEMO_OWNER_PASSWORD debe tener al menos 8 caracteres.");
  const existingOwnerHash = await db.user.findUnique({ where: { email: OWNER_EMAIL }, select: { passwordHash: true } });
  if (!existingOwnerHash && !ownerPassword) fail("Falta DEMO_OWNER_PASSWORD (la cuenta del dueño aún no existe).");
  const ownerPasswordHash = ownerPassword ? await bcrypt.hash(ownerPassword, 12) : null;

  process.stdout.write(`[seed] ${D.SEED_KEY} · referencia ${refDate} · día de demostración ${D.demoDayAfter(refDate)}${dryRun ? " · DRY-RUN (se revierte)" : ""}\n`);

  let result: Awaited<ReturnType<typeof runSeed>>;
  try {
    result = await runSeed(refDate, ownerPasswordHash, flag("issue-portal-link"), dryRun);
  } catch (err) {
    if (err instanceof SeedConflict) fail(err.message);
    throw err;
  }

  if (result.committed) {
    const shop = await db.shop.findUniqueOrThrow({ where: { id: SHOP_ID } });
    try {
      await provisionDefaultSenderIdentities(shop);
    } catch (err) {
      process.stderr.write(`[seed] Aviso: no se pudieron preparar las identidades de envío locales (${(err as Error).message}).\n`);
    }
  }

  const summary = [...stats.entries()].sort(([a], [b]) => a.localeCompare(b));
  process.stdout.write("\n[seed] Registros (creados / ya existían):\n");
  for (const [model, s] of summary) process.stdout.write(`  ${model.padEnd(24)} ${String(s.created).padStart(4)} / ${String(s.existing).padStart(4)}\n`);

  const accessFile = option("access-file");
  if (result.committed && accessFile) {
    const base = getAppUrl();
    const links = {
      generatedAt: new Date().toISOString(),
      warning: "Enlaces de acceso sensibles (portal y aprobación). No los subas ni los compartas.",
      adminLogin: `${base}/admin/login`,
      ownerEmail: OWNER_EMAIL,
      booking: `${base}/book/${SHOP_SLUG}`,
      alexandreQuoteApproval: result.ctx.approvalTokenForFile ? `${base}/quote/${result.ctx.approvalTokenForFile}` : null,
      camilleInspectionReport: result.ctx.shareTokenForFile ? `${base}/inspection/${result.ctx.shareTokenForFile}` : null,
      camillePortal: result.ctx.portalTokenForFile ? `${base}/portal/${result.ctx.portalTokenForFile}` : "no generado en esta ejecución (usa --issue-portal-link)",
    };
    // Reejecutar sin --issue-portal-link no revoca nada: conserva el enlace de portal ya guardado.
    if (!result.ctx.portalTokenForFile && existsSync(accessFile)) {
      const previous = JSON.parse(readFileSync(accessFile, "utf8")) as { camillePortal?: string };
      if (previous.camillePortal?.startsWith(base)) links.camillePortal = previous.camillePortal;
    }
    await writeFile(accessFile, JSON.stringify(links, null, 2), { encoding: "utf8", mode: 0o600 });
    process.stdout.write(`\n[seed] Enlaces de acceso escritos en el archivo indicado (no se imprimen aquí).\n`);
  } else if (result.committed && result.ctx.portalTokenForFile) {
    process.stdout.write("\n[seed] Aviso: se creó un enlace de portal y no se guardó. Vuelve a ejecutar con --access-file=<ruta> --issue-portal-link para obtenerlo.\n");
  }
  process.stdout.write(dryRun ? "\n[seed] Dry-run completado. No se persistió ningún cambio.\n" : "\n[seed] Listo.\n");
}

main()
  .catch((err) => {
    process.stderr.write(`[seed] Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
