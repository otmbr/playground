// Qualitative toy physics. NOT a GR solver.
//
// Real, simple, meaningful equations are used where possible (Schwarzschild
// radius, compactness). The outcome thresholds are artistic / toy-model values
// inspired by Jampolski & Rezzolla (2026), not physical predictions.

import { easeInCubic, lerp, smoothstep } from "./math.ts";
import type { Outcome, SimulationState } from "./SimulationState.ts";

const G = 6.6743e-11; // m^3 kg^-1 s^-2
const C = 299792458; // m/s
const SOLAR_MASS = 1.98847e30; // kg

/** Schwarzschild radius in km for a given mass in solar masses. */
export function schwarzschildRadiusKm(massSolar: number): number {
  const massKg = massSolar * SOLAR_MASS;
  return (2 * G * massKg) / (C * C) / 1000;
}

/**
 * Compactness C = r_s / (2 R). For a black hole-forming object C -> 0.5
 * (R -> r_s). The paper reports a maximum initial compactness of C = 3/8
 * above which collapse to a black hole is inevitable in their setup.
 */
export function compactness(massSolar: number, radiusKm: number): number {
  const rs = schwarzschildRadiusKm(massSolar);
  return rs / (2 * radiusKm);
}

/**
 * Resolve which of the three fates the current parameters favour.
 *
 * The thresholds here are toy-model values: a balance between the inward
 * "collapse drive" (gravity, noise) and the outward "expansion drive"
 * (dark-energy-like vacuum pressure, shell tension).
 */
export function resolveOutcome(state: SimulationState): Outcome {
  const c = state.compactness;
  const vacuum = state.vacuumEnergy;
  const shell = state.shellTension;
  const noise = state.quantumNoise;

  const collapseDrive = c * 1.4 + noise * 0.15;
  const expansionDrive = vacuum * 0.75 + shell * 0.55;

  if (c < 0.18) return "stable-star";

  if (c > 0.375 && expansionDrive < collapseDrive) {
    return "black-hole";
  }

  if (c >= 0.28 && c <= 0.5 && expansionDrive >= collapseDrive) {
    return "gravastar";
  }

  // In the awkward middle, gravity usually wins unless expansion is strong.
  if (expansionDrive >= collapseDrive && c >= 0.18) {
    return "gravastar";
  }
  if (c >= 0.375) return "black-hole";

  return "unstable-collapse";
}

/** Recompute derived quantities (rs, compactness, predicted outcome). */
export function recomputeDerived(state: SimulationState): void {
  state.schwarzschildRadiusKm = schwarzschildRadiusKm(state.massSolar);
  state.compactness = compactness(state.massSolar, state.radiusKm);
  state.outcome = resolveOutcome(state);
  state.speculationLevel = speculationForOutcome(state.outcome);
}

export function speculationForOutcome(outcome: Outcome): SimulationState["speculationLevel"] {
  switch (outcome) {
    case "stable-star":
      return "accepted";
    case "black-hole":
      return "accepted";
    case "gravastar":
      return "theoretical";
    case "unstable-collapse":
      return "visual-metaphor";
  }
}

/**
 * Advance the timeline. `t` is the normalized collapse progress 0..1.
 *
 * Collapse timeline (Section 13):
 *   t=0.00 stable star          t=0.65 critical compactness
 *   t=0.25 collapse begins      t=0.72 de Sitter nucleation possible
 *   t=0.50 core compression     t=0.84 shell formation
 *                               t=1.00 black hole or gravastar
 */
export function updateTimeline(state: SimulationState, t: number): void {
  state.collapseProgress = t;

  // Radius shrinks from initial toward (just above) the Schwarzschild radius.
  const target = Math.max(state.schwarzschildRadiusKm * 0.92, 1);
  state.radiusKm = lerp(state.initialRadiusKm, target, easeInCubic(t));
  // Keep derived compactness in sync as the radius shrinks.
  state.compactness = compactness(state.massSolar, state.radiusKm);

  if (state.outcome === "gravastar") {
    state.deSitterBubbleRadius = smoothstep(0.68, 0.95, t);
    state.shellFormation = smoothstep(0.72, 0.98, t);
    state.horizonOpacity = 0;
  } else if (state.outcome === "black-hole" || state.outcome === "unstable-collapse") {
    state.deSitterBubbleRadius = 0;
    state.shellFormation = 0;
    state.horizonOpacity = smoothstep(0.7, 1, t);
  } else {
    // stable star: nothing dramatic happens
    state.deSitterBubbleRadius = 0;
    state.shellFormation = 0;
    state.horizonOpacity = 0;
  }
}

/** Has the "mini Big Bang" trigger condition been met? (Section 15) */
export function bounceReady(state: SimulationState): boolean {
  return (
    state.outcome === "gravastar" &&
    state.collapseProgress > 0.68 &&
    state.vacuumEnergy + state.shellTension > 0.6
  );
}
