// Customer-facing copy for the Tire Storage communication lifecycle (Block 15 / I-2). Pure: no I/O.
// Privacy rule: only customer-safe facts — shop, vehicle, tire size/season, dates and a derived
// reference. The internal storage location (rack/bin) is NEVER included.

export type TireNoticeKind = "CHECK_IN" | "CHECK_OUT" | "PICKUP_REMINDER_14" | "PICKUP_REMINDER_3" | "MANUAL";
export type TireNoticeLang = "EN" | "FR";

export interface TireNoticeData {
  kind: TireNoticeKind;
  lang: TireNoticeLang;
  clientName: string;
  shopName: string;
  shopPhone?: string | null;
  /** Public booking URL, only when the shop takes online bookings. */
  bookingUrl?: string | null;
  vehicle?: string | null;
  quantity: number;
  size: string;
  season: "WINTER" | "SUMMER" | "ALL_SEASON";
  reference: string;
  /** Pre-formatted, shop-local dates. */
  checkedInDate?: string | null;
  checkedOutDate?: string | null;
  expectedPickupDate?: string | null;
}

const SEASON: Record<TireNoticeLang, Record<TireNoticeData["season"], string>> = {
  EN: { WINTER: "winter", SUMMER: "summer", ALL_SEASON: "all-season" },
  FR: { WINTER: "d'hiver", SUMMER: "d'été", ALL_SEASON: "quatre saisons" },
};

function tiresPhrase(d: TireNoticeData): string {
  const season = SEASON[d.lang][d.season];
  return d.lang === "FR"
    ? `${d.quantity} pneus ${season} (${d.size})${d.vehicle ? ` de votre ${d.vehicle}` : ""}`
    : `${d.quantity} ${season} tires (${d.size})${d.vehicle ? ` for your ${d.vehicle}` : ""}`;
}

function contactLine(d: TireNoticeData): string {
  if (d.lang === "FR") {
    if (d.bookingUrl) return `Réservez en ligne : ${d.bookingUrl}${d.shopPhone ? ` ou appelez le ${d.shopPhone}` : ""}.`;
    return d.shopPhone ? `Appelez le ${d.shopPhone} pour prendre rendez-vous.` : "Communiquez avec nous pour prendre rendez-vous.";
  }
  if (d.bookingUrl) return `Book online: ${d.bookingUrl}${d.shopPhone ? ` or call ${d.shopPhone}` : ""}.`;
  return d.shopPhone ? `Call ${d.shopPhone} to book.` : "Contact us to book.";
}

export function tireNoticeSms(d: TireNoticeData): string {
  const fr = d.lang === "FR";
  const sep = fr ? " : " : ": ";
  switch (d.kind) {
    case "CHECK_IN":
      return fr
        ? `${d.shopName}${sep}nous avons reçu en entreposage ${tiresPhrase(d)}${d.checkedInDate ? ` le ${d.checkedInDate}` : ""}. Réf. ${d.reference}.`
        : `${d.shopName}${sep}we checked ${tiresPhrase(d)} into storage${d.checkedInDate ? ` on ${d.checkedInDate}` : ""}. Ref ${d.reference}.`;
    case "CHECK_OUT":
      return fr
        ? `${d.shopName}${sep}vos pneus ${SEASON.FR[d.season]} (${d.size}) ont été remis${d.checkedOutDate ? ` le ${d.checkedOutDate}` : ""}. Réf. ${d.reference}. Merci!`
        : `${d.shopName}${sep}your ${SEASON.EN[d.season]} tires (${d.size}) were picked up${d.checkedOutDate ? ` on ${d.checkedOutDate}` : ""}. Ref ${d.reference}. Thank you!`;
    case "PICKUP_REMINDER_14":
    case "PICKUP_REMINDER_3":
      return fr
        ? `${d.shopName}${sep}vos pneus entreposés (${d.size}) approchent de la date prévue de retrait/changement${d.expectedPickupDate ? ` (${d.expectedPickupDate})` : ""}. ${contactLine(d)}`
        : `${d.shopName}${sep}your stored tires (${d.size}) are approaching their expected pickup/seasonal change${d.expectedPickupDate ? ` (${d.expectedPickupDate})` : ""}. ${contactLine(d)}`;
    case "MANUAL":
    default:
      return fr
        ? `${d.shopName}${sep}vos pneus (${d.size}) sont entreposés chez nous. Réf. ${d.reference}.${d.expectedPickupDate ? ` Retrait prévu : ${d.expectedPickupDate}.` : ""} ${contactLine(d)}`
        : `${d.shopName}${sep}your tires (${d.size}) are in storage with us. Ref ${d.reference}.${d.expectedPickupDate ? ` Expected pickup: ${d.expectedPickupDate}.` : ""} ${contactLine(d)}`;
  }
}

export function tireNoticeEmail(d: TireNoticeData): { subject: string; subtitle: string; body: string } {
  const fr = d.lang === "FR";
  const hello = fr ? `Bonjour ${d.clientName},` : `Hello ${d.clientName},`;
  const details = [
    fr ? `Pneus : ${tiresPhrase(d)}` : `Tires: ${tiresPhrase(d)}`,
    fr ? `Référence : ${d.reference}` : `Reference: ${d.reference}`,
    d.checkedInDate ? (fr ? `Reçus le : ${d.checkedInDate}` : `Checked in: ${d.checkedInDate}`) : null,
    d.expectedPickupDate ? (fr ? `Retrait/changement prévu : ${d.expectedPickupDate}` : `Expected pickup/change: ${d.expectedPickupDate}`) : null,
  ].filter(Boolean).join("\n");
  switch (d.kind) {
    case "CHECK_IN":
      return fr
        ? { subject: `Vos pneus sont entreposés — ${d.shopName}`, subtitle: "Confirmation d'entreposage", body: `${hello}\n\nNous confirmons que vos pneus sont maintenant entreposés chez ${d.shopName}.\n\n${details}\n\n${d.expectedPickupDate ? "Nous vous rappellerons à l'approche de la date prévue. " : ""}${contactLine(d)}` }
        : { subject: `Your tires are in storage — ${d.shopName}`, subtitle: "Storage confirmation", body: `${hello}\n\nThis confirms your tires are now stored at ${d.shopName}.\n\n${details}\n\n${d.expectedPickupDate ? "We'll remind you as the expected date approaches. " : ""}${contactLine(d)}` };
    case "CHECK_OUT":
      return fr
        ? { subject: `Vos pneus ont été remis — ${d.shopName}`, subtitle: "Retrait confirmé", body: `${hello}\n\nNous confirmons que vos pneus ont été remis${d.checkedOutDate ? ` le ${d.checkedOutDate}` : ""}.\n\n${details}\n\nMerci de votre confiance!` }
        : { subject: `Your tires were picked up — ${d.shopName}`, subtitle: "Pickup confirmed", body: `${hello}\n\nThis confirms your tires were picked up${d.checkedOutDate ? ` on ${d.checkedOutDate}` : ""}.\n\n${details}\n\nThank you for your business!` };
    case "PICKUP_REMINDER_14":
    case "PICKUP_REMINDER_3":
      return fr
        ? { subject: `Vos pneus entreposés — changement de saison approchant · ${d.shopName}`, subtitle: "Rappel de retrait", body: `${hello}\n\nVos pneus entreposés chez ${d.shopName} approchent de leur date prévue de retrait ou de changement de saison.\n\n${details}\n\n${contactLine(d)}` }
        : { subject: `Your stored tires — seasonal change coming up · ${d.shopName}`, subtitle: "Pickup reminder", body: `${hello}\n\nYour tires stored at ${d.shopName} are approaching their expected pickup / seasonal change window.\n\n${details}\n\n${contactLine(d)}` };
    case "MANUAL":
    default:
      return fr
        ? { subject: `À propos de vos pneus entreposés — ${d.shopName}`, subtitle: "Vos pneus entreposés", body: `${hello}\n\nVos pneus sont entreposés chez ${d.shopName}.\n\n${details}\n\n${contactLine(d)}` }
        : { subject: `About your stored tires — ${d.shopName}`, subtitle: "Your stored tires", body: `${hello}\n\nYour tires are stored at ${d.shopName}.\n\n${details}\n\n${contactLine(d)}` };
  }
}
