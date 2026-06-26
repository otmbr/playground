import { clamp } from "../core/math.ts";

// A modern, touch-friendly rotary knob. Vertical drag (or wheel / arrow keys)
// changes the value; a glowing 270° arc and a dot show the position. Replaces
// the old <input type="range"> sliders.

export interface KnobOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  color?: string;
  advanced?: boolean;
  hint?: string;
  format: (v: number) => string;
  onInput: (v: number) => void;
  onHint?: (hint: string) => void;
}

const SVGNS = "http://www.w3.org/2000/svg";

export class Knob {
  readonly el: HTMLElement;
  private dial: HTMLElement;
  private valueArc: SVGCircleElement;
  private dot: SVGCircleElement;
  private num: HTMLElement;
  private value: number;
  private dragging = false;
  private startY = 0;
  private startValue = 0;

  constructor(private o: KnobOptions) {
    this.value = o.value;

    this.el = document.createElement("div");
    this.el.className = "knob" + (o.advanced ? " advanced" : "");
    if (o.color) this.el.style.setProperty("--k", o.color);

    this.dial = document.createElement("div");
    this.dial.className = "knob-dial";
    this.dial.setAttribute("role", "slider");
    this.dial.setAttribute("tabindex", "0");
    this.dial.setAttribute("aria-label", o.label);
    this.dial.setAttribute("aria-valuemin", String(o.min));
    this.dial.setAttribute("aria-valuemax", String(o.max));

    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    const track = this.arc("knob-track");
    this.valueArc = this.arc("knob-value");
    this.dot = document.createElementNS(SVGNS, "circle");
    this.dot.setAttribute("class", "knob-dot");
    this.dot.setAttribute("r", "4.5");
    svg.append(track, this.valueArc, this.dot);

    this.num = document.createElement("span");
    this.num.className = "knob-num";

    this.dial.append(svg, this.num);

    const label = document.createElement("span");
    label.className = "knob-label";
    label.textContent = o.label;

    this.el.append(this.dial, label);

    this.bind();
    this.render();
  }

  private arc(cls: string): SVGCircleElement {
    const c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("class", cls);
    c.setAttribute("cx", "50");
    c.setAttribute("cy", "50");
    c.setAttribute("r", "40");
    c.setAttribute("pathLength", "100");
    return c;
  }

  private bind(): void {
    const range = this.o.max - this.o.min;

    this.dial.addEventListener("pointerdown", (e) => {
      this.dial.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.startY = e.clientY;
      this.startValue = this.value;
      this.dial.classList.add("active");
      if (this.o.hint && this.o.onHint) this.o.onHint(this.o.hint);
      e.preventDefault();
    });
    this.dial.addEventListener("focus", () => {
      if (this.o.hint && this.o.onHint) this.o.onHint(this.o.hint);
    });
    if (this.o.hint) this.dial.title = this.o.hint;
    this.dial.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dy = this.startY - e.clientY;
      // a full sweep takes ~190px of vertical travel
      this.set(this.startValue + (dy / 190) * range, true);
    });
    const release = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.dial.classList.remove("active");
      try {
        this.dial.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    this.dial.addEventListener("pointerup", release);
    this.dial.addEventListener("pointercancel", release);

    this.dial.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        this.set(this.value + dir * (range / 50), true);
      },
      { passive: false },
    );

    this.dial.addEventListener("keydown", (e) => {
      const big = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        this.set(this.value + this.o.step * big, true);
        e.preventDefault();
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        this.set(this.value - this.o.step * big, true);
        e.preventDefault();
      }
    });

    // double-tap / double-click resets to the initial value
    this.dial.addEventListener("dblclick", () => this.set(this.o.value, true));
  }

  private snap(v: number): number {
    const stepped = Math.round((v - this.o.min) / this.o.step) * this.o.step + this.o.min;
    return clamp(stepped, this.o.min, this.o.max);
  }

  /** Set from interaction (emit = notify store). */
  private set(v: number, emit: boolean): void {
    const next = this.snap(v);
    if (next === this.value) return;
    this.value = next;
    this.render();
    if (emit) this.o.onInput(next);
  }

  /** Set from external state without re-emitting (store -> UI sync). */
  setValue(v: number): void {
    if (this.dragging) return;
    const next = this.snap(v);
    if (next === this.value) return;
    this.value = next;
    this.render();
  }

  private render(): void {
    const frac = clamp((this.value - this.o.min) / (this.o.max - this.o.min), 0, 1);
    // 270° sweep = 75% of pathLength
    this.valueArc.style.strokeDasharray = `${frac * 75} 100`;
    const ang = ((-135 + frac * 270) * Math.PI) / 180; // from 12 o'clock
    this.dot.setAttribute("cx", String(50 + Math.sin(ang) * 40));
    this.dot.setAttribute("cy", String(50 - Math.cos(ang) * 40));
    this.num.textContent = this.o.format(this.value);
    this.dial.setAttribute("aria-valuenow", String(this.value));
    this.dial.setAttribute("aria-valuetext", this.o.format(this.value));
  }
}
