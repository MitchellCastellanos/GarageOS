import React from "react";
import { AnimatedHeadline } from "./AnimatedHeadline";
import { StepList } from "./StepList";
import { Chip } from "./Chip";
import { Logo } from "./Logo";

export const RAIL_WIDTH = 640;

/** Shared left column: logo, headline, step list, optional provenance chip. */
export const LeftRail: React.FC<{ headline: string; steps: string[]; starts: number[]; chip?: string }> = ({ headline, steps, starts, chip }) => (
  <>
    <div style={{ position: "absolute", left: 96, top: 70 }}>
      <Logo size={44} />
    </div>
    <div style={{ position: "absolute", left: 96, top: 210 }}>
      <AnimatedHeadline text={headline} width={RAIL_WIDTH} maxLines={4} maxSize={80} minSize={46} start={4} />
    </div>
    <div style={{ position: "absolute", left: 96, top: 640 }}>
      <StepList steps={steps} starts={starts} width={RAIL_WIDTH} />
    </div>
    {chip ? (
      <div style={{ position: "absolute", left: 96, bottom: 180 }}>
        <Chip text={chip} />
      </div>
    ) : null}
  </>
);
