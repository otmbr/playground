import type { SimulationState } from "../core/SimulationState.ts";
import {
  LEGEND,
  OUTCOME_INTERIOR,
  OUTCOME_LABEL,
  SPECULATION_LABEL,
} from "./labels.ts";

// Heads-up display: readouts, outcome label, speculation badge, captions and
// the speculation-label legend.

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

export class HUD {
  private stateLabel = $("stateLabel");
  private massValue = $("massValue");
  private radiusValue = $("radiusValue");
  private rsValue = $("rsValue");
  private compactnessValue = $("compactnessValue");
  private progressValue = $("progressValue");
  private interiorValue = $("interiorValue");
  private badge = $("speculationBadge");
  private captions = $("captions");
  private legend = $("legend");
  private legendList = $("legendList");

  constructor() {
    this.buildLegend();
    $("legendClose").addEventListener("click", () => this.toggleLegend(false));
  }

  private buildLegend(): void {
    this.legendList.innerHTML = "";
    for (const entry of LEGEND) {
      const li = document.createElement("li");
      const cls = entry.level;
      li.innerHTML = `
        <div class="legend-row">
          <span class="legend-claim">${entry.claim}</span>
          <span class="badge ${cls}">${SPECULATION_LABEL[entry.level]}</span>
        </div>
        <p class="legend-note">${entry.note}</p>`;
      this.legendList.appendChild(li);
    }
  }

  toggleLegend(force?: boolean): void {
    const show = force ?? this.legend.hasAttribute("hidden");
    if (show) this.legend.removeAttribute("hidden");
    else this.legend.setAttribute("hidden", "");
  }

  /** Append a transient caption (also serves as audio caption for a11y). */
  caption(text: string): void {
    const p = document.createElement("p");
    p.className = "caption";
    p.textContent = text;
    this.captions.prepend(p);
    while (this.captions.childElementCount > 4) {
      this.captions.lastElementChild?.remove();
    }
    setTimeout(() => p.classList.add("fade"), 50);
    setTimeout(() => p.remove(), 6000);
  }

  render(state: SimulationState): void {
    this.massValue.textContent = `${state.massSolar.toFixed(1)} M☉`;
    this.radiusValue.textContent = `${state.radiusKm.toFixed(state.radiusKm < 10 ? 2 : 0)} km`;
    this.rsValue.textContent = `${state.schwarzschildRadiusKm.toFixed(2)} km`;
    this.compactnessValue.textContent = state.compactness.toFixed(3);
    this.progressValue.textContent = `${Math.round(state.collapseProgress * 100)}%`;
    this.interiorValue.textContent = state.insideInterior
      ? "You are inside"
      : OUTCOME_INTERIOR[state.outcome];

    this.stateLabel.textContent = OUTCOME_LABEL[state.outcome];
    this.stateLabel.dataset.outcome = state.outcome;

    const level = state.speculationLevel;
    this.badge.textContent = SPECULATION_LABEL[level];
    this.badge.className = `badge ${level}`;
  }
}
