import type { AdminLocale } from "@/lib/admin-locale";

const en = {
  title: "Sales demos", newDemo: "New prospect demo", empty: "No prospect demos yet.",
  name: "Shop name", address: "Address", phone: "Shop phone", email: "Shop email",
  contactName: "Contact name", contactEmail: "Contact email", contactPhone: "Contact phone",
  language: "Preferred language", create: "Create and prepare", preparing: "Preparing…",
  resume: "Resume", prepare: "Prepare branding", start: "Start customer experience", back: "Back to Sales",
  logo: "Logo", cover: "Storefront / cover", shop: "Interior / shop", optional: "Optional",
  camera: "Take photo", device: "Choose from device", skip: "Skip", original: "Use original",
  crop: "Crop and rotate", apply: "Preview preparation", upload: "Use prepared image", rotate: "Rotation",
  left: "Left (%)", top: "Top (%)", width: "Width (%)", height: "Height (%)",
  helper: "Prepare with ChatGPT", copy: "Copy ChatGPT prompt", copied: "Prompt copied",
  instructions: "Attach the original logo in ChatGPT with this prompt, then upload the returned transparent PNG here.",
  assetsHint: "Logo and shop photos are public brand assets. JPEG, PNG or WebP, up to 4 MB each. You can replace or skip any image.",
  error: "Could not save. Check your input and try again.", saved: "Saved", saving: "Saving…", unsaved: "Not saved yet — press the upload button, or this image will not reach onboarding.",
  storageError: "Image storage is not configured in this environment. You can skip images and continue.",
  demo: "SALES DEMO", viewing: "Viewing", exit: "Exit demo", plan: "Demo plan",
  noStripe: "Choose the real product tier for this demo. No card, Stripe subscription or trial is created.",
  continue: "Continue without payment", billing: "Sales demo has no commercial subscription. Change the viewing tier in the demo toolbar.",
  current: "Current", proposed: "Proposed", created: "Created", expires: "Expires", expired: "Expired",
  states: { PREPARING: "Preparing", ACTIVE: "Active demo", ACTIVATION_SENT: "Activation sent", AWAITING_PAYMENT: "Awaiting payment", CONVERTED: "Converted", EXPIRED: "Expired" },
};
const fr: typeof en = {
  title: "Démonstrations de vente", newDemo: "Nouvelle démonstration", empty: "Aucune démonstration pour le moment.",
  name: "Nom du garage", address: "Adresse", phone: "Téléphone du garage", email: "Courriel du garage",
  contactName: "Nom du contact", contactEmail: "Courriel du contact", contactPhone: "Téléphone du contact",
  language: "Langue préférée", create: "Créer et préparer", preparing: "Préparation…",
  resume: "Reprendre", prepare: "Préparer l’image de marque", start: "Démarrer l’expérience client", back: "Retour aux ventes",
  logo: "Logo", cover: "Façade / couverture", shop: "Intérieur / atelier", optional: "Facultatif",
  camera: "Prendre une photo", device: "Choisir un fichier", skip: "Passer", original: "Utiliser l’original",
  crop: "Recadrer et pivoter", apply: "Aperçu de la préparation", upload: "Utiliser l’image préparée", rotate: "Rotation",
  left: "Gauche (%)", top: "Haut (%)", width: "Largeur (%)", height: "Hauteur (%)",
  helper: "Préparer avec ChatGPT", copy: "Copier la consigne ChatGPT", copied: "Consigne copiée",
  instructions: "Joignez le logo original dans ChatGPT avec cette consigne, puis téléversez ici le PNG transparent obtenu.",
  assetsHint: "Le logo et les photos sont des images de marque publiques. JPEG, PNG ou WebP, jusqu’à 4 Mo par image. Vous pouvez remplacer ou passer chaque image.",
  error: "Enregistrement impossible. Vérifiez les données et réessayez.", saved: "Enregistré", saving: "Enregistrement…", unsaved: "Pas encore enregistrée — appuyez sur le bouton d’envoi, sinon cette image n’arrivera pas à l’intégration.",
  storageError: "Le stockage d’images n’est pas configuré dans cet environnement. Vous pouvez passer les images et continuer.",
  demo: "DÉMO DE VENTE", viewing: "Forfait affiché", exit: "Quitter la démo", plan: "Forfait de démonstration",
  noStripe: "Choisissez le forfait du produit réel pour cette démo. Aucune carte, aucun abonnement Stripe ni essai n’est créé.",
  continue: "Continuer sans paiement", billing: "Cette démo n’a pas d’abonnement commercial. Changez le forfait dans la barre de démonstration.",
  current: "Actuel", proposed: "Proposé", created: "Création", expires: "Expiration", expired: "Expirée",
  states: { PREPARING: "Préparation", ACTIVE: "Démo active", ACTIVATION_SENT: "Activation envoyée", AWAITING_PAYMENT: "Paiement en attente", CONVERTED: "Convertie", EXPIRED: "Expirée" },
};
export function salesDemoCopy(locale: AdminLocale) { return locale === "fr" ? fr : en; }

export const CHATGPT_LOGO_PROMPT = `Prepare the attached business logo for use in GarageOS.

Preserve the logo's original design exactly. Do not redesign it, change the wording, replace the typography, alter the proportions, add effects, or invent missing elements.

Remove the background completely and return the logo as a clean PNG with a transparent background.

Requirements:
- transparent background
- preserve original colors
- preserve sharp edges and fine details
- remove halos, white borders, shadows, or background artifacts caused by the original image
- center the logo with reasonable transparent padding
- do not crop any part of the logo
- high-quality output suitable for a business website, invoices, booking pages, and application UI
- target approximately 2000 px on the longest side when the source quality permits
- PNG output
- do not place the logo on a mockup or colored background

If the source is low resolution, clean and enhance it conservatively without changing the actual logo design.

Return only the prepared logo image.`;
