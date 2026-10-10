// Canonical prospect-import fields. Dependency-free so client components (the mapping step) can import it.
export const IMPORT_FIELDS = [
  "name", "website", "address", "city", "province", "postalCode", "phone", "email", "industry", "shopSize", "locationCount", "currentSoftware",
  "externalId", "sourceUrl", "source", "sourceDetail", "preferredLanguage", "tags", "notes", "doNotContact",
  "contactName", "contactTitle", "contactEmail", "contactPhone", "contactLanguage", "decisionMaker",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
