import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COPY, type Locale } from "../locales";
import { BrowserFrame, PhoneFrame } from "../components/Frames";
import { BrandBackground } from "../components/BrandBackground";
import { LeftRail } from "../components/LeftRail";
import { Chip } from "../components/Chip";
import { Pop } from "../components/Pop";
import { easeInOut, prog } from "../components/motion";

const STARTS = [0, 100, 200];

export const Scheduling: React.FC<{ locale: Locale }> = ({ locale }) => {
  const c = COPY[locale];
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <BrandBackground glowX={75} glowY={45} />
      <LeftRail headline={c.booking.headline} steps={c.booking.steps} starts={STARTS} chip={c.provenance.sampleShop} />

      <Pop start={0} end={112} dy={50} style={{ left: 780, top: 150 }}>
        <BrowserFrame locale={locale} shot="01-dashboard-desktop" width={1040} from={{ x: 0.5, y: 0.4, zoom: 1 }} to={{ x: 0.68, y: 0.28, zoom: 1.6 }} t={prog(f, 24, 100, easeInOut)} />
      </Pop>
      <Pop start={104} end={212} dx={80} dy={0} style={{ left: 780, top: 150 }}>
        <BrowserFrame locale={locale} shot="02-agenda-desktop" width={1040} from={{ x: 0.5, y: 0.4, zoom: 1.05 }} to={{ x: 0.4, y: 0.4, zoom: 1.8 }} t={prog(f, 112, 200, easeInOut)} />
      </Pop>
      <Pop start={204} dx={80} dy={0} style={{ left: 760, top: 200 }}>
        <BrowserFrame locale={locale} shot="03-booking-desktop" width={880} from={{ x: 0.5, y: 0.3, zoom: 1.0 }} to={{ x: 0.5, y: 0.34, zoom: 1.12 }} t={prog(f, 210, 296, easeInOut)} />
      </Pop>
      <Pop start={232} dx={140} dy={20} style={{ left: 1530, top: 230 }}>
        <PhoneFrame locale={locale} shot="04-booking-mobile" width={310} from={{ x: 0.5, y: 0.3, zoom: 1 }} />
        <div style={{ marginTop: 22, textAlign: "center" }}>
          <Chip text={c.booking.mobileLabel} tone="blue" />
        </div>
      </Pop>
    </AbsoluteFill>
  );
};
