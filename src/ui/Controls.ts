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
  onToggleMute: () => void;
  onShare: () => void;
  onObserver: (mode: ObserverMode) => void;
  onMode: (mode: AppMode) => void;
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

    const make = (
      key: keyof SimulationState,
      label: string,
      min: number,
      max: number,
      step: number,
      color: string,
      format: (v: number) => string,
      advanced = false,
      onInput?: (v: number) => void,
    ) => {
      const knob = new Knob({
        label,
        min,
        max,
        step,
        value: s[key] as number,
        color,
        advanced,
        format,
        onInput:
          onInput ??
          ((v) =>
            this.store.update((st) => {
              (st as unknown as Record<string, number>)[key as string] = v;
              recomputeDerived(st);
            })),
      });
      this.knobs[key as string] = knob;
      grid.appendChild(knob.el);
    };

    make("massSolar", "Mass", 3, 50, 0.1, "#7fd0ff", (v) => `${v.toFixed(1)} M☉`);
    // Radius writes both radius and initial radius, but only when idle so it
    // does not fight the collapse animation.
    make(
      "radiusKm",
      "Radius",
      5,
      250,
      0.5,
      "#7fd0ff",
      (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} km`,
      false,
      (v) =>
        this.store.update((st) => {
          if (st.collapsing) return;
          st.radiusKm = v;
          st.initialRadiusKm = v;
          recomputeDerived(st);
        }),
    );
    make("vacuumEnergy", "Vacuum", 0, 1, 0.001, "#15d9f2", (v) => v.toFixed(2));
    make("shellTension", "Shell", 0, 1, 0.001, "#c08bff", (v) => v.toFixed(2));
    make("quantumNoise", "Noise", 0, 1, 0.001, "#ffb070", (v) => v.toFixed(2), true);
    make("entropyLeakage", "Entropy", 0, 1, 0.001, "#ff6fae", (v) => v.toFixed(2), true);
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
