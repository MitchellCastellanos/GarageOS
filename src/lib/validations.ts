import { z } from "zod";

export const clientSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().min(7, "Phone number is required").max(30),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  language: z.enum(["EN", "FR"]),
  address: z.string().max(255).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});
export type ClientFormData = z.infer<typeof clientSchema>;

export const vehicleSchema = z.object({
  make: z.string().min(1, "Make is required").max(50),
  model: z.string().min(1, "Model is required").max(50),
  year: z
    .number()
    .int()
    .min(1900, "Invalid year")
    .max(new Date().getFullYear() + 1, "Invalid year"),
  licensePlate: z.string().min(1, "License plate is required").max(20),
  vin: z.string().max(17).optional().or(z.literal("")),
  color: z.string().max(30).optional().or(z.literal("")),
  mileageUnit: z.enum(["KM", "MILES"]),
});
export type VehicleFormData = z.infer<typeof vehicleSchema>;

export const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required").max(255),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unitPrice: z.number().min(0, "Price cannot be negative"),
  itemType: z.enum(["LABOUR", "PART", "OTHER"]),
  warrantyTerm: z.string().max(100).optional().or(z.literal("")),
});

export type LineItemData = z.infer<typeof lineItemSchema>;

export const invoiceVehicleSchema = z.object({
  vehicleId: z.string().min(1, "Select a vehicle"),
  mileageIn: z.number().int().min(0).optional().nullable(),
  mileageOut: z.number().int().min(0).optional().nullable(),
  lineItems: z
    .array(lineItemSchema)
    .min(1, "Add at least one service line"),
});

export type InvoiceVehicleData = z.infer<typeof invoiceVehicleSchema>;

export const invoiceSchema = z.object({
  clientId: z.string().min(1, "Select a client"),
  vehicles: z
    .array(invoiceVehicleSchema)
    .min(1, "Add at least one vehicle"),
  taxRate: z.number().min(0).max(1),
  language: z.enum(["EN", "FR"]).default("EN"),
  notes: z.string().max(1000).optional().or(z.literal("")),
  dueAt: z.string().optional().or(z.literal("")),
});

export type InvoiceFormData = z.infer<typeof invoiceSchema>;

export const quoteSchema = invoiceSchema;
export type QuoteFormData = z.infer<typeof quoteSchema>;

export const appointmentSchema = z.object({
  clientId: z.string().min(1, "Select a client"),
  vehicleId: z.string().optional().or(z.literal("")),
  mechanicId: z.string().optional().or(z.literal("")),
  title: z.string().min(1, "Title is required").max(200),
  date: z.string().min(1, "Date is required"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time (HH:mm)"),
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

export const publicBookingSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().min(7, "Phone number is required").max(30),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  language: z.enum(["EN", "FR"]).default("EN"),
  make: z.string().min(1, "Make is required").max(50),
  model: z.string().min(1, "Model is required").max(50),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1),
  licensePlate: z.string().max(20).optional().or(z.literal("")),
  title: z.string().min(1, "Describe the requested service").max(200),
  serviceValue: z.string().max(50).optional().or(z.literal("")),
  date: z.string().min(1),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  mechanicId: z.string().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type PublicBookingFormData = z.infer<typeof publicBookingSchema>;

export const workOrderSchema = z.object({
  clientId: z.string().min(1, "Select a client"),
  vehicleId: z.string().min(1, "Select a vehicle"),
  mechanicId: z.string().optional().or(z.literal("")),
  concern: z.string().min(1, "Describe the customer concern").max(1000),
  diagnosis: z.string().max(2000).optional().or(z.literal("")),
  mileageIn: z.number().int().min(0).optional().nullable(),
  mileageOut: z.number().int().min(0).optional().nullable(),
  lineItems: z.array(lineItemSchema).default([]),
});

export type WorkOrderFormData = z.infer<typeof workOrderSchema>;

export const newInspectionSchema = z.object({
  clientId: z.string().min(1, "Select a client"),
  vehicleId: z.string().min(1, "Select a vehicle"),
  workOrderId: z.string().optional().or(z.literal("")),
  mechanicId: z.string().optional().or(z.literal("")),
  mileage: z.number().int().min(0).optional().nullable(),
});

export type NewInspectionFormData = z.infer<typeof newInspectionSchema>;

export const inspectionItemUpdateSchema = z.object({
  condition: z.enum(["GOOD", "ATTENTION", "SERVICE_REQUIRED"]),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type InspectionItemUpdateData = z.infer<typeof inspectionItemUpdateSchema>;

export const reminderSchema = z.object({
  vehicleId: z.string().min(1, "Select a vehicle"),
  serviceType: z.string().min(1, "Service type is required").max(100),
  dueDate: z.string().optional().or(z.literal("")),
  dueMileage: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type ReminderFormData = z.infer<typeof reminderSchema>;

export const DOC_CATEGORIES = [
  { value: "INVOICES", label: "Invoices" },
  { value: "RECEIPTS", label: "Receipts" },
  { value: "PAYROLL", label: "Payroll" },
  { value: "TAX_DOCUMENTS", label: "Tax documents" },
  { value: "BANK_STATEMENTS", label: "Bank statements" },
  { value: "OTHER", label: "Other" },
] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number]["value"];

export const cashDrawerEntrySchema = z.object({
  type: z.enum([
    "OPENING_BALANCE",
    "CASH_IN",
    "CASH_OUT",
    "ADJUSTMENT",
    "CLOSING_BALANCE",
  ]),
  amount: z.number().refine((n) => n !== 0, "Amount cannot be zero"),
  description: z.string().max(500).optional().or(z.literal("")),
  occurredAt: z.string().min(1, "Date is required"),
  linkedInvoiceId: z.string().optional().or(z.literal("")),
});

export type CashDrawerEntryFormData = z.infer<typeof cashDrawerEntrySchema>;

export const inventoryPartSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  sku: z.string().max(60).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  unitCost: z.number().min(0).optional().nullable(),
  unitPrice: z.number().min(0, "Price cannot be negative"),
  quantityOnHand: z.number().int().min(0).optional(),
  reorderThreshold: z.number().int().min(0).optional(),
});

export type InventoryPartFormData = z.infer<typeof inventoryPartSchema>;

export const inventoryMovementSchema = z.object({
  type: z.enum(["RECEIVE", "ADJUSTMENT", "CONSUMED", "RETURN"]),
  quantity: z.number().int().refine((n) => n !== 0, "Quantity cannot be zero"),
  note: z.string().max(300).optional().or(z.literal("")),
});

export type InventoryMovementFormData = z.infer<typeof inventoryMovementSchema>;

export const shopLocationSchema = z.object({
  name: z.string().min(1, "Location name is required").max(120),
});

export type ShopLocationFormData = z.infer<typeof shopLocationSchema>;
