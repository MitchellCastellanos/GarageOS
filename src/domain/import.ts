// Importación de datos (Block 2) — lógica pura y testeable: parseo CSV, detección de
// columnas, normalización/validación por fila y planificación (crear / actualizar /
// omitir duplicado). Sin base de datos: src/lib/import-service.ts la alimenta con los
// registros existentes del taller y ejecuta el plan.

export type ImportEntity = "customers" | "vehicles" | "inventory";
export const IMPORT_ENTITIES: ImportEntity[] = ["customers", "vehicles", "inventory"];

export type DuplicateStrategy = "skip" | "update";

export interface ImportOptions {
  duplicates: DuplicateStrategy;
  /** vehicles: crear el cliente si la fila trae nombre y no existe. */
  createMissingCustomers: boolean;
  /** Idioma por defecto de los clientes nuevos (default del taller). */
  defaultLanguage: "EN" | "FR";
}

export const IMPORT_LIMITS = {
  maxFileBytes: 4 * 1024 * 1024,
  /** Filas por archivo: Core (import básico) vs Pro/Complete (import completo). */
  basicMaxRows: 500,
  fullMaxRows: 10_000,
} as const;

export interface FieldDef {
  key: string;
  required?: boolean;
  /** Encabezados reconocidos (normalizados: minúsculas, sin acentos ni símbolos). */
  synonyms: string[];
}

const CUSTOMER_FIELDS: FieldDef[] = [
  { key: "firstName", required: true, synonyms: ["first name", "firstname", "given name", "prenom", "nom client prenom"] },
  { key: "lastName", synonyms: ["last name", "lastname", "surname", "family name", "nom de famille", "nom famille"] },
  {
    key: "fullName",
    synonyms: ["name", "full name", "fullname", "customer", "customer name", "client", "client name", "nom", "nom complet", "nom du client"],
  },
  { key: "email", synonyms: ["email", "e-mail", "e mail", "email address", "courriel", "adresse courriel", "customer email"] },
  {
    key: "phone",
    synonyms: ["phone", "phone number", "mobile", "cell", "cellphone", "telephone", "tel", "cellulaire", "numero de telephone", "customer phone"],
  },
  { key: "address", synonyms: ["address", "street address", "adresse"] },
  { key: "notes", synonyms: ["notes", "note", "comments", "comment", "remarques", "commentaires"] },
  { key: "language", synonyms: ["language", "lang", "langue", "preferred language"] },
];

const VEHICLE_FIELDS: FieldDef[] = [
  { key: "licensePlate", required: true, synonyms: ["plate", "license plate", "licence plate", "licenseplate", "plaque", "immatriculation", "plaque d immatriculation", "reg", "registration"] },
  { key: "make", required: true, synonyms: ["make", "brand", "manufacturer", "marque", "vehicle make"] },
  { key: "model", required: true, synonyms: ["model", "modele", "vehicle model"] },
  { key: "year", required: true, synonyms: ["year", "annee", "model year", "vehicle year"] },
  { key: "vin", synonyms: ["vin", "niv", "vin number", "vehicle identification number", "serial"] },
  { key: "color", synonyms: ["color", "colour", "couleur"] },
  { key: "mileageUnit", synonyms: ["mileage unit", "odometer unit", "unit", "unite", "distance unit"] },
];

const INVENTORY_FIELDS: FieldDef[] = [
  { key: "name", required: true, synonyms: ["name", "part name", "part", "item", "item name", "description", "nom", "nom de la piece", "piece", "article", "product"] },
  { key: "sku", synonyms: ["sku", "part number", "part no", "part #", "item number", "code", "numero de piece", "no de piece", "reference", "ref"] },
  { key: "description", synonyms: ["details", "long description", "notes", "description longue"] },
  { key: "unitCost", synonyms: ["cost", "unit cost", "cout", "cout unitaire", "prix coutant", "purchase price", "buy price"] },
  { key: "unitPrice", required: true, synonyms: ["price", "unit price", "sell price", "selling price", "retail", "prix", "prix unitaire", "prix de vente"] },
  { key: "quantityOnHand", synonyms: ["quantity", "qty", "on hand", "stock", "quantity on hand", "qty on hand", "quantite", "quantite en stock", "inventaire"] },
  { key: "reorderThreshold", synonyms: ["reorder", "reorder point", "reorder level", "min", "minimum", "min qty", "seuil", "seuil de recommande", "low stock"] },
];

/** vehicles: campos del vehículo + los del cliente que sirven para ubicar/crear al dueño. */
const VEHICLE_OWNER_KEYS = ["firstName", "lastName", "fullName", "email", "phone"];
const VEHICLE_OWNER_FIELDS: FieldDef[] = CUSTOMER_FIELDS.filter((f) => VEHICLE_OWNER_KEYS.includes(f.key)).map((f) => ({
  ...f,
  required: false,
  // "name"/"nom" en un archivo de vehículos casi siempre es el cliente; "model" no choca.
  synonyms: f.synonyms,
}));

export function fieldsFor(entity: ImportEntity): FieldDef[] {
  if (entity === "customers") return CUSTOMER_FIELDS;
  if (entity === "inventory") return INVENTORY_FIELDS;
  return [...VEHICLE_FIELDS, ...VEHICLE_OWNER_FIELDS];
}

// ── CSV ─────────────────────────────────────────────────────

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const c of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === c && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

/** Parser CSV RFC 4180 (comillas, comillas escapadas, saltos de línea dentro de campo, BOM). */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function csvEscape(value: string): string {
  return /[",\r\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

// ── Mapeo de columnas ───────────────────────────────────────

export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9# ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** field key → índice de columna (o null si no se asigna). */
export type ColumnMapping = Record<string, number | null>;

export function autoMapColumns(entity: ImportEntity, headers: string[]): ColumnMapping {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  const fields = fieldsFor(entity);

  // Coincidencia exacta con la clave del campo o un sinónimo; un encabezado no se usa dos veces.
  for (const field of fields) {
    let idx = -1;
    for (let i = 0; i < norm.length; i++) {
      if (used.has(i)) continue;
      const h = norm[i];
      if (h === normalizeHeader(field.key) || field.synonyms.includes(h)) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) used.add(idx);
    mapping[field.key] = idx >= 0 ? idx : null;
  }
  // "name" es ambiguo en vehículos/clientes: si ya hay first name, no es fullName.
  if (entity !== "inventory" && mapping.firstName != null && mapping.fullName != null) {
    mapping.fullName = null;
  }
  return mapping;
}

export function missingRequiredFields(entity: ImportEntity, mapping: ColumnMapping): string[] {
  const missing: string[] = [];
  const has = (k: string) => mapping[k] != null;
  for (const f of fieldsFor(entity)) {
    if (!f.required) continue;
    if (entity !== "inventory" && f.key === "firstName") {
      if (!has("firstName") && !has("fullName")) missing.push("firstName");
      continue;
    }
    if (!has(f.key)) missing.push(f.key);
  }
  if (entity === "vehicles" && !has("firstName") && !has("fullName") && !has("email") && !has("phone")) {
    missing.push("customer");
  }
  return missing;
}

// ── Normalización de valores ────────────────────────────────

export function cleanText(v: string | undefined | null): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v);
}

export function phoneDigits(v: string): string {
  return v.replace(/\D/g, "");
}

/** Clave de comparación de teléfonos: últimos 10 dígitos (ignora el +1). */
export function phoneKey(v: string): string {
  const d = phoneDigits(v);
  return d.length >= 10 ? d.slice(-10) : d;
}

/** Guarda el teléfono como lo escribió el taller pero con formato consistente si es norteamericano. */
export function formatPhone(v: string): string {
  const d = phoneDigits(v);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return v.trim();
}

export function parseNumber(raw: string): number | null {
  let s = raw.replace(/[^\d.,\-]/g, "");
  if (s === "" || s === "-") return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // El último separador es el decimal.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // "12,50" → decimal; "1,250" → miles.
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizePlate(v: string): string {
  return v.replace(/[\s\-.]/g, "").toUpperCase();
}

export function splitFullName(full: string): { firstName: string; lastName: string } {
  const clean = cleanText(full);
  if (clean.includes(",")) {
    // "Tremblay, Marie"
    const [last, first] = clean.split(",", 2).map((s) => s.trim());
    if (first) return { firstName: first, lastName: last };
  }
  const idx = clean.indexOf(" ");
  if (idx < 0) return { firstName: clean, lastName: "" };
  return { firstName: clean.slice(0, idx), lastName: clean.slice(idx + 1) };
}

// ── Filas normalizadas ──────────────────────────────────────

export type RowErrorCode =
  | "FIRST_NAME_REQUIRED"
  | "INVALID_EMAIL"
  | "INVALID_PHONE"
  | "PLATE_REQUIRED"
  | "MAKE_REQUIRED"
  | "MODEL_REQUIRED"
  | "YEAR_INVALID"
  | "VIN_INVALID"
  | "CUSTOMER_MISSING"
  | "CUSTOMER_NOT_FOUND"
  | "NAME_REQUIRED"
  | "PRICE_INVALID"
  | "COST_INVALID"
  | "QUANTITY_INVALID"
  | "THRESHOLD_INVALID"
  | "FIELD_TOO_LONG";

export interface RowError {
  code: RowErrorCode;
  field?: string;
}

export interface CustomerData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  language: "EN" | "FR" | null;
}

export interface VehicleData {
  licensePlate: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  color: string;
  mileageUnit: "KM" | "MILES" | null;
}

export interface InventoryData {
  name: string;
  sku: string;
  description: string;
  unitCost: number | null;
  unitPrice: number;
  quantityOnHand: number;
  reorderThreshold: number;
}

export type Result<T> = { ok: true; data: T } | { ok: false; errors: RowError[] };

function cell(row: string[], mapping: ColumnMapping, key: string): string {
  const idx = mapping[key];
  if (idx == null) return "";
  return cleanText(row[idx]);
}

const MAX = { name: 100, email: 254, phone: 30, address: 255, notes: 1000, plate: 20, make: 50, model: 50, color: 30, vin: 17, sku: 64, invName: 255 };

function customerFrom(row: string[], mapping: ColumnMapping): { data: CustomerData; errors: RowError[] } {
  const errors: RowError[] = [];
  let firstName = cell(row, mapping, "firstName");
  let lastName = cell(row, mapping, "lastName");
  const fullName = cell(row, mapping, "fullName");
  if (!firstName && fullName) {
    const split = splitFullName(fullName);
    firstName = split.firstName;
    lastName = lastName || split.lastName;
  }
  const emailRaw = cell(row, mapping, "email");
  const email = emailRaw ? normalizeEmail(emailRaw) : "";
  if (email && !isValidEmail(email)) errors.push({ code: "INVALID_EMAIL", field: "email" });
  const phoneRaw = cell(row, mapping, "phone");
  if (phoneRaw && phoneDigits(phoneRaw).length < 7) errors.push({ code: "INVALID_PHONE", field: "phone" });
  const langRaw = cell(row, mapping, "language").toLowerCase();
  const language = /^(fr|french|francais|français)/.test(langRaw) ? "FR" : /^(en|english|anglais)/.test(langRaw) ? "EN" : null;
  const address = cell(row, mapping, "address");
  const notes = cell(row, mapping, "notes");
  if (
    firstName.length > MAX.name ||
    lastName.length > MAX.name ||
    email.length > MAX.email ||
    address.length > MAX.address ||
    notes.length > MAX.notes
  ) {
    errors.push({ code: "FIELD_TOO_LONG" });
  }
  return {
    data: { firstName, lastName, email, phone: phoneRaw ? formatPhone(phoneRaw) : "", address, notes, language },
    errors,
  };
}

export function normalizeCustomerRow(row: string[], mapping: ColumnMapping): Result<CustomerData> {
  const { data, errors } = customerFrom(row, mapping);
  if (!data.firstName) errors.unshift({ code: "FIRST_NAME_REQUIRED", field: "firstName" });
  return errors.length ? { ok: false, errors } : { ok: true, data };
}

export interface VehicleRowData {
  vehicle: VehicleData;
  owner: CustomerData;
}

export function normalizeVehicleRow(row: string[], mapping: ColumnMapping): Result<VehicleRowData> {
  const errors: RowError[] = [];
  const { data: owner, errors: ownerErrors } = customerFrom(row, mapping);
  errors.push(...ownerErrors);
  if (!owner.firstName && !owner.email && !owner.phone) errors.push({ code: "CUSTOMER_MISSING" });

  const licensePlate = cell(row, mapping, "licensePlate");
  const make = cell(row, mapping, "make");
  const model = cell(row, mapping, "model");
  const vin = cell(row, mapping, "vin").replace(/\s/g, "").toUpperCase();
  const color = cell(row, mapping, "color");
  if (!licensePlate) errors.push({ code: "PLATE_REQUIRED", field: "licensePlate" });
  if (!make) errors.push({ code: "MAKE_REQUIRED", field: "make" });
  if (!model) errors.push({ code: "MODEL_REQUIRED", field: "model" });
  const yearRaw = cell(row, mapping, "year");
  const yearNum = yearRaw ? parseNumber(yearRaw) : null;
  const maxYear = new Date().getFullYear() + 1;
  if (yearNum == null || !Number.isInteger(yearNum) || yearNum < 1900 || yearNum > maxYear) {
    errors.push({ code: "YEAR_INVALID", field: "year" });
  }
  if (vin && !/^[A-HJ-NPR-Z0-9]{5,17}$/.test(vin)) errors.push({ code: "VIN_INVALID", field: "vin" });
  if (
    licensePlate.length > MAX.plate ||
    make.length > MAX.make ||
    model.length > MAX.model ||
    color.length > MAX.color
  ) {
    errors.push({ code: "FIELD_TOO_LONG" });
  }
  const unitRaw = cell(row, mapping, "mileageUnit").toLowerCase();
  const mileageUnit = /^(mi|mile)/.test(unitRaw) ? "MILES" : /^(km|kilo)/.test(unitRaw) ? "KM" : null;

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      owner,
      vehicle: { licensePlate, make, model, year: yearNum as number, vin, color, mileageUnit },
    },
  };
}

export function normalizeInventoryRow(row: string[], mapping: ColumnMapping): Result<InventoryData> {
  const errors: RowError[] = [];
  const name = cell(row, mapping, "name");
  if (!name) errors.push({ code: "NAME_REQUIRED", field: "name" });
  const sku = cell(row, mapping, "sku");
  if (name.length > MAX.invName || sku.length > MAX.sku) errors.push({ code: "FIELD_TOO_LONG" });

  const priceRaw = cell(row, mapping, "unitPrice");
  const unitPrice = priceRaw ? parseNumber(priceRaw) : null;
  if (unitPrice == null || unitPrice < 0) errors.push({ code: "PRICE_INVALID", field: "unitPrice" });
  const costRaw = cell(row, mapping, "unitCost");
  const unitCost = costRaw ? parseNumber(costRaw) : null;
  if (costRaw && (unitCost == null || unitCost < 0)) errors.push({ code: "COST_INVALID", field: "unitCost" });

  const qtyRaw = cell(row, mapping, "quantityOnHand");
  const qty = qtyRaw ? parseNumber(qtyRaw) : 0;
  if (qty == null || !Number.isInteger(qty) || qty < 0) errors.push({ code: "QUANTITY_INVALID", field: "quantityOnHand" });
  const thrRaw = cell(row, mapping, "reorderThreshold");
  const thr = thrRaw ? parseNumber(thrRaw) : 0;
  if (thr == null || !Number.isInteger(thr) || thr < 0) errors.push({ code: "THRESHOLD_INVALID", field: "reorderThreshold" });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      sku,
      description: cell(row, mapping, "description"),
      unitCost: unitCost ?? null,
      unitPrice: unitPrice as number,
      quantityOnHand: qty as number,
      reorderThreshold: thr as number,
    },
  };
}

// ── Detección de duplicados ─────────────────────────────────

export interface ExistingClient {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

function nameKey(c: { firstName: string; lastName?: string | null }): string {
  return `${normalizeHeader(c.firstName)}|${normalizeHeader(c.lastName ?? "")}`;
}

/**
 * Ubica clientes por email → teléfono → nombre completo (solo si la fila no trae ni email ni
 * teléfono, para no fusionar homónimos que sí se pueden distinguir). Incluye los clientes
 * que la propia importación va creando (ids temporales) para detectar duplicados dentro del archivo.
 */
export class ClientMatcher {
  private byEmail = new Map<string, string>();
  private byPhone = new Map<string, string>();
  private byName = new Map<string, string>();

  constructor(existing: ExistingClient[] = []) {
    for (const c of existing) this.add(c, c.id);
  }

  add(c: { firstName: string; lastName?: string | null; email?: string | null; phone?: string | null }, id: string) {
    if (c.email && !this.byEmail.has(normalizeEmail(c.email))) this.byEmail.set(normalizeEmail(c.email), id);
    if (c.phone && phoneKey(c.phone).length >= 7 && !this.byPhone.has(phoneKey(c.phone))) {
      this.byPhone.set(phoneKey(c.phone), id);
    }
    if (c.firstName && !this.byName.has(nameKey(c))) this.byName.set(nameKey(c), id);
  }

  find(c: { firstName: string; lastName?: string | null; email?: string | null; phone?: string | null }): string | null {
    if (c.email) {
      const hit = this.byEmail.get(normalizeEmail(c.email));
      if (hit) return hit;
    }
    if (c.phone && phoneKey(c.phone).length >= 7) {
      const hit = this.byPhone.get(phoneKey(c.phone));
      if (hit) return hit;
    }
    if (!c.email && !c.phone && c.firstName) return this.byName.get(nameKey(c)) ?? null;
    return null;
  }
}

export interface ExistingVehicle {
  id: string;
  clientId: string;
  licensePlate: string;
  vin: string | null;
}

export function vehicleKeys(clientId: string, v: { licensePlate: string; vin?: string | null }): string[] {
  const keys = [`${clientId}|plate|${normalizePlate(v.licensePlate)}`];
  if (v.vin) keys.push(`vin|${v.vin.toUpperCase()}`);
  return keys;
}

// ── Plan de importación ─────────────────────────────────────

export type RowAction = "create" | "update" | "skip_duplicate" | "error";

export interface PlannedRow<T> {
  /** Número de fila del archivo (1 = encabezado, los datos empiezan en 2). */
  rowNumber: number;
  action: RowAction;
  errors: RowError[];
  data?: T;
  /** update / skip_duplicate: id del registro existente al que corresponde. */
  matchId?: string;
  /** skip_duplicate: el duplicado es otra fila del mismo archivo. */
  duplicateInFile?: boolean;
  /** vehicles: crear el cliente dueño. */
  createOwner?: boolean;
  /** vehicles: id (real o temporal `new:<n>`) del dueño. */
  ownerId?: string;
}

export interface PlanSummary {
  total: number;
  create: number;
  update: number;
  skipped: number;
  errors: number;
  /** vehicles: clientes nuevos que se crearán junto con los vehículos. */
  customersCreated: number;
}

export function summarize(rows: PlannedRow<unknown>[]): PlanSummary {
  const s: PlanSummary = { total: rows.length, create: 0, update: 0, skipped: 0, errors: 0, customersCreated: 0 };
  const newOwners = new Set<string>();
  for (const r of rows) {
    if (r.action === "create") s.create++;
    else if (r.action === "update") s.update++;
    else if (r.action === "skip_duplicate") s.skipped++;
    else s.errors++;
    if (r.createOwner && r.ownerId && r.action !== "error") newOwners.add(r.ownerId);
  }
  s.customersCreated = newOwners.size;
  return s;
}

export function planCustomers(
  rows: string[][],
  mapping: ColumnMapping,
  existing: ExistingClient[],
  options: ImportOptions
): PlannedRow<CustomerData>[] {
  const matcher = new ClientMatcher(existing);
  const existingIds = new Set(existing.map((c) => c.id));
  const planned: PlannedRow<CustomerData>[] = [];
  let seq = 0;

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const res = normalizeCustomerRow(row, mapping);
    if (!res.ok) return void planned.push({ rowNumber, action: "error", errors: res.errors });
    const matchId = matcher.find(res.data);
    if (matchId) {
      const inFile = !existingIds.has(matchId);
      // Duplicado de un registro existente + estrategia "update" → actualizar; una segunda fila del archivo nunca actualiza.
      if (options.duplicates === "update" && !inFile) {
        planned.push({ rowNumber, action: "update", errors: [], data: res.data, matchId });
      } else {
        planned.push({ rowNumber, action: "skip_duplicate", errors: [], data: res.data, matchId, duplicateInFile: inFile });
      }
      return;
    }
    matcher.add(res.data, `new:${++seq}`);
    planned.push({ rowNumber, action: "create", errors: [], data: res.data });
  });
  return planned;
}

export function planVehicles(
  rows: string[][],
  mapping: ColumnMapping,
  existingClients: ExistingClient[],
  existingVehicles: ExistingVehicle[],
  options: ImportOptions
): PlannedRow<VehicleRowData>[] {
  const matcher = new ClientMatcher(existingClients);
  const vehicleIndex = new Map<string, string>();
  for (const v of existingVehicles) {
    for (const k of vehicleKeys(v.clientId, v)) if (!vehicleIndex.has(k)) vehicleIndex.set(k, v.id);
  }
  const existingVehicleIds = new Set(existingVehicles.map((v) => v.id));
  const planned: PlannedRow<VehicleRowData>[] = [];
  let seq = 0;

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const res = normalizeVehicleRow(row, mapping);
    if (!res.ok) return void planned.push({ rowNumber, action: "error", errors: res.errors });
    const { owner, vehicle } = res.data;

    let ownerId = matcher.find(owner);
    let createOwner = false;
    if (!ownerId) {
      if (options.createMissingCustomers && owner.firstName) {
        ownerId = `new:${++seq}`;
        matcher.add(owner, ownerId);
        createOwner = true;
      } else {
        return void planned.push({ rowNumber, action: "error", errors: [{ code: "CUSTOMER_NOT_FOUND" }] });
      }
    }
    // Un dueño creado por una fila anterior (id temporal) no se crea otra vez: createOwner solo es true en la primera.

    const keys = vehicleKeys(ownerId, vehicle);
    const dupId = keys.map((k) => vehicleIndex.get(k)).find(Boolean);
    if (dupId) {
      const inFile = !existingVehicleIds.has(dupId);
      if (options.duplicates === "update" && !inFile) {
        planned.push({ rowNumber, action: "update", errors: [], data: res.data, matchId: dupId, ownerId });
      } else {
        planned.push({ rowNumber, action: "skip_duplicate", errors: [], data: res.data, matchId: dupId, duplicateInFile: inFile, ownerId });
      }
      return;
    }
    for (const k of keys) vehicleIndex.set(k, `file:${rowNumber}`);
    planned.push({
      rowNumber,
      action: "create",
      errors: [],
      data: res.data,
      ownerId,
      createOwner,
    });
  });
  return planned;
}

export interface ExistingPart {
  id: string;
  sku: string | null;
  name: string;
}

export function planInventory(
  rows: string[][],
  mapping: ColumnMapping,
  existing: ExistingPart[],
  options: ImportOptions
): PlannedRow<InventoryData>[] {
  const bySku = new Map<string, string>();
  const byName = new Map<string, string>();
  const existingIds = new Set(existing.map((p) => p.id));
  for (const p of existing) {
    if (p.sku) bySku.set(p.sku.toLowerCase(), p.id);
    else byName.set(normalizeHeader(p.name), p.id);
  }
  const planned: PlannedRow<InventoryData>[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const res = normalizeInventoryRow(row, mapping);
    if (!res.ok) return void planned.push({ rowNumber, action: "error", errors: res.errors });
    const d = res.data;
    // Con SKU se compara por SKU (único por taller); sin SKU, por nombre.
    const dupId = d.sku ? bySku.get(d.sku.toLowerCase()) : byName.get(normalizeHeader(d.name));
    if (dupId) {
      const inFile = !existingIds.has(dupId);
      if (options.duplicates === "update" && !inFile) {
        planned.push({ rowNumber, action: "update", errors: [], data: d, matchId: dupId });
      } else {
        planned.push({ rowNumber, action: "skip_duplicate", errors: [], data: d, matchId: dupId, duplicateInFile: inFile });
      }
      return;
    }
    if (d.sku) bySku.set(d.sku.toLowerCase(), `file:${rowNumber}`);
    else byName.set(normalizeHeader(d.name), `file:${rowNumber}`);
    planned.push({ rowNumber, action: "create", errors: [], data: d });
  });
  return planned;
}
