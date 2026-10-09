import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BRAND, FONT_BODY, FONT_DISPLAY } from "../config/branding";
import { COPY, type Locale, type TeaserSceneId } from "../locales";
import { BrowserFrame, DocFrame, PhoneFrame } from "../components/Frames";
import { AnimatedHeadline } from "../components/AnimatedHeadline";
import { BrandBackground } from "../components/BrandBackground";
import { Logo } from "../components/Logo";
import { Chip } from "../components/Chip";
import { Pop } from "../components/Pop";
import { easeInOut, lerp, prog } from "../components/motion";

/** Teaser slide: oversized headline on the left, a single hero composition on the right. Faster, tighter rhythm than the full film. */
const Slide: React.FC<{ locale: Locale; id: TeaserSceneId; glow?: number; children: React.ReactNode; chip?: string }> = ({ locale, id, glow = 70, children, chip }) => {
  const t = COPY[locale].teaser[id];
  return (
    <AbsoluteFill>
      <BrandBackground glowX={glow} glowY={50} />
      <div style={{ position: "absolute", left: 90, top: 66 }}>
        <Logo size={40} />
      </div>
      <div style={{ position: "absolute", left: 90, top: 250 }}>
        <AnimatedHeadline text={t.headline} width={660} maxLines={4} maxSize={92} minSize={48} start={2} />
        {t.sub ? (
          <div style={{ marginTop: 28, fontFamily: FONT_BODY, fontWeight: 500, fontSize: 36, color: BRAND.muted }}>{t.sub}</div>
        ) : null}
      </div>
      {chip ? (
        <div style={{ position: "absolute", left: 90, bottom: 180 }}>
          <Chip text={chip} />
        </div>
      ) : null}
      {children}
    </AbsoluteFill>
  );
};

export const TeaserHook: React.FC<{ locale: Locale }> = ({ locale }) => {
  const f = useCurrentFrame();
  const t = COPY[locale].teaser.hook;
  const rise = prog(f, 26, 62);
  return (
    <AbsoluteFill>
      <BrandBackground glowX={50} glowY={65} />
      <div style={{ position: "absolute", left: 96, top: 70 }}>
        <Logo size={40} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "flex", justifyContent: "center" }}>
        <AnimatedHeadline text={t.headline} width={1500} maxLines={2} maxSize={110} minSize={56} align="center" start={2} />
      </div>
      <div style={{ position: "absolute", left: 960 - 520, top: lerp(1000, 450, rise), opacity: rise }}>
        <BrowserFrame locale={locale} shot="01-dashboard-desktop" width={1040} from={{ x: 0.5, y: 0.3, zoom: 1.0 }} to={{ x: 0.5, y: 0.38, zoom: 1.1 }} t={prog(f, 30, 90, easeInOut)} />
      </div>
    </AbsoluteFill>
  );
};

export const TeaserBooking: React.FC<{ locale: Locale }> = ({ locale }) => {
  const f = useCurrentFrame();
  return (
    <Slide locale={locale} id="booking" glow={75}>
      <Pop start={4} dx={80} dy={0} enter={16} style={{ left: 800, top: 190 }}>
        <BrowserFrame locale={locale} shot="02-agenda-desktop" width={820} from={{ x: 0.5, y: 0.4, zoom: 1.1 }} to={{ x: 0.4, y: 0.42, zoom: 1.7 }} t={prog(f, 6, 90, easeInOut)} />
      </Pop>
      <Pop start={34} dx={110} dy={20} enter={16} style={{ left: 1500, top: 250 }}>
        <PhoneFrame locale={locale} shot="04-booking-mobile" width={320} from={{ x: 0.5, y: 0.3, zoom: 1 }} />
      </Pop>
    </Slide>
  );
};

export const TeaserInspection: React.FC<{ locale: Locale }> = ({ locale }) => {
  const f = useCurrentFrame();
  return (
    <Slide locale={locale} id="inspection" glow={70} chip={COPY[locale].provenance.sampleVisits}>
      <Pop start={4} dx={80} dy={0} enter={16} style={{ left: 800, top: 190 }}>
        <BrowserFrame locale={locale} shot="10-estimate-editor-desktop" width={820} from={{ x: 0.4, y: 0.3, zoom: 1.0 }} to={{ x: 0.36, y: 0.6, zoom: 1.45 }} t={prog(f, 6, 80, easeInOut)} />
      </Pop>
      <Pop start={26} dx={110} dy={20} enter={16} style={{ left: 1500, top: 250 }}>
        <PhoneFrame locale={locale} shot="09-inspection-report-mobile" width={320} from={{ x: 0.5, y: 0.2, zoom: 1 }} />
      </Pop>
    </Slide>
  );
};

export const TeaserInvoice: React.FC<{ locale: Locale }> = ({ locale }) => {
  const f = useCurrentFrame();
  return (
    <Slide locale={locale} id="invoice" glow={72}>
      <Pop start={2} dx={60} dy={0} enter={14} style={{ left: 790, top: 190 }}>
        <BrowserFrame locale={locale} shot="13-work-order-desktop" width={860} from={{ x: 0.5, y: 0.3, zoom: 1.0 }} to={{ x: 0.4, y: 0.5, zoom: 1.35 }} t={prog(f, 4, 70, easeInOut)} />
      </Pop>
      <Pop start={22} dx={90} dy={20} enter={14} style={{ left: 1420, top: 300 }}>
        <DocFrame locale={locale} shot="15-invoice-pdf-page" width={400} height={518} from={{ x: 0.5, y: 0.3, zoom: 1.05 }} />
      </Pop>
    </Slide>
  );
};

export const TeaserClosing: React.FC<{ locale: Locale }> = ({ locale }) => {
  const c = COPY[locale];
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <BrandBackground glowX={50} glowY={50} intensity={1.3} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 170, display: "flex", justifyContent: "center", opacity: prog(f, 0, 14), transform: `scale(${lerp(0.92, 1, prog(f, 0, 20))})` }}>
        <Logo size={104} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 380, display: "flex", justifyContent: "center" }}>
        <AnimatedHeadline text={c.teaser.closing.headline} width={1500} maxLines={2} maxSize={80} minSize={46} align="center" start={8} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 620, display: "flex", flexDirection: "column", alignItems: "center", gap: 24, opacity: prog(f, 26, 42) }}>
        <div style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 40, color: BRAND.white, background: BRAND.blue, borderRadius: 99, padding: "22px 56px", boxShadow: "0 20px 50px -12px rgba(23,105,255,0.6)" }}>
          {c.closing.cta}
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 52, letterSpacing: 2, color: BRAND.brightBlue }}>{c.closing.website}</div>
      </div>
    </AbsoluteFill>
  );
};

export const TEASER_COMPONENTS: Record<TeaserSceneId, React.FC<{ locale: Locale }>> = {
  hook: TeaserHook,
  booking: TeaserBooking,
  inspection: TeaserInspection,
  invoice: TeaserInvoice,
  closing: TeaserClosing,
};
