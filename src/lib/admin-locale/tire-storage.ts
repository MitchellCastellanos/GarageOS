import type { AdminLocale } from "@/lib/admin-locale";

export interface TireStorageDictionary {
  nav: string;
  page: { title: string; subtitle: (n: number) => string; checkIn: string; searchPlaceholder: string; empty: string; emptyFiltered: string };
  locked: { title: string; description: string; cta: string };
  filters: { all: string; stored: string; checkedOut: string; allSeasons: string; apply: string };
  seasons: Record<"WINTER" | "SUMMER" | "ALL_SEASON", string>;
  conditions: Record<"NEW" | "GOOD" | "FAIR" | "WORN", string>;
  status: Record<"STORED" | "CHECKED_OUT", string>;
  events: Record<"CHECK_IN" | "CHECK_OUT" | "MOVED", string>;
  form: {
    titleNew: string; titleEdit: string; client: string; vehicle: string; noVehicle: string; season: string; brand: string; model: string;
    size: string; sizeHint: string; quantity: string; condition: string; withRims: string; location: string; locationHint: string; notes: string;
    submitNew: string; submitEdit: string; cancel: string;
  };
  detail: {
    back: string; edit: string; history: string; checkOut: string; checkOutNote: string; reCheckIn: string; move: string; newLocation: string; save: string;
    checkedInOn: string; checkedOutOn: string; location: string; noLocation: string; qty: string; withRims: string; noRims: string; noVehicle: string; confirmCheckOut: string;
  };
  section: { title: string; empty: string; checkIn: string };
  errors: Record<string, string>;
  toast: { checkedOut: string; checkedIn: string; moved: string };
  table: { client: string; tires: string; location: string; status: string };
}

const en: TireStorageDictionary = {
  nav: "Tire storage",
  page: {
    title: "Tire storage",
    subtitle: (n) => `${n} tire set${n === 1 ? "" : "s"}`,
    checkIn: "Check in tires",
    searchPlaceholder: "Search customer, plate, size, brand, location…",
    empty: "No tires in storage yet.",
    emptyFiltered: "No tire sets match your search.",
  },
  locked: {
    title: "Tire storage is included in Pro and Complete",
    description: "Track every stored set — customer, vehicle, size, condition and rack location — with check-in and check-out history.",
    cta: "See plans",
  },
  filters: { all: "All", stored: "In storage", checkedOut: "Checked out", allSeasons: "All seasons", apply: "Filter" },
  seasons: { WINTER: "Winter", SUMMER: "Summer", ALL_SEASON: "All-season" },
  conditions: { NEW: "New", GOOD: "Good", FAIR: "Fair", WORN: "Worn" },
  status: { STORED: "In storage", CHECKED_OUT: "Checked out" },
  events: { CHECK_IN: "Checked in", CHECK_OUT: "Checked out", MOVED: "Moved" },
  form: {
    titleNew: "Check in tires", titleEdit: "Edit tire set", client: "Customer", vehicle: "Vehicle", noVehicle: "— No vehicle —", season: "Season",
    brand: "Brand", model: "Model", size: "Size", sizeHint: "e.g. 225/45R17", quantity: "Quantity", condition: "Condition", withRims: "Stored with rims",
    location: "Storage location", locationHint: "e.g. Rack A-3", notes: "Notes", submitNew: "Check in", submitEdit: "Save changes", cancel: "Cancel",
  },
  detail: {
    back: "Tire storage", edit: "Edit", history: "History", checkOut: "Check out", checkOutNote: "Note (optional)", reCheckIn: "Check back in", move: "Move",
    newLocation: "New location", save: "Save", checkedInOn: "Checked in", checkedOutOn: "Checked out", location: "Location", noLocation: "No location set",
    qty: "Qty", withRims: "With rims", noRims: "Tires only", noVehicle: "No vehicle", confirmCheckOut: "Hand these tires back to the customer?",
  },
  section: { title: "Tire storage", empty: "No stored tires.", checkIn: "Check in tires" },
  errors: {
    INVALID_SIZE: "Use a size like 225/45R17.",
    CLIENT_NOT_FOUND: "Customer not found.",
    VEHICLE_MISMATCH: "That vehicle doesn't belong to this customer.",
    NOT_FOUND: "Tire set not found.",
    INVALID_STATE: "That action isn't possible for this tire set right now.",
  },
  toast: { checkedOut: "Tires checked out", checkedIn: "Tires checked in", moved: "Location updated" },
  table: { client: "Customer / vehicle", tires: "Tires", location: "Location", status: "Status" },
};

const fr: TireStorageDictionary = {
  nav: "Entreposage de pneus",
  page: {
    title: "Entreposage de pneus",
    subtitle: (n) => `${n} jeu${n === 1 ? "" : "x"} de pneus`,
    checkIn: "Entrée de pneus",
    searchPlaceholder: "Rechercher client, plaque, dimension, marque, emplacement…",
    empty: "Aucun pneu entreposé pour le moment.",
    emptyFiltered: "Aucun jeu ne correspond à votre recherche.",
  },
  locked: {
    title: "L'entreposage de pneus est inclus dans Pro et Complete",
    description: "Suivez chaque jeu entreposé — client, véhicule, dimension, état et emplacement — avec l'historique des entrées et sorties.",
    cta: "Voir les forfaits",
  },
  filters: { all: "Tous", stored: "Entreposés", checkedOut: "Sortis", allSeasons: "Toutes saisons", apply: "Filtrer" },
  seasons: { WINTER: "Hiver", SUMMER: "Été", ALL_SEASON: "Toutes saisons" },
  conditions: { NEW: "Neufs", GOOD: "Bon", FAIR: "Passable", WORN: "Usés" },
  status: { STORED: "Entreposés", CHECKED_OUT: "Sortis" },
  events: { CHECK_IN: "Entrée", CHECK_OUT: "Sortie", MOVED: "Déplacés" },
  form: {
    titleNew: "Entrée de pneus", titleEdit: "Modifier le jeu de pneus", client: "Client", vehicle: "Véhicule", noVehicle: "— Aucun véhicule —", season: "Saison",
    brand: "Marque", model: "Modèle", size: "Dimension", sizeHint: "p. ex. 225/45R17", quantity: "Quantité", condition: "État", withRims: "Entreposés avec jantes",
    location: "Emplacement", locationHint: "p. ex. Rack A-3", notes: "Notes", submitNew: "Enregistrer l'entrée", submitEdit: "Enregistrer", cancel: "Annuler",
  },
  detail: {
    back: "Entreposage de pneus", edit: "Modifier", history: "Historique", checkOut: "Sortie", checkOutNote: "Note (facultatif)", reCheckIn: "Remettre en entrepôt", move: "Déplacer",
    newLocation: "Nouvel emplacement", save: "Enregistrer", checkedInOn: "Entrée", checkedOutOn: "Sortie", location: "Emplacement", noLocation: "Aucun emplacement",
    qty: "Qté", withRims: "Avec jantes", noRims: "Pneus seulement", noVehicle: "Aucun véhicule", confirmCheckOut: "Remettre ces pneus au client ?",
  },
  section: { title: "Entreposage de pneus", empty: "Aucun pneu entreposé.", checkIn: "Entrée de pneus" },
  errors: {
    INVALID_SIZE: "Utilisez une dimension comme 225/45R17.",
    CLIENT_NOT_FOUND: "Client introuvable.",
    VEHICLE_MISMATCH: "Ce véhicule n'appartient pas à ce client.",
    NOT_FOUND: "Jeu de pneus introuvable.",
    INVALID_STATE: "Cette action n'est pas possible pour ce jeu en ce moment.",
  },
  toast: { checkedOut: "Pneus sortis", checkedIn: "Pneus remis en entrepôt", moved: "Emplacement mis à jour" },
  table: { client: "Client / véhicule", tires: "Pneus", location: "Emplacement", status: "Statut" },
};

export const TIRE_STORAGE_DICT: Record<AdminLocale, TireStorageDictionary> = { en, fr, es: en };
