// Renders the demo SMS examples with the REAL product formatters (src/lib/sms.ts) and the
// verified Garage Laurent dataset plan. No DB, no network, nothing is sent.
// Run: npx tsx scripts/demo-journey/build-messages.ts
import fs from "node:fs";
import path from "node:path";
import {
  SMS_COPY, INVOICE_SMS_COPY, QUOTE_SMS_COPY, WORK_ORDER_READY_SMS_COPY, SERVICE_REMINDER_SMS_COPY,
  type SmsLanguage,
} from "../../src/lib/sms";
import { formatCurrency } from "../../src/lib/utils";
import { formatShopDateTime } from "../../src/lib/shop-timezone";
import {
  CAMILLE_LINES, ALEXANDRE_LINES, totalsFor, demoDayAfter, SHOP_TZ,
} from "../marketing/garage-laurent-dataset";
import { parseShopDateTime } from "../../src/lib/shop-timezone";

const SHOP_NAME = "Garage Laurent";
// Static, non-bearer targets: the public /demo never links to live tokenized endpoints.
const STATIC_LINK = { quote: "garageos.com/demo#approval", invoice: "garageos.com/demo#invoice", manage: "garageos.com/demo#booking" };

const camille = totalsFor(CAMILLE_LINES);
const alexandre = totalsFor(ALEXANDRE_LINES);
if (camille.total !== "423.11" || alexandre.total !== "218.45") throw new Error("Dataset totals drifted from the brief");

const refDate = process.env.DEMO_REF_DATE ?? "2026-10-07";
const demoDay = demoDayAfter(refDate);
const startsAt = parseShopDateTime(demoDay, "08:00", SHOP_TZ);

const out: Record<string, unknown> = {};
for (const lang of ["EN", "FR"] as SmsLanguage[]) {
  const key = lang.toLowerCase();
  const base = { shopName: SHOP_NAME, language: lang };
  const appt = { type: "confirmation" as const, to: "", shopId: "", title: "Vidange d’huile — Honda Civic",
    startsAtFormatted: formatShopDateTime(startsAt, SHOP_TZ), manageUrl: STATIC_LINK.manage, ...base };
  out[key] = {
    confirmation: { text: SMS_COPY[lang].confirmation(appt), link: STATIC_LINK.manage, anchor: "booking" },
    quote: { text: QUOTE_SMS_COPY[lang]({ ...base, to: "", shopId: "", quoteNumber: "COT-0001",
      totalFormatted: formatCurrency(camille.total), approvalUrl: STATIC_LINK.quote }), link: STATIC_LINK.quote, anchor: "approval" },
    ready: { text: WORK_ORDER_READY_SMS_COPY[lang]({ ...base, to: "", shopId: "", workOrderId: "", orderNumber: "OT-0002",
      vehicleDescription: "2020 Hyundai Tucson" }), link: null, anchor: "work" },
    invoice: { text: INVOICE_SMS_COPY[lang]({ ...base, to: "", shopId: "", invoiceNumber: "INV-0006",
      totalFormatted: formatCurrency(camille.total), downloadUrl: STATIC_LINK.invoice }), link: STATIC_LINK.invoice, anchor: "invoice" },
    maintenance: { text: SERVICE_REMINDER_SMS_COPY[lang]({ ...base, to: "", shopId: "", reminderId: "",
      serviceType: "Vidange d’huile synthétique", vehicleDescription: "2019 Honda Civic", dueDate: null }), link: null, anchor: "follow-up" },
  };
}

const doc = {
  _provenance: {
    generator: "scripts/demo-journey/build-messages.ts",
    source: "Real product formatters exported from src/lib/sms.ts; amounts from the verified marketing-garage-laurent-v1 dataset plan.",
    note: "Example messages only. Nothing was sent. Links are static demo targets, not bearer-token URLs. Amount/date formatting is the product's own (fr-CA) in both languages.",
    totals: { camilleCad: camille.total, alexandreCad: alexandre.total },
    refDate, demoDay,
  },
  ...out,
};
const target = path.resolve(process.cwd(), "public/demo/garage-laurent/messages.json");
fs.writeFileSync(target, JSON.stringify(doc, null, 2) + "\n");
console.log("wrote", target);
