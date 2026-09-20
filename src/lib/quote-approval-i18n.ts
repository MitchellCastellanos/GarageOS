export type QuoteApprovalLanguage = "EN" | "FR";

export interface QuoteApprovalStrings {
  metaTitle: string;
  title: (quoteNumber: string) => string;
  intro: string;
  client: string;
  validUntil: string;
  noExpiry: string;
  notes: string;
  subtotal: string;
  taxes: string;
  totalCad: string;
  footerDisclaimer: string;
  form: {
    acceptedHeading: string;
    rejectedHeading: string;
    decisionReceivedBody: (shopName: string) => string;
    whatToDo: string;
    subtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    acceptButton: string;
    rejectButton: string;
  };
  errors: {
    nameRequired: string;
    linkInvalid: string;
    alreadyUsed: string;
    genericFailure: string;
  };
}

const EN: QuoteApprovalStrings = {
  metaTitle: "Review quote | GarageOS",
  title: (quoteNumber) => `Quote ${quoteNumber}`,
  intro: "Review the details and respond directly from this secure link.",
  client: "Client",
  validUntil: "Valid until",
  noExpiry: "No expiration date",
  notes: "Notes",
  subtotal: "Subtotal",
  taxes: "Taxes",
  totalCad: "Total CAD",
  footerDisclaimer: "This link is private and can only be used once.",
  form: {
    acceptedHeading: "Quote accepted",
    rejectedHeading: "Quote rejected",
    decisionReceivedBody: (shopName) => `${shopName} received your decision. You can close this window.`,
    whatToDo: "What would you like to do?",
    subtitle: "Your name will be recorded along with the decision.",
    nameLabel: "Name",
    namePlaceholder: "Your full name",
    acceptButton: "Accept quote",
    rejectButton: "Reject",
  },
  errors: {
    nameRequired: "Enter your name to record the decision.",
    linkInvalid: "This link is no longer valid or the quote is no longer available.",
    alreadyUsed: "This link has already been used.",
    genericFailure: "We couldn't record your decision. Please try again.",
  },
};

const FR: QuoteApprovalStrings = {
  metaTitle: "Réviser la soumission | GarageOS",
  title: (quoteNumber) => `Soumission ${quoteNumber}`,
  intro: "Consultez les détails et répondez directement à partir de ce lien sécurisé.",
  client: "Client",
  validUntil: "Valide jusqu'au",
  noExpiry: "Aucune date d'expiration",
  notes: "Notes",
  subtotal: "Sous-total",
  taxes: "Taxes",
  totalCad: "Total CAD",
  footerDisclaimer: "Ce lien est privé et ne peut être utilisé qu'une seule fois.",
  form: {
    acceptedHeading: "Soumission acceptée",
    rejectedHeading: "Soumission refusée",
    decisionReceivedBody: (shopName) => `${shopName} a reçu votre décision. Vous pouvez fermer cette fenêtre.`,
    whatToDo: "Que souhaitez-vous faire ?",
    subtitle: "Votre nom sera enregistré avec la décision.",
    nameLabel: "Nom",
    namePlaceholder: "Votre nom complet",
    acceptButton: "Accepter la soumission",
    rejectButton: "Refuser",
  },
  errors: {
    nameRequired: "Écrivez votre nom pour enregistrer la décision.",
    linkInvalid: "Ce lien n'est plus valide ou la soumission n'est plus disponible.",
    alreadyUsed: "Ce lien a déjà été utilisé.",
    genericFailure: "Nous n'avons pas pu enregistrer votre décision. Veuillez réessayer.",
  },
};

const MAP: Record<QuoteApprovalLanguage, QuoteApprovalStrings> = { EN, FR };

export function getQuoteApprovalStrings(
  language: QuoteApprovalLanguage | string | null | undefined,
): QuoteApprovalStrings {
  const key = language === "FR" ? "FR" : "EN";
  return MAP[key];
}
