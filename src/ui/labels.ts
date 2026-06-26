import type { Outcome, SpeculationLevel } from "../core/SimulationState.ts";

// Scientific honesty system (Section 9). Every major claim gets a label.

export const SPECULATION_LABEL: Record<SpeculationLevel, string> = {
  accepted: "Accepted",
  theoretical: "Theoretical",
  speculative: "Speculative",
  "visual-metaphor": "Visual Metaphor",
};

export interface LegendEntry {
  claim: string;
  level: SpeculationLevel;
  note: string;
}

export const LEGEND: LegendEntry[] = [
  {
    claim: "Schwarzschild radius",
    level: "accepted",
    note: "Standard result of General Relativity.",
  },
  {
    claim: "Compactness C = rₛ / 2R",
    level: "accepted",
    note: "A geometric ratio, not a prediction of fate.",
  },
  {
    claim: "Singularity in classical GR",
    level: "accepted",
    note: "Accepted as a breakdown of the classical model, not a place we understand.",
  },
  {
    claim: "Event horizon / black-hole path",
    level: "accepted",
    note: "Classical collapse to a black hole is the standard expectation.",
  },
  {
    claim: "Dynamic gravastar formation",
    level: "theoretical",
    note: "A possible formation path within GR (Jampolski & Rezzolla, 2026). Not observed.",
  },
  {
    claim: "Mini Big Bang interior (de Sitter region)",
    level: "theoretical",
    note: "A scientifically motivated visual metaphor for an expanding interior.",
  },
  {
    claim: "Outcome thresholds in this app",
    level: "visual-metaphor",
    note: "Artistic toy-model values inspired by the literature, not physical predictions.",
  },
  {
    claim: "Nested shells / Heresy Mode",
    level: "speculative",
    note: "Speculative fiction / extended metaphor.",
  },
];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  "stable-star": "Stable star",
  "black-hole": "Classical black hole",
  gravastar: "Gravastar candidate",
  "unstable-collapse": "Unstable collapse",
};

export const OUTCOME_INTERIOR: Record<Outcome, string> = {
  "stable-star": "Ordinary matter",
  "black-hole": "Inaccessible",
  gravastar: "De Sitter-like vacuum",
  "unstable-collapse": "Uncertain",
};

/** Short status copy shown during/after collapse for each outcome. */
export const OUTCOME_COPY: Record<Outcome, string[]> = {
  "stable-star": ["Stable star.", "Gravity and pressure in balance."],
  "black-hole": [
    "Classical black-hole path.",
    "Event horizon formed.",
    "Interior inaccessible.",
  ],
  gravastar: [
    "Interior expansion detected.",
    "A de Sitter-like region has nucleated.",
    "Collapse and expansion have reached equilibrium.",
  ],
  "unstable-collapse": [
    "Unstable collapse.",
    "No equilibrium reached in this configuration.",
  ],
};
