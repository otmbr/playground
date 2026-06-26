import type { AppMode, ObserverMode, SimulationState, Store } from "../core/SimulationState.ts";
import { recomputeDerived } from "../core/PhysicsToyModel.ts";
import { Knob } from "./Knob.ts";

// Wires the control-deck DOM to the store. The parameter inputs are modern
// rotary knobs (see Knob.ts); this class builds them, binds them to the store
// and reflects external state changes back onto them.

function el(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

export interface ControlCallbacks {
  onCollapse: () => void;
  onReset: () => void;
  onEnterInterior: () => void;
  onToggleHonesty: () => void;
  onScience: () => void;
  onToggleMute: () => void;
  onShare: () => void;
  onObserver: (mode: ObserverMode) => void;
  onMode: (mode: AppMode) => void;
  onHint: (hint: string) => void;
}

interface KnobDef {
  key: keyof SimulationState;
  label: string;
  min: number;
  max: number;
  step: number;
  color: string;
  hint: string;
  format: (v: number) => string;
  advanced?: boolean;
  onInput?: (v: number) => void;
}

export class Controls {
  private knobs: Record<string, Knob> = {};
  private interiorButton = el("interiorButton") as HTMLButtonElement;
  private muteButton = el("muteButton") as HTMLButtonElement;

  constructor(
    private store: Store,
    private cb: ControlCallbacks,
  ) {
    this.buildKnobs();

    el("collapseButton").addEventListener("click", () => this.cb.onCollapse());
    el("resetButton").addEventListener("click", () => this.cb.onReset());
    this.interiorButton.addEventListener("click", () => this.cb.onEnterInterior());
    el("honestyButton").addEventListener("click", () => this.cb.onToggleHonesty());
    el("scienceButton").addEventListener("click", () => this.cb.onScience());
    this.muteButton.addEventListener("click", () => this.cb.onToggleMute());
    el("shareButton").addEventListener("click", () => this.cb.onShare());

    for (const btn of document.querySelectorAll<HTMLButtonElement>(".obs")) {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".obs").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.cb.onObserver(btn.dataset.observer as ObserverMode);
      });
    }
    for (const btn of document.querySelectorAll<HTMLButtonElement>(".mode")) {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.mode as AppMode;
        document.body.dataset.appmode = mode;
        this.cb.onMode(mode);
      });
    }
    document.body.dataset.appmode = "explore";
  }

  private buildKnobs(): void {
    const grid = el("knobGrid");
    const s = this.store.state;

    const sun = " M☉";
    const defs: KnobDef[] = [
      {
        key: "massSolar",
        label: "Mass",
        min: 3,
        max: 50,
        step: 0.1,
        color: "#7fd0ff",
        hint: "Mass sets the Schwarzschild radius rₛ (real GR): rₛ = 2GM/c².",
        format: (v) => `${v.toFixed(1)}${sun}`,
      },
      {
        key: "radiusKm",
        label: "Radius",
        min: 5,
        max: 250,
        step: 0.5,
        color: "#7fd0ff",
        hint: "How compressed the star is. Smaller radius → higher compactness C = rₛ/2R.",
        format: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} km`,
        // Radius writes both radius and initial radius, but only when idle so
        // it does not fight the collapse animation.
        onInput: (v) =>
          this.store.update((st) => {
            if (st.collapsing) return;
            st.radiusKm = v;
            st.initialRadiusKm = v;
            recomputeDerived(st);
          }),
      },
      {
        key: "vacuumEnergy",
        label: "Vacuum",
        min: 0,
        max: 1,
        step: 0.001,
        color: "#15d9f2",
        hint: "Dark-energy-like outward pressure of the interior — what can halt collapse.",
        format: (v) => v.toFixed(2),
      },
      {
        key: "shellTension",
        label: "Shell",
        min: 0,
        max: 1,
        step: 0.001,
        color: "#c08bff",
        hint: "Stability of the balance boundary between infall and outward expansion.",
        format: (v) => v.toFixed(2),
      },
      {
        key: "quantumNoise",
        label: "Noise",
        min: 0,
        max: 1,
        step: 0.001,
        color: "#ffb070",
        hint: "Instability / uncertainty near the limit — pushes toward collapse.",
        format: (v) => v.toFixed(2),
        advanced: true,
      },
      {
        key: "entropyLeakage",
        label: "Entropy",
        min: 0,
        max: 1,
        step: 0.001,
        color: "#ff6fae",
        hint: "How information behaves at the boundary — freezes at a horizon, sticks to a shell.",
        format: (v) => v.toFixed(2),
        advanced: true,
      },
    ];

    for (const d of defs) {
      const knob = new Knob({
        label: d.label,
        min: d.min,
        max: d.max,
        step: d.step,
        value: s[d.key] as number,
        color: d.color,
        advanced: d.advanced,
        hint: d.hint,
        onHint: (h) => this.cb.onHint(h),
        format: d.format,
        onInput:
          d.onInput ??
          ((v) =>
            this.store.update((st) => {
              (st as unknown as Record<string, number>)[d.key as string] = v;
              recomputeDerived(st);
            })),
      });
      this.knobs[d.key as string] = knob;
      grid.appendChild(knob.el);
    }
  }

  setInteriorEnabled(enabled: boolean): void {
    this.interiorButton.disabled = !enabled;
  }

  setMuted(muted: boolean): void {
    this.muteButton.setAttribute("aria-pressed", String(muted));
    this.muteButton.textContent = muted ? "Unmute" : "Mute";
  }

  /** Reflect store values onto the knobs (skips any knob being dragged). */
  render(): void {
    const s = this.store.state;
    this.knobs.massSolar?.setValue(s.massSolar);
    this.knobs.radiusKm?.setValue(s.radiusKm);
    this.knobs.vacuumEnergy?.setValue(s.vacuumEnergy);
    this.knobs.shellTension?.setValue(s.shellTension);
    this.knobs.quantumNoise?.setValue(s.quantumNoise);
    this.knobs.entropyLeakage?.setValue(s.entropyLeakage);
  }
}
