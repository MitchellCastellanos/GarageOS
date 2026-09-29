import type { AdminLocale } from "@/lib/admin-locale";

export interface ImportDictionary {
  title: string;
  subtitle: string;
  entities: Record<"customers" | "vehicles" | "inventory", { label: string; hint: string }>;
  fieldLabels: Record<string, string>;
  step1: string;
  step2: string;
  step3: string;
  chooseFile: string;
  fileHint: string;
  analyze: string;
  mappingTitle: string;
  mappingHelp: string;
  notMapped: string;
  requiredMark: string;
  sampleTitle: string;
  optionsTitle: string;
  dupSkip: string;
  dupUpdate: string;
  dupUpdatePro: string;
  createMissing: string;
  validate: string;
  previewTitle: string;
  rowsTotal: string;
  willCreate: string;
  willUpdate: string;
  willSkip: string;
  withErrors: string;
  newCustomers: string;
  issuesTitle: string;
  row: string;
  moreIssues: (n: number) => string;
  downloadErrors: string;
  duplicatesTitle: string;
  duplicateInFile: string;
  duplicateExisting: string;
  confirm: string;
  importing: string;
  doneTitle: string;
  doneBody: string;
  importAnother: string;
  recent: string;
  proTitle: string;
  proBody: string;
  proCta: string;
  basicLimits: (rows: number) => string;
  missingColumns: string;
  errors: Record<string, string>;
  codes: Record<string, string>;
  actionCreate: string;
  actionUpdate: string;
}

const en: ImportDictionary = {
  title: "Import data",
  subtitle: "Bring your existing customers, vehicles and parts into GarageOS from a CSV or Excel file.",
  entities: {
    customers: { label: "Customers", hint: "One row per customer." },
    vehicles: { label: "Vehicles", hint: "One row per vehicle, with its owner (email, phone or name). Missing customers can be created automatically — so a single export of customers + vehicles works." },
    inventory: { label: "Inventory", hint: "One row per part, with price and starting quantity. Stock is recorded in the inventory ledger." },
  },
  fieldLabels: {
    firstName: "First name",
    lastName: "Last name",
    fullName: "Full name (split automatically)",
    email: "Email",
    phone: "Phone",
    address: "Address",
    notes: "Notes",
    language: "Language (EN/FR)",
    licensePlate: "License plate",
    make: "Make",
    model: "Model",
    year: "Year",
    vin: "VIN",
    color: "Color",
    mileageUnit: "Mileage unit (km/miles)",
    name: "Name",
    sku: "SKU / part number",
    description: "Description",
    unitCost: "Unit cost",
    unitPrice: "Unit price",
    quantityOnHand: "Quantity on hand",
    reorderThreshold: "Reorder threshold",
  },
  step1: "1. File",
  step2: "2. Map columns",
  step3: "3. Review & import",
  chooseFile: "Choose a .csv or .xlsx file",
  fileHint: "First row must be the column headers. Up to 4 MB.",
  analyze: "Read file",
  mappingTitle: "Match your columns",
  mappingHelp: "We matched what we could. Check each field and fix anything that's off.",
  notMapped: "— not in my file —",
  requiredMark: "required",
  sampleTitle: "First rows of your file",
  optionsTitle: "If a record already exists",
  dupSkip: "Skip it (keep what GarageOS has)",
  dupUpdate: "Update it with the file's non-empty values",
  dupUpdatePro: "Update option is included in Pro and Complete.",
  createMissing: "Create the customer when a vehicle's owner isn't found",
  validate: "Validate file",
  previewTitle: "Nothing has been imported yet — this is what will happen:",
  rowsTotal: "Rows",
  willCreate: "To create",
  willUpdate: "To update",
  willSkip: "Duplicates skipped",
  withErrors: "With errors (not imported)",
  newCustomers: "New customers created from the vehicle rows",
  issuesTitle: "Rows with errors",
  row: "Row",
  moreIssues: (n) => `…and ${n} more. Download the full list.`,
  downloadErrors: "Download rows with errors (CSV)",
  duplicatesTitle: "Skipped duplicates",
  duplicateInFile: "repeated in the file",
  duplicateExisting: "already in GarageOS",
  confirm: "Import now",
  importing: "Importing…",
  doneTitle: "Import complete",
  doneBody: "Rows with errors were not imported — fix them and import that file again; duplicates are skipped safely.",
  importAnother: "Import another file",
  recent: "Recent imports",
  proTitle: "Full import is included in Pro and Complete",
  proBody: "Import inventory, files up to 10,000 rows and update existing records. Your plan includes basic import of customers and vehicles (up to 500 rows per file).",
  proCta: "See plans",
  basicLimits: (rows) => `Your plan imports up to ${rows} rows per file.`,
  missingColumns: "Map the required fields first:",
  errors: {
    UPGRADE_REQUIRED: "This import option needs the Pro plan.",
    TOO_MANY_ROWS: "This file has more rows than your plan allows per import. Split it or upgrade.",
    EMPTY_FILE: "The file is empty.",
    FILE_TOO_LARGE: "The file is larger than 4 MB.",
    UNSUPPORTED_TYPE: "Use a .csv or .xlsx file.",
    UNREADABLE: "We couldn't read that file. Re-save it as CSV or XLSX and try again.",
    NO_ROWS: "The file needs a header row and at least one data row.",
    INVALID_REQUEST: "Something is wrong with the request. Reload and try again.",
    MISSING_COLUMNS: "Some required columns are not mapped.",
    CONFLICT: "Data changed while importing (e.g. a duplicate SKU). Nothing was imported — validate again.",
  },
  codes: {
    FIRST_NAME_REQUIRED: "First name is missing",
    INVALID_EMAIL: "Invalid email",
    INVALID_PHONE: "Phone number is too short",
    PLATE_REQUIRED: "License plate is missing",
    MAKE_REQUIRED: "Make is missing",
    MODEL_REQUIRED: "Model is missing",
    YEAR_INVALID: "Year is missing or invalid",
    VIN_INVALID: "Invalid VIN",
    CUSTOMER_MISSING: "No customer on this row",
    CUSTOMER_NOT_FOUND: "Owner not found in GarageOS",
    NAME_REQUIRED: "Name is missing",
    PRICE_INVALID: "Price is missing or invalid",
    COST_INVALID: "Invalid cost",
    QUANTITY_INVALID: "Quantity must be a whole number ≥ 0",
    THRESHOLD_INVALID: "Reorder threshold must be a whole number ≥ 0",
    FIELD_TOO_LONG: "A value is too long",
  },
  actionCreate: "create",
  actionUpdate: "update",
};

const fr: ImportDictionary = {
  title: "Importer des données",
  subtitle: "Importez vos clients, véhicules et pièces existants dans GarageOS à partir d'un fichier CSV ou Excel.",
  entities: {
    customers: { label: "Clients", hint: "Une ligne par client." },
    vehicles: { label: "Véhicules", hint: "Une ligne par véhicule, avec son propriétaire (courriel, téléphone ou nom). Les clients manquants peuvent être créés automatiquement — un seul export clients + véhicules suffit." },
    inventory: { label: "Inventaire", hint: "Une ligne par pièce, avec prix et quantité initiale. Le stock est enregistré dans le registre d'inventaire." },
  },
  fieldLabels: {
    firstName: "Prénom",
    lastName: "Nom de famille",
    fullName: "Nom complet (séparé automatiquement)",
    email: "Courriel",
    phone: "Téléphone",
    address: "Adresse",
    notes: "Notes",
    language: "Langue (EN/FR)",
    licensePlate: "Plaque d'immatriculation",
    make: "Marque",
    model: "Modèle",
    year: "Année",
    vin: "NIV",
    color: "Couleur",
    mileageUnit: "Unité de distance (km/miles)",
    name: "Nom",
    sku: "SKU / numéro de pièce",
    description: "Description",
    unitCost: "Coût unitaire",
    unitPrice: "Prix unitaire",
    quantityOnHand: "Quantité en stock",
    reorderThreshold: "Seuil de recommande",
  },
  step1: "1. Fichier",
  step2: "2. Associer les colonnes",
  step3: "3. Vérifier et importer",
  chooseFile: "Choisissez un fichier .csv ou .xlsx",
  fileHint: "La première ligne doit contenir les en-têtes. Maximum 4 Mo.",
  analyze: "Lire le fichier",
  mappingTitle: "Associez vos colonnes",
  mappingHelp: "Nous avons associé ce que nous pouvions. Vérifiez chaque champ et corrigez au besoin.",
  notMapped: "— absent de mon fichier —",
  requiredMark: "requis",
  sampleTitle: "Premières lignes de votre fichier",
  optionsTitle: "Si un enregistrement existe déjà",
  dupSkip: "L'ignorer (conserver ce que GarageOS contient)",
  dupUpdate: "Le mettre à jour avec les valeurs non vides du fichier",
  dupUpdatePro: "L'option de mise à jour est incluse dans Pro et Complete.",
  createMissing: "Créer le client si le propriétaire d'un véhicule est introuvable",
  validate: "Valider le fichier",
  previewTitle: "Rien n'a encore été importé — voici ce qui va se passer :",
  rowsTotal: "Lignes",
  willCreate: "À créer",
  willUpdate: "À mettre à jour",
  willSkip: "Doublons ignorés",
  withErrors: "Avec erreurs (non importées)",
  newCustomers: "Nouveaux clients créés à partir des lignes de véhicules",
  issuesTitle: "Lignes en erreur",
  row: "Ligne",
  moreIssues: (n) => `…et ${n} de plus. Téléchargez la liste complète.`,
  downloadErrors: "Télécharger les lignes en erreur (CSV)",
  duplicatesTitle: "Doublons ignorés",
  duplicateInFile: "répété dans le fichier",
  duplicateExisting: "déjà dans GarageOS",
  confirm: "Importer maintenant",
  importing: "Importation…",
  doneTitle: "Importation terminée",
  doneBody: "Les lignes en erreur n'ont pas été importées — corrigez-les et réimportez ce fichier; les doublons sont ignorés sans risque.",
  importAnother: "Importer un autre fichier",
  recent: "Importations récentes",
  proTitle: "L'importation complète est incluse dans Pro et Complete",
  proBody: "Importez l'inventaire, des fichiers jusqu'à 10 000 lignes et mettez à jour les enregistrements existants. Votre forfait inclut l'importation de base des clients et véhicules (500 lignes par fichier).",
  proCta: "Voir les forfaits",
  basicLimits: (rows) => `Votre forfait importe jusqu'à ${rows} lignes par fichier.`,
  missingColumns: "Associez d'abord les champs requis :",
  errors: {
    UPGRADE_REQUIRED: "Cette option d'importation nécessite le forfait Pro.",
    TOO_MANY_ROWS: "Ce fichier contient plus de lignes que votre forfait le permet. Divisez-le ou changez de forfait.",
    EMPTY_FILE: "Le fichier est vide.",
    FILE_TOO_LARGE: "Le fichier dépasse 4 Mo.",
    UNSUPPORTED_TYPE: "Utilisez un fichier .csv ou .xlsx.",
    UNREADABLE: "Impossible de lire ce fichier. Réenregistrez-le en CSV ou XLSX et réessayez.",
    NO_ROWS: "Le fichier doit avoir une ligne d'en-têtes et au moins une ligne de données.",
    INVALID_REQUEST: "La requête est invalide. Rechargez la page et réessayez.",
    MISSING_COLUMNS: "Certaines colonnes requises ne sont pas associées.",
    CONFLICT: "Les données ont changé pendant l'importation (p. ex. SKU en double). Rien n'a été importé — validez de nouveau.",
  },
  codes: {
    FIRST_NAME_REQUIRED: "Prénom manquant",
    INVALID_EMAIL: "Courriel invalide",
    INVALID_PHONE: "Numéro de téléphone trop court",
    PLATE_REQUIRED: "Plaque manquante",
    MAKE_REQUIRED: "Marque manquante",
    MODEL_REQUIRED: "Modèle manquant",
    YEAR_INVALID: "Année manquante ou invalide",
    VIN_INVALID: "NIV invalide",
    CUSTOMER_MISSING: "Aucun client sur cette ligne",
    CUSTOMER_NOT_FOUND: "Propriétaire introuvable dans GarageOS",
    NAME_REQUIRED: "Nom manquant",
    PRICE_INVALID: "Prix manquant ou invalide",
    COST_INVALID: "Coût invalide",
    QUANTITY_INVALID: "La quantité doit être un entier ≥ 0",
    THRESHOLD_INVALID: "Le seuil doit être un entier ≥ 0",
    FIELD_TOO_LONG: "Une valeur est trop longue",
  },
  actionCreate: "créer",
  actionUpdate: "mettre à jour",
};

export const IMPORT_DICT: Record<AdminLocale, ImportDictionary> = { en, fr, es: en };
