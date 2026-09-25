import type { AdminLocale } from "@/lib/admin-locale";

export interface TaxPresetLine {
  name: string;
  rate: string;
}

export interface TaxPreset {
  code: string;
  label: Record<AdminLocale, string>;
  lines: TaxPresetLine[];
}

/**
 * Referencia de impuestos por provincia/territorio canadiense — punto de
 * partida editable, no fuente de verdad permanente. Las tasas pueden cambiar
 * (ej. Nueva Escocia bajó su HST de 15% a 14% en abril 2025); el taller debe
 * confirmarlas con su contador(a) antes de guardar.
 */
export const CANADA_TAX_PRESETS: TaxPreset[] = [
  {
    code: "CA-AB",
    label: { es: "Alberta — GST 5%", en: "Alberta — GST 5%", fr: "Alberta — TPS 5 %" },
    lines: [{ name: "GST", rate: "0.05" }],
  },
  {
    code: "CA-BC",
    label: {
      es: "Columbia Británica — GST 5% + PST 7%",
      en: "British Columbia — GST 5% + PST 7%",
      fr: "Colombie-Britannique — TPS 5 % + PST 7 %",
    },
    lines: [
      { name: "GST", rate: "0.05" },
      { name: "PST", rate: "0.07" },
    ],
  },
  {
    code: "CA-MB",
    label: {
      es: "Manitoba — GST 5% + RST 7%",
      en: "Manitoba — GST 5% + RST 7%",
      fr: "Manitoba — TPS 5 % + RST 7 %",
    },
    lines: [
      { name: "GST", rate: "0.05" },
      { name: "RST", rate: "0.07" },
    ],
  },
  {
    code: "CA-NB",
    label: { es: "Nuevo Brunswick — HST 15%", en: "New Brunswick — HST 15%", fr: "Nouveau-Brunswick — TVH 15 %" },
    lines: [{ name: "HST", rate: "0.15" }],
  },
  {
    code: "CA-NL",
    label: {
      es: "Terranova y Labrador — HST 15%",
      en: "Newfoundland and Labrador — HST 15%",
      fr: "Terre-Neuve-et-Labrador — TVH 15 %",
    },
    lines: [{ name: "HST", rate: "0.15" }],
  },
  {
    code: "CA-NS",
    label: { es: "Nueva Escocia — HST 14%", en: "Nova Scotia — HST 14%", fr: "Nouvelle-Écosse — TVH 14 %" },
    lines: [{ name: "HST", rate: "0.14" }],
  },
  {
    code: "CA-NT",
    label: {
      es: "Territorios del Noroeste — GST 5%",
      en: "Northwest Territories — GST 5%",
      fr: "Territoires du Nord-Ouest — TPS 5 %",
    },
    lines: [{ name: "GST", rate: "0.05" }],
  },
  {
    code: "CA-NU",
    label: { es: "Nunavut — GST 5%", en: "Nunavut — GST 5%", fr: "Nunavut — TPS 5 %" },
    lines: [{ name: "GST", rate: "0.05" }],
  },
  {
    code: "CA-ON",
    label: { es: "Ontario — HST 13%", en: "Ontario — HST 13%", fr: "Ontario — TVH 13 %" },
    lines: [{ name: "HST", rate: "0.13" }],
  },
  {
    code: "CA-PE",
    label: {
      es: "Isla del Príncipe Eduardo — HST 15%",
      en: "Prince Edward Island — HST 15%",
      fr: "Île-du-Prince-Édouard — TVH 15 %",
    },
    lines: [{ name: "HST", rate: "0.15" }],
  },
  {
    code: "CA-QC",
    label: {
      es: "Quebec — GST 5% + QST 9.975%",
      en: "Quebec — GST 5% + QST 9.975%",
      fr: "Québec — TPS 5 % + TVQ 9,975 %",
    },
    lines: [
      { name: "GST", rate: "0.05" },
      { name: "QST", rate: "0.09975" },
    ],
  },
  {
    code: "CA-SK",
    label: {
      es: "Saskatchewan — GST 5% + PST 6%",
      en: "Saskatchewan — GST 5% + PST 6%",
      fr: "Saskatchewan — TPS 5 % + PST 6 %",
    },
    lines: [
      { name: "GST", rate: "0.05" },
      { name: "PST", rate: "0.06" },
    ],
  },
  {
    code: "CA-YT",
    label: { es: "Yukón — GST 5%", en: "Yukon — GST 5%", fr: "Yukon — TPS 5 %" },
    lines: [{ name: "GST", rate: "0.05" }],
  },
];
