// Central simulation state plus a tiny observable store.
//
// Per the concept (Section 24): start with the state machine. Everything
// visual and sonic is derived from this object.

export type Outcome =
  | "stable-star"
  | "black-hole"
  | "gravastar"
  | "unstable-collapse";

export type ObserverMode = "external" | "falling" | "interior";

export type AppMode = "explore" | "lab";

export type SpeculationLevel =
  | "accepted"
  | "theoretical"
  | "speculative"
  | "visual-metaphor";

export interface SimulationState {
  // Inputs (user controlled)
  massSolar: number;
  radiusKm: number;
  initialRadiusKm: number;

  vacuumEnergy: number;
  shellTension: number;
  quantumNoise: number;
  entropyLeakage: number;

  // Derived physics
  schwarzschildRadiusKm: number;
  compactness: number;

  // Timeline driven
  collapseProgress: number; // 0..1
  deSitterBubbleRadius: number; // 0..1
  shellFormation: number; // 0..1
  horizonOpacity: number; // 0..1

  // Modes / outcome
  observerMode: ObserverMode;
  appMode: AppMode;
  outcome: Outcome;
  speculationLevel: SpeculationLevel;

  // Runtime flags
  collapsing: boolean;
  insideInterior: boolean;
  muted: boolean;
  bounced: boolean; // the "Bounce" signature event has fired
}

export function createInitialState(): SimulationState {
  return {
    massSolar: 12,
    radiusKm: 100,
    initialRadiusKm: 100,

    vacuumEnergy: 0.4,
    shellTension: 0.4,
    quantumNoise: 0.1,
    entropyLeakage: 0.2,

    schwarzschildRadiusKm: 0,
    compactness: 0,

    collapseProgress: 0,
    deSitterBubbleRadius: 0,
    shellFormation: 0,
    horizonOpacity: 0,

    observerMode: "external",
    appMode: "explore",
    outcome: "stable-star",
    speculationLevel: "theoretical",

    collapsing: false,
    insideInterior: false,
    muted: false,
    bounced: false,
  };
}

/**
 * Minimal observable store. Components subscribe and are notified after any
 * mutation pushed through `set` / `patch`.
 */
export class Store {
  readonly state: SimulationState;
  private listeners = new Set<(s: SimulationState) => void>();

  constructor(initial: SimulationState) {
    this.state = initial;
  }

  patch(partial: Partial<SimulationState>): void {
    Object.assign(this.state, partial);
    this.emit();
  }

  /** Mutate in place via callback, then notify. */
  update(fn: (s: SimulationState) => void): void {
    fn(this.state);
    this.emit();
  }

  emit(): void {
    for (const l of this.listeners) l(this.state);
  }

  subscribe(fn: (s: SimulationState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }
}
