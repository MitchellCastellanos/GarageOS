import { staticFile } from "remotion";
import type { Locale } from "../locales/types";

/** Screenshot catalogue: key -> intrinsic pixel size of the original PNG (identical in EN/FR unless noted). */
export const SHOTS = {
  "01-dashboard-desktop": { w: 2880, h: 2000 },
  "02-agenda-desktop": { w: 2880, h: 2000 },
  "03-booking-desktop": { w: 2880, h: 2000 },
  "04-booking-mobile": { w: 780, h: 1688 },
  "05-booking-form-mobile": { w: 780, h: 2480 },
  "08-inspection-admin-desktop": { w: 2880, h: 2000 },
  "09-inspection-report-mobile": { w: 780, h: 1688 },
  "10-estimate-editor-desktop": { w: 2880, h: 2000 },
  "11-estimate-customer-mobile": { w: 780, h: 2480 },
  "13-work-order-desktop": { w: 2880, h: 2000 },
  "15-invoice-pdf-page": { w: 1275, h: 1650 },
  "16-invoice-email": { w: 1520, h: 1984 },
  "17-payment-record-desktop": { w: 2880, h: 2000 },
  "18-customer-portal-mobile": { w: 780, h: 1688 },
  "19-maintenance-reminder-email": { w: 1520, h: 1912 }, // FR capture is 1520x2002
  "21-campaign-editor-desktop": { w: 2880, h: 2000 },
} as const;

export type ShotKey = keyof typeof SHOTS;

export const shotSrc = (locale: Locale, key: ShotKey) => staticFile(`assets/${locale}/${key}.png`);
export const markSrc = () => staticFile("assets/brand/mark.png");

/** Every (locale, key) pair the video can reference; used by validate.ts. */
export const shotPath = (locale: Locale, key: ShotKey) => `assets/${locale}/${key}.png`;

/** Intrinsic size of a capture for a given locale (FR maintenance email is taller). */
export const sizeOf = (locale: Locale, key: ShotKey) =>
  locale === "fr" && key === "19-maintenance-reminder-email" ? { w: 1520, h: 2002 } : SHOTS[key];
