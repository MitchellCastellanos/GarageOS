import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COPY, type Locale } from "../locales";
import { BrowserFrame, PhoneFrame } from "../components/Frames";
import { BrandBackground } from "../components/BrandBackground";
import { LeftRail } from "../components/LeftRail";
import { Chip } from "../components/Chip";
import { Pop } from "../components/Pop";
import { easeInOut, prog } from "../components/motion";

const STARTS = [0, 108, 208, 304];

/**
 * Inspection and estimate are different sample visits in the capture set (see docs/demo-journey/validation.md),
 * so they are shown as two separate pairs and the left rail says "sample visits".
 */
export const Inspection: React.FC<{ locale: Locale }> = ({ locale }) => {
  const c = COPY[locale];
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <BrandBackground glowX={70} glowY={55} />
      <LeftRail headline={c.inspection.headline} steps={c.inspection.steps} starts={STARTS} chip={c.provenance.sampleVisits} />

      <Pop start={0} end={216} dy={50} style={{ left: 760, top: 190 }}>
        <BrowserFrame locale={locale} shot="08-inspection-admin-desktop" width={880} from={{ x: 0.5, y: 0.3, zoom: 1.0 }} to={{ x: 0.35, y: 0.62, zoom: 1.5 }} t={prog(f, 20, 190, easeInOut)} />
      </Pop>
      <Pop start={108} end={216} dx={140} dy={20} style={{ left: 1530, top: 230 }}>
        <PhoneFrame locale={locale} shot="09-inspection-report-mobile" width={310} from={{ x: 0.5, y: 0.2, zoom: 1 }} />
      </Pop>

      <Pop start={208} dx={80} dy={0} style={{ left: 760, top: 190 }}>
        <BrowserFrame locale={locale} shot="10-estimate-editor-desktop" width={880} from={{ x: 0.4, y: 0.3, zoom: 1.0 }} to={{ x: 0.36, y: 0.6, zoom: 1.45 }} t={prog(f, 216, 330, easeInOut)} />
      </Pop>
      <Pop start={306} dx={140} dy={20} style={{ left: 1530, top: 230 }}>
        <PhoneFrame locale={locale} shot="11-estimate-customer-mobile" width={310} from={{ x: 0.5, y: 0.2, zoom: 1 }} to={{ x: 0.5, y: 0.62, zoom: 1 }} t={prog(f, 330, 390, easeInOut)} />
        <div style={{ marginTop: 22, textAlign: "center" }}>
          <Chip text={c.provenance.anotherVisit} />
        </div>
      </Pop>
    </AbsoluteFill>
  );
};
