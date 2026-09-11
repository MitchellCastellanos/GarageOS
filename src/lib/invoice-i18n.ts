export type InvoiceLanguage = "ES" | "EN" | "FR";

export const INVOICE_LANGUAGES: { value: InvoiceLanguage; label: string }[] = [
  { value: "ES", label: "Español" },
  { value: "EN", label: "English" },
  { value: "FR", label: "Français" },
];

type Strings = {
  documentTitle: (num: string) => string;
  invoiceTitle: string;
  quoteTitle: string;
  invoiceNo: string;
  quoteNo: string;
  date: string;
  due: string;
  validUntil: string;
  status: string;
  billTo: string;
  vehicle: string;
  serviceDetails: string;
  phone: string;
  email: string;
  address: string;
  taxRegistration: string;
  plate: string;
  vin: string;
  color: string;
  mileageIn: string;
  mileageOut: string;
  mileageTraveled: string;
  colDescription: string;
  colType: string;
  colQty: string;
  colUnitPrice: string;
  colTotal: string;
  subtotal: string;
  tps: (pct: string) => string;
  tvq: (pct: string) => string;
  taxesTotal: string;
  grandTotal: string;
  etransfer: string;
  notes: string;
  thankYou: string;
  warrantyDisclosureTitle: string;
  warrantyDisclosureIntro: string;
  itemTypes: Record<string, string>;
  statuses: Record<string, string>;
  paidWatermark: string;
  months: string[];
  mail: {
    preview: (num: string, shop: string) => string;
    resendPreview: (num: string, shop: string) => string;
    subject: (num: string, shop: string) => string;
    resendSubject: (num: string, shop: string) => string;
    greeting: (name: string) => string;
    body: string;
    resendBody: string;
    attachmentNote: string;
    etransferNotice: (email: string) => string;
    invoiceNumber: string;
    total: string;
    vehicle: string;
    dueDate: string;
    contactPrompt: string;
    bookOnlineLabel: string;
    footer: (shop: string) => string;
    poweredBy: string;
  };
};

const ES: Strings = {
  documentTitle: (num) => `Factura ${num}`,
  invoiceTitle: "FACTURA",
  quoteTitle: "COTIZACIÓN",
  invoiceNo: "No. de factura",
  quoteNo: "No. de cotización",
  date: "Fecha de emisión",
  due: "Fecha de vencimiento",
  validUntil: "Válida hasta",
  status: "Estado",
  billTo: "Facturar a",
  vehicle: "Vehículo",
  serviceDetails: "Detalles del servicio",
  phone: "Teléfono",
  email: "Correo",
  address: "Dirección",
  taxRegistration: "Registro fiscal",
  plate: "Placa",
  vin: "VIN",
  color: "Color",
  mileageIn: "Km entrada",
  mileageOut: "Km salida",
  mileageTraveled: "Recorrido",
  colDescription: "Descripción",
  colType: "Tipo",
  colQty: "Cant.",
  colUnitPrice: "P. unitario",
  colTotal: "Importe",
  subtotal: "Subtotal",
  tps: (pct) => `TPS (${pct}%)`,
  tvq: (pct) => `TVQ (${pct}%)`,
  taxesTotal: "Total impuestos",
  grandTotal: "TOTAL A PAGAR",
  etransfer: "Correo para transferencias electrónicas (Interac)",
  notes: "Notas y condiciones",
  thankYou: "Gracias por confiar en nosotros.",
  warrantyDisclosureTitle: "Garantía de piezas",
  warrantyDisclosureIntro:
    "Las piezas siguientes incluyen garantía según se indica. Esta garantía cubre defectos de material bajo uso normal.",
  itemTypes: { LABOUR: "Mano de obra", PART: "Repuesto", OTHER: "Otro" },
  statuses: {
    DRAFT: "PENDIENTE",
    SENT: "PENDIENTE",
    PAID: "PAGADA",
    OVERDUE: "VENCIDA",
    CANCELLED: "CANCELADA",
    ACCEPTED: "ACEPTADA",
    REJECTED: "RECHAZADA",
    EXPIRED: "VENCIDA",
    CONVERTED: "CONVERTIDA",
  },
  paidWatermark: "PAGADO",
  months: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
  mail: {
    preview: (num, shop) => `Factura ${num} de ${shop}`,
    resendPreview: (num, shop) => `Reenvío: factura ${num} de ${shop}`,
    subject: (num, shop) => `Factura ${num} — ${shop}`,
    resendSubject: (num, shop) => `Reenvío: Factura ${num} — ${shop}`,
    greeting: (name) => `Hola, ${name}`,
    body: "Adjuntamos la factura por los servicios realizados en tu vehículo. Si tienes alguna pregunta, contáctanos directamente.",
    resendBody: "Te reenviamos la factura adjunta por si no la recibiste o necesitas una copia.",
    attachmentNote: "La factura en PDF va adjunta a este correo.",
    etransferNotice: (email) =>
      `Para pagos por transferencia Interac, envíalos a ${email}.`,
    invoiceNumber: "Número de factura",
    total: "Total",
    vehicle: "Vehículo",
    dueDate: "Vencimiento",
    contactPrompt: "Para consultas sobre esta factura:",
    bookOnlineLabel: "¿Necesitas otra cita? Resérvala en línea:",
    footer: (shop) => `Este correo fue enviado por ${shop}.`,
    poweredBy: "Enviado con Mecanico Management",
  },
};

const EN: Strings = {
  documentTitle: (num) => `Invoice ${num}`,
  invoiceTitle: "INVOICE",
  quoteTitle: "QUOTE",
  invoiceNo: "Invoice number",
  quoteNo: "Quote number",
  date: "Issue date",
  due: "Due date",
  validUntil: "Valid until",
  status: "Status",
  billTo: "Bill to",
  vehicle: "Vehicle",
  serviceDetails: "Service details",
  phone: "Phone",
  email: "Email",
  address: "Address",
  taxRegistration: "Tax registration",
  plate: "Plate",
  vin: "VIN",
  color: "Color",
  mileageIn: "Mileage in",
  mileageOut: "Mileage out",
  mileageTraveled: "Distance",
  colDescription: "Description",
  colType: "Type",
  colQty: "Qty",
  colUnitPrice: "Unit price",
  colTotal: "Amount",
  subtotal: "Subtotal",
  tps: (pct) => `GST (${pct}%)`,
  tvq: (pct) => `QST (${pct}%)`,
  taxesTotal: "Total tax",
  grandTotal: "AMOUNT DUE",
  etransfer: "Email for e-transfers (Interac)",
  notes: "Notes & terms",
  thankYou: "Thank you for your business.",
  warrantyDisclosureTitle: "Parts warranty",
  warrantyDisclosureIntro:
    "The following parts include the warranty periods shown below. Coverage applies to defects in material under normal use.",
  itemTypes: { LABOUR: "Labour", PART: "Part", OTHER: "Other" },
  statuses: {
    DRAFT: "PENDING",
    SENT: "PENDING",
    PAID: "PAID",
    OVERDUE: "OVERDUE",
    CANCELLED: "CANCELLED",
    ACCEPTED: "ACCEPTED",
    REJECTED: "REJECTED",
    EXPIRED: "EXPIRED",
    CONVERTED: "CONVERTED",
  },
  paidWatermark: "PAID",
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  mail: {
    preview: (num, shop) => `Invoice ${num} from ${shop}`,
    resendPreview: (num, shop) => `Resend: invoice ${num} from ${shop}`,
    subject: (num, shop) => `Invoice ${num} — ${shop}`,
    resendSubject: (num, shop) => `Resend: Invoice ${num} — ${shop}`,
    greeting: (name) => `Hello, ${name}`,
    body: "Please find attached the invoice for services performed on your vehicle. If you have any questions, contact us directly.",
    resendBody: "We are resending the attached invoice in case you did not receive it or need another copy.",
    attachmentNote: "The PDF invoice is attached to this email.",
    etransferNotice: (email) =>
      `For Interac e-transfer payments, please send them to ${email}.`,
    invoiceNumber: "Invoice number",
    total: "Total",
    vehicle: "Vehicle",
    dueDate: "Due date",
    contactPrompt: "For questions about this invoice:",
    bookOnlineLabel: "Need another appointment? Book online:",
    footer: (shop) => `This email was sent by ${shop}.`,
    poweredBy: "Sent with Mecanico Management",
  },
};

const FR: Strings = {
  documentTitle: (num) => `Facture ${num}`,
  invoiceTitle: "FACTURE",
  quoteTitle: "SOUMISSION",
  invoiceNo: "No de facture",
  quoteNo: "No de soumission",
  date: "Date d'émission",
  due: "Date d'échéance",
  validUntil: "Valide jusqu'au",
  status: "Statut",
  billTo: "Facturer à",
  vehicle: "Véhicule",
  serviceDetails: "Détails du service",
  phone: "Téléphone",
  email: "Courriel",
  address: "Adresse",
  taxRegistration: "Enregistrement fiscal",
  plate: "Plaque",
  vin: "NIV",
  color: "Couleur",
  mileageIn: "Km entrée",
  mileageOut: "Km sortie",
  mileageTraveled: "Parcours",
  colDescription: "Description",
  colType: "Type",
  colQty: "Qté",
  colUnitPrice: "P. unit.",
  colTotal: "Montant",
  subtotal: "Sous-total",
  tps: (pct) => `TPS (${pct}%)`,
  tvq: (pct) => `TVQ (${pct}%)`,
  taxesTotal: "Total taxes",
  grandTotal: "TOTAL À PAYER",
  etransfer: "Courriel pour virements Interac",
  notes: "Notes et conditions",
  thankYou: "Merci de votre confiance.",
  warrantyDisclosureTitle: "Garantie des pièces",
  warrantyDisclosureIntro:
    "Les pièces suivantes incluent une garantie tel qu'indiqué ci-dessous. La garantie couvre les défauts de matériel en usage normal.",
  itemTypes: { LABOUR: "Main-d'œuvre", PART: "Pièce", OTHER: "Autre" },
  statuses: {
    DRAFT: "EN ATTENTE",
    SENT: "EN ATTENTE",
    PAID: "PAYÉE",
    OVERDUE: "EN RETARD",
    CANCELLED: "ANNULÉE",
    ACCEPTED: "ACCEPTÉE",
    REJECTED: "REFUSÉE",
    EXPIRED: "EXPIRÉE",
    CONVERTED: "CONVERTIE",
  },
  paidWatermark: "PAYÉ",
  months: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  mail: {
    preview: (num, shop) => `Facture ${num} de ${shop}`,
    resendPreview: (num, shop) => `Renvoi : facture ${num} de ${shop}`,
    subject: (num, shop) => `Facture ${num} — ${shop}`,
    resendSubject: (num, shop) => `Renvoi : Facture ${num} — ${shop}`,
    greeting: (name) => `Bonjour, ${name}`,
    body: "Veuillez trouver ci-joint la facture pour les services effectués sur votre véhicule. Pour toute question, contactez-nous directement.",
    resendBody: "Nous vous renvoyons la facture ci-jointe au cas où vous ne l'auriez pas reçue ou auriez besoin d'une copie.",
    attachmentNote: "La facture PDF est jointe à ce courriel.",
    etransferNotice: (email) =>
      `Pour les paiements par virement Interac, envoyez-les à ${email}.`,
    invoiceNumber: "Numéro de facture",
    total: "Total",
    vehicle: "Véhicule",
    dueDate: "Échéance",
    contactPrompt: "Pour toute question concernant cette facture :",
    bookOnlineLabel: "Besoin d'un autre rendez-vous ? Réservez en ligne :",
    footer: (shop) => `Ce courriel a été envoyé par ${shop}.`,
    poweredBy: "Envoyé avec Mecanico Management",
  },
};

const MAP: Record<InvoiceLanguage, Strings> = { ES, EN, FR };

export function getInvoiceStrings(language: InvoiceLanguage | string | null | undefined): Strings {
  const key = (language ?? "ES") as InvoiceLanguage;
  return MAP[key] ?? ES;
}
