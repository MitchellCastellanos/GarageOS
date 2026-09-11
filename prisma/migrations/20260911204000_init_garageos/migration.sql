-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "garageos";

-- CreateEnum
CREATE TYPE "garageos"."Role" AS ENUM ('SUPER_ADMIN', 'OWNER', 'MECHANIC', 'VIEWER');

-- CreateEnum
CREATE TYPE "garageos"."MileageUnit" AS ENUM ('KM', 'MILES');

-- CreateEnum
CREATE TYPE "garageos"."InvoicePaymentMode" AS ENUM ('CARD', 'CASH', 'MIXED');

-- CreateEnum
CREATE TYPE "garageos"."InvoicePaymentEntryMethod" AS ENUM ('CARD', 'CASH');

-- CreateEnum
CREATE TYPE "garageos"."InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "garageos"."InvoiceLanguage" AS ENUM ('ES', 'EN', 'FR');

-- CreateEnum
CREATE TYPE "garageos"."LineItemType" AS ENUM ('LABOUR', 'PART', 'OTHER');

-- CreateEnum
CREATE TYPE "garageos"."QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "garageos"."AppointmentSource" AS ENUM ('INTERNAL', 'PUBLIC_WEB');

-- CreateEnum
CREATE TYPE "garageos"."AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "garageos"."ReminderStatus" AS ENUM ('PENDING', 'SENT', 'ACKNOWLEDGED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "garageos"."DocCategory" AS ENUM ('INVOICES', 'RECEIPTS', 'PAYROLL', 'TAX_DOCUMENTS', 'BANK_STATEMENTS', 'OTHER');

-- CreateEnum
CREATE TYPE "garageos"."CashDrawerEntryType" AS ENUM ('OPENING_BALANCE', 'CASH_IN', 'CASH_OUT', 'ADJUSTMENT', 'CLOSING_BALANCE');

-- CreateEnum
CREATE TYPE "garageos"."ApprovalDecision" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "garageos"."WorkOrderStatus" AS ENUM ('OPEN', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CANCELLED');

-- CreateTable
CREATE TABLE "garageos"."Shop" (
    "defaultLanguage" "garageos"."InvoiceLanguage" NOT NULL DEFAULT 'FR',
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "billingEmail" TEXT,
    "infoEmail" TEXT,
    "providersEmail" TEXT,
    "newsletterEmail" TEXT,
    "taxId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "appointmentReminderHours" INTEGER NOT NULL DEFAULT 24,
    "appointmentEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "appointmentSmsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "slug" TEXT,
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'America/Montreal',
    "bookingSlotMinutes" INTEGER NOT NULL DEFAULT 60,
    "bookingLeadTimeHours" INTEGER NOT NULL DEFAULT 24,
    "bookingAdvanceDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."User" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "garageos"."Role" NOT NULL DEFAULT 'MECHANIC',
    "bookable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "garageos"."Client" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "language" "garageos"."InvoiceLanguage" NOT NULL DEFAULT 'FR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."Vehicle" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "vin" TEXT,
    "color" TEXT,
    "mileageUnit" "garageos"."MileageUnit" NOT NULL DEFAULT 'KM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."Invoice" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "garageos"."InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailSendCount" INTEGER NOT NULL DEFAULT 0,
    "smsSentAt" TIMESTAMP(3),
    "smsSendCount" INTEGER NOT NULL DEFAULT 0,
    "downloadToken" TEXT,
    "clientPackagePath" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "taxRate" DECIMAL(6,5) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "language" "garageos"."InvoiceLanguage" NOT NULL DEFAULT 'FR',
    "notes" TEXT,
    "pdfUrl" TEXT,
    "paymentMode" "garageos"."InvoicePaymentMode",
    "paymentExtraPaths" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."InvoiceVehicle" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "mileageIn" INTEGER,
    "mileageOut" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."InvoicePaymentEntry" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" "garageos"."InvoicePaymentEntryMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "receiptPath" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePaymentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceVehicleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "itemType" "garageos"."LineItemType" NOT NULL DEFAULT 'LABOUR',
    "warrantyTerm" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."SavedLineItem" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "itemType" "garageos"."LineItemType" NOT NULL DEFAULT 'LABOUR',
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."Quote" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "status" "garageos"."QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailSendCount" INTEGER NOT NULL DEFAULT 0,
    "convertedInvoiceId" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "taxRate" DECIMAL(6,5) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "language" "garageos"."InvoiceLanguage" NOT NULL DEFAULT 'FR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."QuoteVehicle" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "mileageIn" INTEGER,
    "mileageOut" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."QuoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteVehicleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "itemType" "garageos"."LineItemType" NOT NULL DEFAULT 'LABOUR',
    "warrantyTerm" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."Appointment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "mechanicId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "garageos"."AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "confirmationSentAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "cancellationSentAt" TIMESTAMP(3),
    "source" "garageos"."AppointmentSource" NOT NULL DEFAULT 'INTERNAL',
    "manageToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."ShopWorkingHours" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShopWorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."MechanicWorkingHours" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MechanicWorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."ShopBookingService" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelEs" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopBookingService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."ServiceReminder" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "dueMileage" INTEGER,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" "garageos"."ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."AccountingDocument" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "category" "garageos"."DocCategory" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "driveFileId" TEXT,
    "driveFolderId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "AccountingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CashDrawerEntry" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "garageos"."CashDrawerEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedInvoiceId" TEXT,
    "paymentMethod" "garageos"."InvoicePaymentEntryMethod",
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDrawerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."QuoteApproval" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "decision" "garageos"."ApprovalDecision" NOT NULL,
    "documentHash" TEXT NOT NULL,
    "documentSnapshot" JSONB NOT NULL,
    "actorName" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,

    CONSTRAINT "QuoteApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."WorkOrder" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "status" "garageos"."WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "concern" TEXT NOT NULL,
    "diagnosis" TEXT,
    "mileageIn" INTEGER,
    "mileageOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."WorkOrderLine" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "itemType" "garageos"."LineItemType" NOT NULL DEFAULT 'LABOUR',
    "warrantyTerm" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_slug_key" ON "garageos"."Shop"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "garageos"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "garageos"."Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "garageos"."Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "garageos"."VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "garageos"."VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_downloadToken_key" ON "garageos"."Invoice"("downloadToken");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shopId_invoiceNumber_key" ON "garageos"."Invoice"("shopId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SavedLineItem_shopId_description_key" ON "garageos"."SavedLineItem"("shopId", "description");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_convertedInvoiceId_key" ON "garageos"."Quote"("convertedInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_shopId_quoteNumber_key" ON "garageos"."Quote"("shopId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_manageToken_key" ON "garageos"."Appointment"("manageToken");

-- CreateIndex
CREATE UNIQUE INDEX "ShopWorkingHours_shopId_dayOfWeek_key" ON "garageos"."ShopWorkingHours"("shopId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "MechanicWorkingHours_userId_dayOfWeek_key" ON "garageos"."MechanicWorkingHours"("userId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "CashDrawerEntry_shopId_occurredAt_idx" ON "garageos"."CashDrawerEntry"("shopId", "occurredAt");

-- CreateIndex
CREATE INDEX "CashDrawerEntry_linkedInvoiceId_idx" ON "garageos"."CashDrawerEntry"("linkedInvoiceId");

-- CreateIndex
CREATE INDEX "QuoteApproval_quoteId_recordedAt_idx" ON "garageos"."QuoteApproval"("quoteId", "recordedAt");

-- CreateIndex
CREATE INDEX "WorkOrder_shopId_status_idx" ON "garageos"."WorkOrder"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_shopId_orderNumber_key" ON "garageos"."WorkOrder"("shopId", "orderNumber");

-- AddForeignKey
ALTER TABLE "garageos"."User" ADD CONSTRAINT "User_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "garageos"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "garageos"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Client" ADD CONSTRAINT "Client_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Vehicle" ADD CONSTRAINT "Vehicle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Invoice" ADD CONSTRAINT "Invoice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."InvoiceVehicle" ADD CONSTRAINT "InvoiceVehicle_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "garageos"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."InvoiceVehicle" ADD CONSTRAINT "InvoiceVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "garageos"."Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."InvoicePaymentEntry" ADD CONSTRAINT "InvoicePaymentEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "garageos"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceVehicleId_fkey" FOREIGN KEY ("invoiceVehicleId") REFERENCES "garageos"."InvoiceVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."SavedLineItem" ADD CONSTRAINT "SavedLineItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Quote" ADD CONSTRAINT "Quote_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Quote" ADD CONSTRAINT "Quote_convertedInvoiceId_fkey" FOREIGN KEY ("convertedInvoiceId") REFERENCES "garageos"."Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."QuoteVehicle" ADD CONSTRAINT "QuoteVehicle_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "garageos"."Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."QuoteVehicle" ADD CONSTRAINT "QuoteVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "garageos"."Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_quoteVehicleId_fkey" FOREIGN KEY ("quoteVehicleId") REFERENCES "garageos"."QuoteVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Appointment" ADD CONSTRAINT "Appointment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Appointment" ADD CONSTRAINT "Appointment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "garageos"."Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Appointment" ADD CONSTRAINT "Appointment_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "garageos"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."ShopWorkingHours" ADD CONSTRAINT "ShopWorkingHours_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."MechanicWorkingHours" ADD CONSTRAINT "MechanicWorkingHours_userId_fkey" FOREIGN KEY ("userId") REFERENCES "garageos"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."ShopBookingService" ADD CONSTRAINT "ShopBookingService_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."ServiceReminder" ADD CONSTRAINT "ServiceReminder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."ServiceReminder" ADD CONSTRAINT "ServiceReminder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "garageos"."Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."AccountingDocument" ADD CONSTRAINT "AccountingDocument_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CashDrawerEntry" ADD CONSTRAINT "CashDrawerEntry_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CashDrawerEntry" ADD CONSTRAINT "CashDrawerEntry_linkedInvoiceId_fkey" FOREIGN KEY ("linkedInvoiceId") REFERENCES "garageos"."Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."QuoteApproval" ADD CONSTRAINT "QuoteApproval_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "garageos"."Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."WorkOrder" ADD CONSTRAINT "WorkOrder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."WorkOrder" ADD CONSTRAINT "WorkOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."WorkOrder" ADD CONSTRAINT "WorkOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "garageos"."Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."WorkOrder" ADD CONSTRAINT "WorkOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "garageos"."Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."WorkOrder" ADD CONSTRAINT "WorkOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "garageos"."Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "garageos"."WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
