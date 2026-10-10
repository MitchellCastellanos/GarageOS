// CRM wording for the video engagement summary and timeline detail (EN / Québec FR).
export type VideoProgress = "none" | "viewed" | "played" | "25" | "50" | "75" | "complete";
export interface VideoCrmCopy {
  title: string; empty: string; hint: string;
  kinds: { commercial: string; teaser: string }; languages: { EN: string; FR: string };
  progress: Record<VideoProgress, string>; demoAsked: string; afterWatching: string; lastActivity: string; sent: string;
}
export const VIDEO_CRM_COPY: Record<"en" | "fr", VideoCrmCopy> = {
  en: {
    title: "Video engagement", empty: "No video sent to this prospect yet.", hint: "Opening the page is not the same as watching: “watched” only counts real playback started by the visitor.",
    kinds: { commercial: "60-second commercial", teaser: "15-second teaser" }, languages: { EN: "English", FR: "French" },
    progress: { none: "Sent, not opened", viewed: "Opened the page, has not pressed play", played: "Started watching", "25": "Watched about 25%", "50": "Watched about 50%", "75": "Watched about 75%", complete: "Watched to the end" },
    demoAsked: "Asked for a demo", afterWatching: "after watching", lastActivity: "Last activity", sent: "Sent",
  },
  fr: {
    title: "Intérêt pour la vidéo", empty: "Aucune vidéo n’a encore été envoyée à ce prospect.", hint: "Ouvrir la page n’est pas regarder : « regardé » ne compte que la lecture réelle lancée par le visiteur.",
    kinds: { commercial: "publicité de 60 secondes", teaser: "aperçu de 15 secondes" }, languages: { EN: "anglais", FR: "français" },
    progress: { none: "Envoyée, non ouverte", viewed: "A ouvert la page, n’a pas lancé la lecture", played: "A commencé à regarder", "25": "A regardé environ 25 %", "50": "A regardé environ 50 %", "75": "A regardé environ 75 %", complete: "A regardé jusqu’à la fin" },
    demoAsked: "A demandé une démo", afterWatching: "après avoir regardé", lastActivity: "Dernière activité", sent: "Envoyée",
  },
};
