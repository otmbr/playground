import type { AppMode, ObserverMode, Store } from "../core/SimulationState.ts";
import { recomputeDerived } from "../core/PhysicsToyModel.ts";

// Wires the control-deck DOM to the store. Also reflects external state changes
// (e.g. radius shrinking during collapse) back onto the sliders.

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}
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
  private mass = input("mass");
  private radius = input("radius");
  private vacuum = input("vacuumEnergy");
  private shell = input("shellTension");
  private noise = input("quantumNoise");
  private entropy = input("entropyLeakage");

  private massLabel = el("massLabel");
  private radiusLabel = el("radiusLabel");
  private vacuumLabel = el("vacuumLabel");
  private shellLabel = el("shellLabel");
  private noiseLabel = el("noiseLabel");
  private entropyLabel = el("entropyLabel");

  private interiorButton = el("interiorButton") as HTMLButtonElement;
  private muteButton = el("muteButton") as HTMLButtonElement;

  constructor(
    private store: Store,
    private cb: ControlCallbacks,
  ) {
    this.bindSlider(this.mass, "massSolar");
    this.bindRadius();
    this.bindSlider(this.vacuum, "vacuumEnergy");
    this.bindSlider(this.shell, "shellTension");
    this.bindSlider(this.noise, "quantumNoise");
    this.bindSlider(this.entropy, "entropyLeakage");

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

  private bindSlider(elm: HTMLInputElement, key: "massSolar" | "vacuumEnergy" | "shellTension" | "quantumNoise" | "entropyLeakage"): void {
    elm.addEventListener("input", () => {
      this.store.update((s) => {
        (s as any)[key] = parseFloat(elm.value);
        recomputeDerived(s);
      });
    });
  }

  // Radius also sets initialRadiusKm so a fresh collapse starts from here.
  private bindRadius(): void {
    this.radius.addEventListener("input", () => {
      this.store.update((s) => {
        if (s.collapsing) return; // don't fight the animation
        s.radiusKm = parseFloat(this.radius.value);
        s.initialRadiusKm = s.radiusKm;
        recomputeDerived(s);
      });
    });
  }

  setInteriorEnabled(enabled: boolean): void {
    this.interiorButton.disabled = !enabled;
  }

  setMuted(muted: boolean): void {
    this.muteButton.setAttribute("aria-pressed", String(muted));
    this.muteButton.textContent = muted ? "Unmute" : "Mute";
  }

  /** Reflect store values onto controls (numbers + slider positions). */
  render(): void {
    const s = this.store.state;
    this.massLabel.textContent = `${s.massSolar.toFixed(1)} M☉`;
    this.radiusLabel.textContent = `${s.radiusKm.toFixed(s.radiusKm < 10 ? 2 : 0)} km`;
    this.vacuumLabel.textContent = s.vacuumEnergy.toFixed(2);
    this.shellLabel.textContent = s.shellTension.toFixed(2);
    this.noiseLabel.textContent = s.quantumNoise.toFixed(2);
    this.entropyLabel.textContent = s.entropyLeakage.toFixed(2);

    // keep sliders in sync when state is driven externally (collapse/reset/preset)
    if (document.activeElement !== this.mass) this.mass.value = String(s.massSolar);
    if (document.activeElement !== this.radius) this.radius.value = String(s.radiusKm);
    if (document.activeElement !== this.vacuum) this.vacuum.value = String(s.vacuumEnergy);
    if (document.activeElement !== this.shell) this.shell.value = String(s.shellTension);
    if (document.activeElement !== this.noise) this.noise.value = String(s.quantumNoise);
    if (document.activeElement !== this.entropy) this.entropy.value = String(s.entropyLeakage);
  }
}
