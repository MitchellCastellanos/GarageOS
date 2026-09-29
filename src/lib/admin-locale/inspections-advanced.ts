import type { AdminLocale } from "@/lib/admin-locale";

export interface InspectionsAdvancedDictionary {
  photosLocked: { title: string; description: string };
  templates: {
    manage: string; title: string; subtitle: string; name: string; itemsLabel: string; itemsHint: string; create: string; delete: string; confirmDelete: string;
    empty: string; itemsCount: (n: number) => string; select: string; standard: string; back: string;
    locked: { title: string; description: string; cta: string };
  };
  share: { title: string; description: string; enable: string; copy: string; copied: string; stop: string; open: string; locked: string };
  report: {
    title: string; subtitle: (shop: string) => string; vehicle: string; date: string; findings: (n: number) => string; allGood: string; recommended: string; checklist: string;
    noNotes: string; footer: string; conditions: Record<"GOOD" | "ATTENTION" | "SERVICE_REQUIRED", string>;
  };
}

const en: InspectionsAdvancedDictionary = {
  photosLocked: { title: "Inspection photos are included in Pro and Complete", description: "Attach photos to each checklist item and show them to your customer." },
  templates: {
    manage: "Templates", title: "Inspection templates", subtitle: "Reusable checklists that replace the standard one when you start an inspection.", name: "Template name",
    itemsLabel: "Checklist items", itemsHint: "One item per line, in the order you inspect them.", create: "Save template", delete: "Delete", confirmDelete: "Delete this template?",
    empty: "No templates yet.", itemsCount: (n) => `${n} item${n === 1 ? "" : "s"}`, select: "Checklist", standard: "Standard checklist", back: "Inspections",
    locked: { title: "Custom inspection templates are included in Pro and Complete", description: "Build checklists for your own services — winter prep, pre-purchase, fleet — and reuse them.", cta: "See plans" },
  },
  share: {
    title: "Customer report", description: "Share a link to a clean, mobile-friendly report with conditions, notes and photos.", enable: "Create shareable link", copy: "Copy link",
    copied: "Link copied", stop: "Stop sharing", open: "Open report", locked: "Shareable customer reports are included in Pro and Complete.",
  },
  report: {
    title: "Vehicle inspection report", subtitle: (s) => `Prepared by ${s}`, vehicle: "Vehicle", date: "Date", findings: (n) => `${n} item${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention`,
    allGood: "Everything checked is in good condition.", recommended: "Recommended work", checklist: "Full checklist", noNotes: "No notes.", footer: "Powered by GarageOS",
    conditions: { GOOD: "Good", ATTENTION: "Needs attention", SERVICE_REQUIRED: "Service required" },
  },
};

const fr: InspectionsAdvancedDictionary = {
  photosLocked: { title: "Les photos d'inspection sont incluses dans Pro et Complete", description: "Joignez des photos à chaque point de la liste et montrez-les à votre client." },
  templates: {
    manage: "Modèles", title: "Modèles d'inspection", subtitle: "Des listes réutilisables qui remplacent la liste standard au début d'une inspection.", name: "Nom du modèle",
    itemsLabel: "Points à vérifier", itemsHint: "Un point par ligne, dans l'ordre d'inspection.", create: "Enregistrer le modèle", delete: "Supprimer", confirmDelete: "Supprimer ce modèle ?",
    empty: "Aucun modèle pour le moment.", itemsCount: (n) => `${n} point${n === 1 ? "" : "s"}`, select: "Liste de vérification", standard: "Liste standard", back: "Inspections",
    locked: { title: "Les modèles d'inspection personnalisés sont inclus dans Pro et Complete", description: "Créez des listes pour vos propres services — préparation hivernale, pré-achat, flotte — et réutilisez-les.", cta: "Voir les forfaits" },
  },
  share: {
    title: "Rapport client", description: "Partagez un lien vers un rapport clair, adapté au mobile, avec états, notes et photos.", enable: "Créer un lien de partage", copy: "Copier le lien",
    copied: "Lien copié", stop: "Arrêter le partage", open: "Ouvrir le rapport", locked: "Les rapports client partageables sont inclus dans Pro et Complete.",
  },
  report: {
    title: "Rapport d'inspection du véhicule", subtitle: (s) => `Préparé par ${s}`, vehicle: "Véhicule", date: "Date", findings: (n) => `${n} point${n === 1 ? "" : "s"} nécessite${n === 1 ? "" : "nt"} de l'attention`,
    allGood: "Tout ce qui a été vérifié est en bon état.", recommended: "Travaux recommandés", checklist: "Liste complète", noNotes: "Aucune note.", footer: "Propulsé par GarageOS",
    conditions: { GOOD: "Bon", ATTENTION: "À surveiller", SERVICE_REQUIRED: "Service requis" },
  },
};

export const INSPECTIONS_ADVANCED_DICT: Record<AdminLocale, InspectionsAdvancedDictionary> = { en, fr, es: en };
