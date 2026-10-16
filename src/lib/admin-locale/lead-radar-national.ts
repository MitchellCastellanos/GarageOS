// EN/FR copy for the national discovery engine (run quality gate, province readiness, worker controls). Typed so a missing French key fails the build.
const en = {
  errors: {
    NOTE_REQUIRED: "Write a reason of at least 10 characters.",
    RUN_NOT_ACKNOWLEDGEABLE: "Only a run stopped by the quality gate can be acknowledged.",
  } as Record<string, string>,
  quality: {
    title: "Run quality gate",
    verdicts: {
      OK: "Quality checks passed.",
      ZERO_RESULTS_LEGIT: "The extractor read rows but nothing matched the plan. This is a legitimate empty result, not a failure.",
      EXTRACTION_EMPTY_SUSPECT: "STOPPED: the run produced no records and the extractor did not confirm it read any data. This is an extraction failure, not an empty province.",
      NO_COORDINATES: "STOPPED: records arrived but none carried a position. The extraction must be redone with extractor 1.2.0 or later.",
      ALL_COORDINATES_REJECTED: "STOPPED: positions were present but every one failed the Canada/province plausibility check.",
      LOW_COORDINATE_COVERAGE: "STOPPED: too few records carry a valid position (the pipeline is losing coordinates).",
      HIGH_REJECTION: "STOPPED: most records were rejected by validation (wrong file shape or wrong scope).",
      COUNT_MISMATCH: "STOPPED: the number of records received differs from the manifest.",
    } as Record<string, string>,
    counters: { received: "Records received", withPoint: "Carrying a position", valid: "Valid positions", invalid: "Invalid positions", missing: "Without a position", coverage: "Position coverage" },
    ackTitle: "Acknowledge and release this run",
    ackHelp: "Only do this when you know why the gate fired (for example a territory with no mappable positions). Your reason is audited. The already-staged candidates then become visible to qualification.",
    ackLabel: "Reason (at least 10 characters)", ackButton: "Acknowledge and mark completed", ackedBy: "Acknowledged",
  },
  diag: { DUPLICATE_OF_STAGED: "Duplicate of an already staged business (kept as evidence, never imported)", POINT_MISSING: "Record without a position", POINT_OUT_OF_CANADA: "Position outside Canada", POINT_OUT_OF_PROVINCE: "Position outside its province" } as Record<string, string>,
};
type Dict = typeof en;
const fr: Dict = {
  errors: {
    NOTE_REQUIRED: "Écrivez une raison d’au moins 10 caractères.",
    RUN_NOT_ACKNOWLEDGEABLE: "Seule une exécution arrêtée par le contrôle de qualité peut être reconnue.",
  },
  quality: {
    title: "Contrôle de qualité de l’exécution",
    verdicts: {
      OK: "Les contrôles de qualité sont réussis.",
      ZERO_RESULTS_LEGIT: "L’extracteur a lu des lignes mais rien ne correspond au plan. C’est un résultat vide légitime, pas un échec.",
      EXTRACTION_EMPTY_SUSPECT: "ARRÊT : l’exécution n’a produit aucun enregistrement et l’extracteur n’a pas confirmé avoir lu de données. C’est un échec d’extraction, pas une province vide.",
      NO_COORDINATES: "ARRÊT : des enregistrements sont arrivés mais aucun ne portait de position. Il faut refaire l’extraction avec l’extracteur 1.2.0 ou plus récent.",
      ALL_COORDINATES_REJECTED: "ARRÊT : des positions étaient présentes mais toutes ont échoué au contrôle de plausibilité Canada/province.",
      LOW_COORDINATE_COVERAGE: "ARRÊT : trop peu d’enregistrements portent une position valide (le pipeline perd des coordonnées).",
      HIGH_REJECTION: "ARRÊT : la plupart des enregistrements ont été rejetés par la validation (mauvais format de fichier ou mauvaise portée).",
      COUNT_MISMATCH: "ARRÊT : le nombre d’enregistrements reçus diffère du manifeste.",
    },
    counters: { received: "Enregistrements reçus", withPoint: "Avec position", valid: "Positions valides", invalid: "Positions invalides", missing: "Sans position", coverage: "Couverture des positions" },
    ackTitle: "Reconnaître et libérer cette exécution",
    ackHelp: "À faire seulement si vous savez pourquoi le contrôle s’est déclenché (par exemple un territoire sans position cartographiable). Votre raison est journalisée. Les candidats déjà préparés deviennent alors visibles pour la qualification.",
    ackLabel: "Raison (au moins 10 caractères)", ackButton: "Reconnaître et marquer comme terminée", ackedBy: "Reconnue",
  },
  diag: { DUPLICATE_OF_STAGED: "Doublon d’une entreprise déjà préparée (conservé comme preuve, jamais importé)", POINT_MISSING: "Enregistrement sans position", POINT_OUT_OF_CANADA: "Position hors du Canada", POINT_OUT_OF_PROVINCE: "Position hors de sa province" },
};
export type NationalCopy = Dict;
export const nationalCopy = (l: "en" | "fr"): NationalCopy => (l === "fr" ? fr : en);
