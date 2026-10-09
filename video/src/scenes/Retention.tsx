import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COPY, type Locale } from "../locales";
import { BrowserFrame, DocFrame, PhoneFrame } from "../components/Frames";
import { BrandBackground } from "../components/BrandBackground";
import { LeftRail } from "../components/LeftRail";
import { Pop } from "../components/Pop";
import { easeInOut, prog } from "../components/motion";

const STARTS = [0, 104, 206];

export const Retention: React.FC<{ locale: Locale }> = ({ locale }) => {
  const c = COPY[locale];
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <BrandBackground glowX={72} glowY={45} />
      <LeftRail headline={c.retention.headline} steps={c.retention.steps} starts={STARTS} chip={c.provenance.sampleShop} />

      <Pop start={0} end={214} dy={50} style={{ left: 830, top: 150 }}>
        <PhoneFrame locale={locale} shot="18-customer-portal-mobile" width={380} from={{ x: 0.5, y: 0.3, zoom: 1 }} to={{ x: 0.5, y: 0.5, zoom: 1 }} t={prog(f, 30, 100, easeInOut)} />
      </Pop>
      <Pop start={104} end={214} dx={100} dy={20} style={{ left: 1310, top: 170 }}>
        <DocFrame locale={locale} shot="19-maintenance-reminder-email" width={540} height={700} from={{ x: 0.5, y: 0.25, zoom: 1.1 }} to={{ x: 0.5, y: 0.45, zoom: 1.1 }} t={prog(f, 112, 205, easeInOut)} />
      </Pop>
      <Pop start={206} dx={80} dy={0} style={{ left: 780, top: 150 }}>
        <BrowserFrame locale={locale} shot="21-campaign-editor-desktop" width={1040} from={{ x: 0.5, y: 0.3, zoom: 1.0 }} to={{ x: 0.3, y: 0.5, zoom: 1.5 }} t={prog(f, 214, 296, easeInOut)} />
      </Pop>
    </AbsoluteFill>
  );
};
