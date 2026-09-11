// Schemas de validación Zod — importables desde Client y Server Components
// SIN "use server" para poder exportar objetos y tipos

import { z } from "zod";

export const clientSchema = z.object({
  firstName: z.string().min(1, "El nombre es requerido").max(100),
  lastName: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().min(7, "Teléfono requerido").max(30),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  language: z.enum(["ES", "EN", "FR"]),
  address: z.string().max(255).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});
export type ClientFormData = z.infer<typeof clientSchema>;

export const vehicleSchema = z.object({
  make: z.string().min(1, "La marca es requerida").max(50),
  model: z.string().min(1, "El modelo es requerido").max(50),
  year: z
    .number()
    .int()
    .min(1900, "Año inválido")
    .max(new Date().getFullYear() + 1, "Año inválido"),
  licensePlate: z.string().min(1, "La placa es requerida").max(20),
  vin: z.string().max(17).optional().or(z.literal("")),
  color: z.string().max(30).optional().or(z.literal("")),
  mileageUnit: z.enum(["KM", "MILES"]),
});
export type VehicleFormData = z.infer<typeof vehicleSchema>;

// ── Factura ──────────────────────────────────────────────────

export const lineItemSchema = z.object({
  description: z.string().min(1, "La descripción es requerida").max(255),
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
  unitPrice: z.number().min(0, "El precio no puede ser negativo"),
  itemType: z.enum(["LABOUR", "PART", "OTHER"]),
  warrantyTerm: z.string().max(100).optional().or(z.literal("")),
});

export type LineItemData = z.infer<typeof lineItemSchema>;

// Un vehículo dentro de la factura/cotización: su propio kilometraje
// y sus propias líneas de servicio agrupadas.
export const invoiceVehicleSchema = z.object({
  vehicleId: z.string().min(1, "Selecciona un vehículo"),
  mileageIn: z.number().int().min(0).optional().nullable(),
  mileageOut: z.number().int().min(0).optional().nullable(),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "Agrega al menos una línea de servicio"),
});

export type InvoiceVehicleData = z.infer<typeof invoiceVehicleSchema>;

export const invoiceSchema = z.object({
  clientId: z.string().min(1, "Selecciona un cliente"),
  vehicles: z
    .array(invoiceVehicleSchema)
    .min(1, "Agrega al menos un vehículo"),
  taxRate: z.number().min(0).max(1), // 0.14975 = TPS+TVQ Quebec
  language: z.enum(["ES", "EN", "FR"]).default("ES"),
  notes: z.string().max(1000).optional().or(z.literal("")),
  dueAt: z.string().optional().or(z.literal("")), // ISO date string
});

export type InvoiceFormData = z.infer<typeof invoiceSchema>;

// ── Cotización (misma estructura que factura; dueAt → validUntil en DB) ──

export const quoteSchema = invoiceSchema;
export type QuoteFormData = z.infer<typeof quoteSchema>;

// ── Cita ─────────────────────────────────────────────────────

export const appointmentSchema = z.object({
  clientId: z.string().min(1, "Selecciona un cliente"),
  vehicleId: z.string().optional().or(z.literal("")),
  mechanicId: z.string().optional().or(z.literal("")),
  title: z.string().min(1, "El título es requerido").max(200),
  date: z.string().min(1, "La fecha es requerida"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida (HH:mm)"),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type AppointmentFormData = z.infer<typeof appointmentSchema>;

export const appointmentStatusSchema = z.enum([
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const appointmentEditSchema = appointmentSchema.extend({
  status: appointmentStatusSchema,
});

export type AppointmentEditFormData = z.infer<typeof appointmentEditSchema>;

// ── Reserva pública (website del cliente) ────────────────────

export const publicBookingSchema = z.object({
  firstName: z.string().min(1, "El nombre es requerido").max(100),
  lastName: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().min(7, "Teléfono requerido").max(30),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  language: z.enum(["ES", "EN", "FR"]).default("ES"),
  make: z.string().min(1, "Marca requerida").max(50),
  model: z.string().min(1, "Modelo requerido").max(50),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1),
  licensePlate: z.string().max(20).optional().or(z.literal("")),
  title: z.string().min(1, "Describe el servicio").max(200),
  /** Clave del catálogo de servicios (src/lib/service-catalog.ts) — determina la duración real de la cita. */
  serviceValue: z.string().max(50).optional().or(z.literal("")),
  date: z.string().min(1),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  mechanicId: z.string().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type PublicBookingFormData = z.infer<typeof publicBookingSchema>;

// ── Recordatorio de servicio ──────────────────────────────────

export const reminderSchema = z.object({
  vehicleId: z.string().min(1, "Selecciona un vehículo"),
  serviceType: z.string().min(1, "El tipo de servicio es requerido").max(100),
  dueDate: z.string().optional().or(z.literal("")), // ISO date string
  dueMileage: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type ReminderFormData = z.infer<typeof reminderSchema>;

// ── Documentos contables ──────────────────────────────────────

export const DOC_CATEGORIES = [
  { value: "INVOICES", label: "Facturas" },
  { value: "RECEIPTS", label: "Recibos" },
  { value: "PAYROLL", label: "Nómina" },
  { value: "TAX_DOCUMENTS", label: "Documentos Fiscales" },
  { value: "BANK_STATEMENTS", label: "Estados de Cuenta" },
  { value: "OTHER", label: "Otros" },
] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number]["value"];

// ── Caja (cash drawer) ────────────────────────────────────────

export const cashDrawerEntrySchema = z.object({
  type: z.enum([
    "OPENING_BALANCE",
    "CASH_IN",
    "CASH_OUT",
    "ADJUSTMENT",
    "CLOSING_BALANCE",
  ]),
  amount: z.number().refine((n) => n !== 0, "El monto no puede ser cero"),
  description: z.string().max(500).optional().or(z.literal("")),
  occurredAt: z.string().min(1, "La fecha es requerida"),
  linkedInvoiceId: z.string().optional().or(z.literal("")),
});

export type CashDrawerEntryFormData = z.infer<typeof cashDrawerEntrySchema>;
