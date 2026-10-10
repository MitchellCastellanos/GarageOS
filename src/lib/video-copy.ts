// EN / Québec FR copy for every public video surface (home section, shareable page, player). Written, not translated word for word.
export type VideoCopyLang = "en" | "fr";

export interface PlayerLabels {
  play: string; pause: string; mute: string; unmute: string; volume: string; fullscreen: string; exitFullscreen: string; seek: string;
  resumeAt: (t: string) => string; replay: string; unavailable: string; retry: string; playVideo: (title: string) => string; seconds: (n: number) => string;
}
export const PLAYER_LABELS: Record<VideoCopyLang, PlayerLabels> = {
  en: { play: "Play", pause: "Pause", mute: "Mute", unmute: "Unmute", volume: "Volume", fullscreen: "Full screen", exitFullscreen: "Exit full screen", seek: "Seek", resumeAt: (t) => `Resume at ${t}`, replay: "Watch again", unavailable: "The video can’t be loaded right now.", retry: "Try again", playVideo: (t) => `Play video: ${t}`, seconds: (n) => `${n} sec` },
  fr: { play: "Lecture", pause: "Pause", mute: "Couper le son", unmute: "Activer le son", volume: "Volume", fullscreen: "Plein écran", exitFullscreen: "Quitter le plein écran", seek: "Position dans la vidéo", resumeAt: (t) => `Reprendre à ${t}`, replay: "Revoir la vidéo", unavailable: "Impossible de charger la vidéo pour le moment.", retry: "Réessayer", playVideo: (t) => `Lire la vidéo : ${t}`, seconds: (n) => `${n} s` },
};

export const HOME_VIDEO_COPY: Record<VideoCopyLang, { eyebrow: string; heading: string; description: string; teaserLink: string; fullLink: string; shareLink: string }> = {
  en: { eyebrow: "See it in action", heading: "GarageOS in 60 seconds", description: "A quick look at how one connected system runs the whole shop, from appointments and inspections to invoices and customer follow-up.", teaserLink: "Short on time? Watch the 15-second preview", fullLink: "Watch the full 60-second video", shareLink: "Open the video page" },
  fr: { eyebrow: "Voyez-le en action", heading: "GarageOS en 60 secondes", description: "Un coup d’œil rapide à la façon dont un seul système connecté gère tout l’atelier, des rendez-vous et inspections aux factures et au suivi des clients.", teaserLink: "Pressé? Regardez l’aperçu de 15 secondes", fullLink: "Regarder la vidéo complète de 60 secondes", shareLink: "Ouvrir la page de la vidéo" },
};

export const WATCH_COPY: Record<VideoCopyLang, {
  metaTitle: (kind: "commercial" | "teaser") => string; metaDescription: string;
  eyebrow: (kind: "commercial" | "teaser") => string; heading: string; sub: string; bullets: [string, string, string, string];
  ctaDemo: string; ctaInteractive: string; ctaTrial: string; fullVersion: string; switchTo: string; unavailableTitle: string; unavailableBody: string; noCardNote: string;
  measuring: string; privacy: string; sample: string; trialNote: string;
}> = {
  en: {
    metaTitle: (k) => (k === "teaser" ? "GarageOS in 15 seconds" : "GarageOS in 60 seconds"),
    metaDescription: "One connected system for independent repair shops: appointments, inspections, estimates, work orders, invoices and customer follow-up.",
    eyebrow: (k) => (k === "teaser" ? "15-second preview" : "60-second overview"),
    heading: "Your entire shop. One connected system.",
    sub: "GarageOS brings appointments, inspections, estimates, work orders, invoices and customer follow-up into one place, built for independent repair shops in Canada.",
    bullets: ["Appointments and online booking, organized", "Inspections and estimates your customers understand", "Work orders, branded invoices and payments in one place", "Reminders and follow-up that bring customers back"],
    ctaDemo: "Book your personalized demo", ctaInteractive: "Explore the interactive demo", ctaTrial: "Start your free trial", fullVersion: "Watch the full 60-second video", switchTo: "Français",
    unavailableTitle: "This video isn’t available right now", unavailableBody: "You can still see GarageOS in action or talk to us about a demo.", noCardNote: "No obligation. We’ll show you GarageOS with your own shop in mind.",
    measuring: "To follow up helpfully, GarageOS notes whether this video is played, linked to the email you received. No cookies and no third-party analytics. We honour your browser’s Do Not Track and Global Privacy Control signals.", privacy: "Privacy policy",
    sample: "Screens shown: Garage Laurent, a sample shop.", trialNote: "Free trial, $0 today.",
  },
  fr: {
    metaTitle: (k) => (k === "teaser" ? "GarageOS en 15 secondes" : "GarageOS en 60 secondes"),
    metaDescription: "Un seul système connecté pour les garages indépendants : rendez-vous, inspections, soumissions, bons de travail, factures et suivi des clients.",
    eyebrow: (k) => (k === "teaser" ? "Aperçu de 15 secondes" : "Présentation de 60 secondes"),
    heading: "Tout votre garage. Un seul système connecté.",
    sub: "GarageOS réunit rendez-vous, inspections, soumissions, bons de travail, factures et suivi des clients au même endroit, pour les garages indépendants du Canada.",
    bullets: ["Rendez-vous et réservation en ligne, bien organisés", "Inspections et soumissions faciles à comprendre pour vos clients", "Bons de travail, factures à votre image et paiements au même endroit", "Rappels et suivi pour que vos clients reviennent"],
    ctaDemo: "Réservez votre démo personnalisée", ctaInteractive: "Explorer la démo interactive", ctaTrial: "Démarrer l’essai gratuit", fullVersion: "Regarder la vidéo complète de 60 secondes", switchTo: "English",
    unavailableTitle: "Cette vidéo n’est pas disponible pour le moment", unavailableBody: "Vous pouvez tout de même voir GarageOS en action ou nous parler d’une démo.", noCardNote: "Sans engagement. Nous vous présentons GarageOS en pensant à votre atelier.",
    measuring: "Pour assurer un suivi pertinent, GarageOS note si cette vidéo est visionnée, en lien avec le courriel que vous avez reçu. Aucun témoin (cookie) et aucune analytique tierce. Nous respectons les signaux « Ne pas suivre » et Global Privacy Control de votre navigateur.", privacy: "Politique de confidentialité",
    sample: "Écrans présentés : Garage Laurent, un atelier fictif.", trialNote: "Essai gratuit, 0 $ aujourd’hui.",
  },
};
