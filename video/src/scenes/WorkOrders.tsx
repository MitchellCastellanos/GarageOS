import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COPY, type Locale } from "../locales";
import { BrowserFrame, DocFrame } from "../components/Frames";
import { BrandBackground } from "../components/BrandBackground";
import { LeftRail } from "../components/LeftRail";
import { Chip } from "../components/Chip";
import { Pop } from "../components/Pop";
import { easeInOut, prog } from "../components/motion";

const STARTS = [0, 128, 238, 340];

export const WorkOrders: React.FC<{ locale: Locale }> = ({ locale }) => {
  const c = COPY[locale];
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <BrandBackground glowX={72} glowY={50} />
      <LeftRail headline={c.work.headline} steps={c.work.steps} starts={STARTS} chip={c.provenance.sampleShop} />

      <Pop start={0} end={140} dy={50} style={{ left: 780, top: 150 }}>
        <BrowserFrame locale={locale} shot="13-work-order-desktop" width={1040} from={{ x: 0.5, y: 0.3, zoom: 1.0 }} to={{ x: 0.4, y: 0.55, zoom: 1.5 }} t={prog(f, 16, 125, easeInOut)} />
      </Pop>
      <Pop start={128} end={346} dx={-40} dy={30} style={{ left: 800, top: 200 }}>
        <DocFrame locale={locale} shot="15-invoice-pdf-page" width={480} height={621} from={{ x: 0.5, y: 0.5, zoom: 1.0 }} to={{ x: 0.5, y: 0.5, zoom: 1.0 }} t={prog(f, 136, 230, easeInOut)} />
      </Pop>
      <Pop start={238} end={346} dx={80} dy={20} style={{ left: 1340, top: 200 }}>
        <DocFrame locale={locale} shot="16-invoice-email" width={480} height={621} from={{ x: 0.5, y: 0.5, zoom: 1.0 }} to={{ x: 0.5, y: 0.5, zoom: 1.0 }} t={prog(f, 246, 336, easeInOut)} />
      </Pop>
      <Pop start={338} dx={80} dy={0} style={{ left: 780, top: 150 }}>
        <BrowserFrame locale={locale} shot="17-payment-record-desktop" width={1040} from={{ x: 0.5, y: 0.2, zoom: 1.1 }} to={{ x: 0.45, y: 0.22, zoom: 1.7 }} t={prog(f, 346, 424, easeInOut)} />
      </Pop>
      <Pop start={170} end={346} dy={10} style={{ left: 1090, top: 860 }}>
        <Chip text={c.provenance.sampleVisits} />
      </Pop>
    </AbsoluteFill>
  );
};
