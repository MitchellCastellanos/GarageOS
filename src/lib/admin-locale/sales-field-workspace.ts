// Copy for the Field Planner 2.0 workspace (EN/FR). The French dictionary is typed against the English one.
import type { MapStatus } from "@/domain/sales-crm/field-map";

const en = {
  statuses: {
    PENDING: "Not contacted", NOT_VISITED: "Not visited", ATTEMPTED: "Visit attempted", FOLLOW_UP: "Follow-up required", INTERESTED: "Interested", DEMO_SCHEDULED: "Demo scheduled", WON: "Customer", LOST: "Lost / not interested",
  } as Record<MapStatus, string>,
  statusHelp: {
    PENDING: "Nothing recorded yet.", NOT_VISITED: "Contacted another way, never visited.", ATTEMPTED: "Visited, no real conversation yet.", FOLLOW_UP: "A follow-up task is open or was requested.",
    INTERESTED: "Engaged or interested in a demo.", DEMO_SCHEDULED: "A demo is agreed or done.", WON: "Became a customer.", LOST: "Closed, refused or not a fit.",
  } as Record<MapStatus, string>,
  filters: "Status filters", legend: "Legend", resetFilters: "Reset filters", allStatuses: "All statuses", searchName: "Search by name", clear: "Clear",
  counts: { territory: "In your territory", located: "On the map", inView: "In this view", matching: "Match filters", stops: "Route stops", loading: "Updating map…", truncated: "Very dense area: zoom in for exact results.", failed: "Could not refresh the map. Pull to retry by moving the map.", zoomIn: "Zoom in to see individual shops." },
  where: {
    title: "Where are you?", nearMe: "Use my location", nearMeHelp: "Asks your browser for ONE position when you tap. Nothing is tracked in the background.", locating: "Locating…", denied: "Location permission was denied or unavailable. Search a place instead.",
    place: "Search a city, neighbourhood, street or postal code", go: "Go", noPlace: "None of your prospects match that place.", placeNote: "Searches your own prospects' addresses; no paid map search is used.", radius: "Radius", km: "km",
    nearby: "Nearest to you", nearbyNone: "No matching prospect in this radius.", nearbyOf: "within the radius", away: "away",
  },
  unlocated: { title: "Prospects not on the map yet", intro: "These cannot be placed because the position is missing or uncertain. Positions are added automatically; nothing to do unless the address is wrong.", more: "more", reasons: { PENDING: "Locating automatically", AMBIGUOUS_FAILED: "Ambiguous or not found", INSUFFICIENT_ADDRESS: "Address incomplete", LOCATED: "Located" } as Record<string, string> },
  panel: { close: "Close", addToRoute: "Add to route", removeFromRoute: "Remove from route", inRoute: "On your route", routeFull: "The route is full (25 stops). Remove a stop to add another; the map still shows everything.", navigate: "Navigate", call: "Call", openProspect: "Open prospect", recordResult: "Record visit result", hideResult: "Hide result form", lastVisit: "Last visit", nextTask: "Next task", never: "Never visited", loading: "Loading…", blocked: "Cannot be visited:", activeStop: "This is a stop of the route you are running.", recorded: "Saved. The CRM, the marker and your route are up to date." },
  route: { title: "Route being prepared", count: "stops", empty: "Tap a marker, then “Add to route”. Everything else stays on the map.", save: "Save draft", suggest: "Optimize order", open: "Route", clear: "Remove all" },
  list: { title: "Shops in view", showing: "Showing", of: "of", none: "No prospect matches the current filters in this view.", noMap: "The interactive map is not configured on this deployment, so shops are listed instead." },
  map: { title: "Territory map", select: "Select", stop: "Stop", cluster: "shops (tap to zoom in)", you: "Your position", unavailable: "The map could not be loaded. The list below still works." },
};

type Dict = typeof en;

const fr: Dict = {
  statuses: {
    PENDING: "Non contacté", NOT_VISITED: "Non visité", ATTEMPTED: "Visite tentée", FOLLOW_UP: "Suivi requis", INTERESTED: "Intéressé", DEMO_SCHEDULED: "Démo planifiée", WON: "Client", LOST: "Perdu / pas intéressé",
  },
  statusHelp: {
    PENDING: "Rien d’enregistré.", NOT_VISITED: "Contacté autrement, jamais visité.", ATTEMPTED: "Visité, sans vraie conversation.", FOLLOW_UP: "Une tâche de suivi est ouverte ou demandée.",
    INTERESTED: "Engagé ou intéressé par une démo.", DEMO_SCHEDULED: "Une démo est convenue ou faite.", WON: "Devenu client.", LOST: "Fermé, refusé ou non pertinent.",
  },
  filters: "Filtres de statut", legend: "Légende", resetFilters: "Réinitialiser les filtres", allStatuses: "Tous les statuts", searchName: "Chercher par nom", clear: "Effacer",
  counts: { territory: "Dans votre territoire", located: "Sur la carte", inView: "Dans cette vue", matching: "Correspondent aux filtres", stops: "Arrêts de la route", loading: "Mise à jour de la carte…", truncated: "Zone très dense : zoomez pour des résultats exacts.", failed: "Impossible d’actualiser la carte. Déplacez la carte pour réessayer.", zoomIn: "Zoomez pour voir chaque commerce." },
  where: {
    title: "Où êtes-vous ?", nearMe: "Utiliser ma position", nearMeHelp: "Demande UNE position à votre navigateur quand vous touchez. Aucun suivi en arrière-plan.", locating: "Localisation…", denied: "Permission de localisation refusée ou indisponible. Cherchez plutôt un lieu.",
    place: "Chercher une ville, un quartier, une rue ou un code postal", go: "Aller", noPlace: "Aucun de vos prospects ne correspond à ce lieu.", placeNote: "Recherche dans les adresses de vos propres prospects ; aucune recherche cartographique payante.", radius: "Rayon", km: "km",
    nearby: "Les plus proches", nearbyNone: "Aucun prospect correspondant dans ce rayon.", nearbyOf: "dans le rayon", away: "de distance",
  },
  unlocated: { title: "Prospects pas encore sur la carte", intro: "Ils ne peuvent pas être placés : position manquante ou incertaine. Les positions s’ajoutent automatiquement ; rien à faire sauf si l’adresse est erronée.", more: "de plus", reasons: { PENDING: "Localisation automatique", AMBIGUOUS_FAILED: "Ambigu ou introuvable", INSUFFICIENT_ADDRESS: "Adresse incomplète", LOCATED: "Localisé" } },
  panel: { close: "Fermer", addToRoute: "Ajouter à la route", removeFromRoute: "Retirer de la route", inRoute: "Sur votre route", routeFull: "La route est pleine (25 arrêts). Retirez un arrêt pour en ajouter un autre ; la carte montre toujours tout.", navigate: "Naviguer", call: "Appeler", openProspect: "Ouvrir le prospect", recordResult: "Enregistrer le résultat de la visite", hideResult: "Masquer le formulaire", lastVisit: "Dernière visite", nextTask: "Prochaine tâche", never: "Jamais visité", loading: "Chargement…", blocked: "Visite impossible :", activeStop: "C’est un arrêt de la route en cours.", recorded: "Enregistré. Le CRM, le marqueur et votre route sont à jour." },
  route: { title: "Route en préparation", count: "arrêts", empty: "Touchez un marqueur puis « Ajouter à la route ». Tout le reste reste sur la carte.", save: "Enregistrer le brouillon", suggest: "Optimiser l’ordre", open: "Route", clear: "Tout retirer" },
  list: { title: "Commerces dans la vue", showing: "Affichage de", of: "sur", none: "Aucun prospect ne correspond aux filtres dans cette vue.", noMap: "La carte interactive n’est pas configurée sur ce déploiement ; les commerces sont donc listés." },
  map: { title: "Carte du territoire", select: "Sélectionner", stop: "Arrêt", cluster: "commerces (touchez pour zoomer)", you: "Votre position", unavailable: "La carte n’a pas pu se charger. La liste ci-dessous fonctionne toujours." },
};

export type WorkspaceCopy = Dict;
export const workspaceCopy = (locale: "en" | "fr"): WorkspaceCopy => (locale === "fr" ? fr : en);
