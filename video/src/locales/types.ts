export type Locale = "en" | "fr";
export type SceneId = "hook" | "booking" | "inspection" | "work" | "retention" | "closing";
export type TeaserSceneId = "hook" | "booking" | "inspection" | "invoice" | "closing";

export interface LocaleCopy {
  locale: Locale;
  /** Visible, localized strings per scene. */
  hook: { headline: string; areas: [string, string, string, string, string]; tag: string };
  booking: { headline: string; steps: [string, string, string]; mobileLabel: string };
  inspection: {
    headline: string;
    steps: [string, string, string, string];
  };
  work: { headline: string; steps: [string, string, string, string] };
  retention: { headline: string; steps: [string, string, string] };
  closing: { headline: string; cta: string; website: string; sampleNote: string };
  /** Honest provenance chips shown near screenshots. */
  provenance: { sampleShop: string; anotherVisit: string; sampleVisits: string };
  teaser: Record<TeaserSceneId, { headline: string; sub?: string }>;
  /** Full-commercial narration, one segment per scene. */
  narration: Record<SceneId, string>;
  /**
   * Teaser narration as recorded: one continuous take, cut at its natural pauses into these segments.
   * `scene` is the scene whose visuals the segment starts on; a segment may run on into the next scene.
   */
  teaserNarration: { scene: TeaserSceneId; script: string }[];
}
