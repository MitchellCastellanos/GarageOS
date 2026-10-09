import { en } from "./en";
import { fr } from "./fr";
import type { Locale, LocaleCopy } from "./types";

export const COPY: Record<Locale, LocaleCopy> = { en, fr };
export const LOCALES: Locale[] = ["en", "fr"];
export * from "./types";
