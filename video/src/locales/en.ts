import type { LocaleCopy } from "./types";

// Canadian English.
export const en: LocaleCopy = {
  locale: "en",
  hook: {
    headline: "Running a repair shop shouldn’t mean juggling everything.",
    areas: ["Appointments", "Estimates", "Work orders", "Invoices", "Customers"],
    tag: "One connected system",
  },
  booking: {
    headline: "Appointments, organized. Customers, connected.",
    steps: ["Today’s schedule", "Day agenda", "Online booking"],
    mobileLabel: "On the customer’s phone",
  },
  inspection: {
    headline: "Show customers what their vehicle needs.",
    steps: ["Digital inspection", "Customer report", "Estimate editor", "Customer estimate"],
  },
  work: {
    headline: "From the work order to the invoice.",
    steps: ["Work order", "Branded invoice", "Invoice email", "Payment record"],
  },
  retention: {
    headline: "Keep your customers coming back.",
    steps: ["Customer portal", "Maintenance reminders", "Campaign editor"],
  },
  closing: {
    headline: "Your entire shop. One connected system.",
    cta: "Book your personalized demo.",
    website: "garage-os.ca",
    sampleNote: "Screens shown: Garage Laurent, a sample shop. Sample records are in Québec French.",
  },
  provenance: {
    sampleShop: "Sample shop · Garage Laurent",
    anotherVisit: "Another sample visit",
    sampleVisits: "Sample visits",
  },
  teaser: {
    hook: { headline: "Running a shop shouldn’t mean juggling everything." },
    booking: { headline: "Appointments, organized.", sub: "Customers book online." },
    inspection: { headline: "Clear inspections. Clear estimates." },
    invoice: { headline: "From work order to invoice." },
    closing: { headline: "Your entire shop. One connected system.", sub: "Book your personalized demo." },
  },
  narration: {
    hook: "Running a repair shop is complicated. Managing it shouldn’t be.",
    booking: "Keep your schedule organized and give customers a convenient way to book.",
    inspection: "Create clear inspections and professional estimates your customers can understand.",
    work: "Manage work orders, create branded invoices, and keep track of payments in one place.",
    retention: "Stay connected with customers through reminders and follow-up communication.",
    closing: "GarageOS. Your entire shop, connected.",
  },
  teaserNarration: {
    hook: "Running a repair shop is complicated.",
    booking: "Organize your schedule and let customers book online.",
    inspection: "Send clear inspections and estimates.",
    invoice: "Invoice in one place.",
    closing: "GarageOS. Your entire shop, connected.",
  },
};
