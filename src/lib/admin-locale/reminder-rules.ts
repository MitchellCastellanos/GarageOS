import type { AdminLocale } from "@/lib/admin-locale";

export interface ReminderRulesDictionary {
  manage: string;
  title: string;
  subtitle: string;
  back: string;
  locked: { title: string; description: string; cta: string };
  form: { name: string; namePh: string; keyword: string; keywordPh: string; keywordHint: string; months: string; km: string; lead: string; leadHint: string; create: string };
  list: { empty: string; every: (months: number, km: number | null) => string; keywordIs: (k: string) => string; lead: (d: number) => string; pause: string; resume: string; delete: string; confirmDelete: string; inactive: string };
  auto: string;
  errors: Record<string, string>;
}

const en: ReminderRulesDictionary = {
  manage: "Automatic rules",
  title: "Automatic maintenance rules",
  subtitle: "When a work order is completed and one of its lines matches a rule, GarageOS schedules the next service and reminds the customer ahead of time — by SMS or email, following their notification preference.",
  back: "Reminders",
  locked: { title: "Automatic reminders are included in Pro and Complete", description: "Set the interval once (e.g. oil change every 6 months) and GarageOS creates and sends the reminder after every matching job.", cta: "See plans" },
  form: { name: "Reminder name", namePh: "Oil change", keyword: "Matches work order lines containing", keywordPh: "oil", keywordHint: "Not case- or accent-sensitive.", months: "Repeat every (months)", km: "…or km/miles (shown on the reminder)", lead: "Remind this many days before", leadHint: "0–90", create: "Add rule" },
  list: { empty: "No rules yet.", every: (m, km) => `Every ${m} month${m === 1 ? "" : "s"}${km ? ` / ${km.toLocaleString()} km` : ""}`, keywordIs: (k) => `matches “${k}”`, lead: (d) => `${d} days ahead`, pause: "Pause", resume: "Resume", delete: "Delete", confirmDelete: "Delete this rule? Reminders already created are kept.", inactive: "Paused" },
  auto: "Auto",
  errors: {
    NAME_REQUIRED: "Give the reminder a name.",
    KEYWORD_REQUIRED: "Enter the text to look for in work order lines.",
    INTERVAL_REQUIRED: "Set a repeat interval in months.",
    INVALID_NUMBER: "Check the numbers (months ≤ 120, lead time ≤ 90 days).",
    NOT_FOUND: "Rule not found.",
  },
};

const fr: ReminderRulesDictionary = {
  manage: "Règles automatiques",
  title: "Règles d'entretien automatiques",
  subtitle: "Quand un ordre de travail est terminé et qu'une de ses lignes correspond à une règle, GarageOS planifie le prochain entretien et rappelle le client à l'avance — par SMS ou courriel, selon sa préférence.",
  back: "Rappels",
  locked: { title: "Les rappels automatiques sont inclus dans Pro et Complete", description: "Définissez l'intervalle une fois (p. ex. changement d'huile aux 6 mois) et GarageOS crée et envoie le rappel après chaque travail correspondant.", cta: "Voir les forfaits" },
  form: { name: "Nom du rappel", namePh: "Changement d'huile", keyword: "Correspond aux lignes contenant", keywordPh: "huile", keywordHint: "Insensible à la casse et aux accents.", months: "Répéter aux (mois)", km: "…ou km/milles (affiché sur le rappel)", lead: "Rappeler ce nombre de jours avant", leadHint: "0–90", create: "Ajouter la règle" },
  list: { empty: "Aucune règle pour le moment.", every: (m, km) => `Aux ${m} mois${km ? ` / ${km.toLocaleString()} km` : ""}`, keywordIs: (k) => `correspond à « ${k} »`, lead: (d) => `${d} jours avant`, pause: "Suspendre", resume: "Reprendre", delete: "Supprimer", confirmDelete: "Supprimer cette règle ? Les rappels déjà créés sont conservés.", inactive: "Suspendue" },
  auto: "Auto",
  errors: {
    NAME_REQUIRED: "Donnez un nom au rappel.",
    KEYWORD_REQUIRED: "Entrez le texte à chercher dans les lignes de l'ordre de travail.",
    INTERVAL_REQUIRED: "Indiquez un intervalle de répétition en mois.",
    INVALID_NUMBER: "Vérifiez les nombres (mois ≤ 120, préavis ≤ 90 jours).",
    NOT_FOUND: "Règle introuvable.",
  },
};

export const REMINDER_RULES_DICT: Record<AdminLocale, ReminderRulesDictionary> = { en, fr, es: en };
