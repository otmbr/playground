// LOW NOISE — LOW RUN game loop & state machine.
// SCAN → DESCEND → FILTER → DROP INTO LOW → REPORT.

import { AudioEngine } from "./audio.js";
import { InputManager } from "./input.js";
import { Visual } from "./visual.js";
import { scanEnvironment, formatNoiseprint } from "./scan.js";

const RUN_SECONDS = 90;
const LOW_HOLD_NEEDED = 3.5;   // s of clean signal to drop into LOW
const CLEAN_THRESHOLD = 0.78;

export class Game {
  constructor(dom, options = {}) {
    this.dom = dom; // { canvas, hud:{noiseprint,state,timer}, callout, onReport }
    this.runSeconds = options.seconds || RUN_SECONDS;
    this.audio = new AudioEngine();
    this.input = new InputManager(dom.canvas);
    this.visual = new Visual(dom.canvas);

    this.state = "idle";
    this.signal = 0;
    this.cleanFor = 0;
    this.elapsed = 0;
    this.lowReached = false;

    this._stats = null;
    this._raf = null;
    this._lastT = 0;

    this.input.on("swipe", (e) => this._onSwipe(e));
    this.input.on("tap", () => this._onTap());
  }

  async startRun() {
    // 1) audio + sensors need a user gesture (we're called from the REDUCE tap)
    await this.input.requestPermissions();
    this.input.attach();
    await this.audio.start();

    this._resetStats();
    this.elapsed = 0; this.signal = 0; this.cleanFor = 0; this.lowReached = false;
    this.audio.params.noise = 1.0;

    // Start the render loop now so visuals animate through SCAN/DESCEND too.
    // Gameplay ticking is gated on the FILTER/LOW states inside _loop.
    this._lastT = performance.now();
    this._loop();

    // 2) SCAN
    this._setState("SCAN", "SCAN");
    const print = await scanEnvironment(this.audio.ctx, 2200);
    this.print = print;
    this.dom.hud.noiseprint.textContent = formatNoiseprint(print);
    this.mode = this._pickMode(print);

    // Seed difficulty from the environment: louder/denser world = more noise to clear.
    this.audio.params.noise = clamp01(0.65 + print.noiseLevel * 0.35);
    this.audio.params.tempo = 118 + Math.round(print.pulse * 12);
    this._stats.startNoise = this.audio.params.noise;

    // 3) DESCEND
    this._setState("DESCEND", "DESCEND");
    await wait(1600);

    // 4) FILTER (the run)
    this.audio.startRecording();
    this._setState("FILTER", "CUT NOISE");
  }

  _loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now;

    if (this.state === "FILTER" || this.state === "LOW") {
      this.elapsed += dt;
      this._tickGameplay(dt);
      this._updateTimer();
      if (this.elapsed >= this.runSeconds) return this._finish();
    }

    this.input.update();
    this.audio.update();
    this.visual.render(this.audio.params, this.input.state, this.signal, dt);
    this._raf = requestAnimationFrame(this._loop);
  };

  _tickGameplay(dt) {
    const p = this.audio.params;
    const s = this.input.state;

    // Tilt → filter lens.
    p.filter += ((s.tiltLR * 0.5 + 0.5) - p.filter) * Math.min(1, dt * 4);
    p.depth += ((s.tiltFB * 0.5 + 0.5) - p.depth) * Math.min(1, dt * 4);

    // Two fingers → dub echo.
    p.echo += ((s.twoFinger ? 1 : 0) - p.echo) * Math.min(1, dt * 3);

    // Stability: earned by HOLDING a still finger.
    const wantStable = (s.holding ? 1 : 0) * s.stillness;
    p.stability += (wantStable - p.stability) * Math.min(1, dt * 1.5);

    // Stillness charges the bass.
    p.bassCharge += (s.stillness - p.bassCharge) * Math.min(1, dt * 0.8);

    // --- NOISE dynamics ---
    // Calm + stable + a "tuned" lens (mid filter, some depth) slowly clears noise.
    const tuned = 1 - Math.abs(p.filter - 0.5) * 1.2;          // reward centred-ish lens
    const clearRate = (0.06 + p.stability * 0.14 + p.bassCharge * 0.05)
                      * clamp01(tuned) * (s.holding ? 1.3 : 0.7);
    // Agitation (low stillness) lets disturbance creep back in.
    const creep = (1 - s.stillness) * 0.05;
    p.noise = clamp01(p.noise - clearRate * dt + creep * dt);

    // Signal cleanliness.
    this.signal = clamp01((1 - p.noise) * (0.55 + 0.45 * p.stability));
    this._stats.minNoise = Math.min(this._stats.minNoise, p.noise);
    this._stats.signalSum += this.signal; this._stats.frames++;
    this._stats.stillSum += s.stillness;
    this._stats.bassSum += Math.max(p.bassCharge, p.low);

    // --- DROP INTO LOW ---
    if (!this.lowReached) {
      if (this.signal >= CLEAN_THRESHOLD) this.cleanFor += dt;
      else this.cleanFor = Math.max(0, this.cleanFor - dt * 0.5);
      if (this.cleanFor >= LOW_HOLD_NEEDED) this._enterLow();
    } else {
      p.low += (1 - p.low) * Math.min(1, dt * 0.6); // settle deeper
    }
  }

  _enterLow() {
    this.lowReached = true;
    this.state = "LOW";
    this._stats.lowReachedAt = this.elapsed;
    this.audio.params.low = 0.01;
    this.dom.hud.state.textContent = "HOLD LOW";
    this._callout("LOW FOUND");
    if (navigator.vibrate) navigator.vibrate([20, 40, 80]);
  }

  _onSwipe(e) {
    if (this.state !== "FILTER" && this.state !== "LOW") return;
    // Slow swipe pulls interference lines out of the sound.
    const mag = Math.min(1, Math.hypot(e.dx, e.dy) / 120);
    this.audio.params.noise = clamp01(this.audio.params.noise - mag * 0.02);
  }

  _onTap() {
    if (this.state !== "FILTER" && this.state !== "LOW") return;
    // Tap removes a digital artifact: a clean little notch out of the noise.
    this.audio.params.noise = clamp01(this.audio.params.noise - 0.04);
    this._stats.taps++;
    this._callout("·", 240);
  }

  async _finish() {
    cancelAnimationFrame(this._raf);
    this.state = "report";
    this.dom.hud.state.textContent = this.lowReached ? "ROOM CLEARED" : "NOISE ACCEPTED";
    this._callout(this.lowReached ? "ROOM CLEARED" : "NOISE ACCEPTED");
    this.audio.fadeOutAndStop(1.4);

    const blob = await this.audio.stopRecording();
    await wait(900);
    this.input.detach();
    const report = this._buildReport();
    this.dom.onReport(report, blob);
  }

  // ---- reporting ---------------------------------------------------------
  _resetStats() {
    this._stats = {
      startNoise: 1, minNoise: 1, signalSum: 0, stillSum: 0, bassSum: 0,
      frames: 0, taps: 0, lowReachedAt: null,
    };
  }

  _buildReport() {
    const st = this._stats;
    const avgSignal = st.frames ? st.signalSum / st.frames : 0;
    const avgStill = st.frames ? st.stillSum / st.frames : 0;
    const avgBass = st.frames ? st.bassSum / st.frames : 0;

    const signalPct = Math.round(clamp01(this.signal * 0.6 + avgSignal * 0.4) * 100);
    // dB reduction from start → cleanest moment.
    const ratio = Math.max(0.02, st.minNoise) / Math.max(0.02, st.startNoise);
    const dB = Math.round(20 * Math.log10(ratio)); // negative

    const bassStability = avgBass > 0.6 ? "Deep" : avgBass > 0.35 ? "Mid" : "Light";
    const motion = avgStill > 0.7 ? "Calm" : avgStill > 0.45 ? "Steady" : "Restless";
    const focus = avgSignal > 0.7 ? "Clean" : avgSignal > 0.45 ? "Holding" : "Loose";

    const code =
      `LOW-${String(signalPct).padStart(3, "0")}-${bassStability.toUpperCase()}-${focus.toUpperCase()}`;

    const lines = [
      `Signal:          ${signalPct}%`,
      `Noise Reduced:   ${dB} dB`,
      `Bass Stability:  ${bassStability}`,
      `Motion:          ${motion}`,
      `Focus:           ${focus}`,
      `Mode:            ${this.mode}`,
      `Result:          ${code}`,
    ];
    return {
      text: lines.join("\n"),
      code, signalPct, dB, mode: this.mode,
      lowFound: this.lowReached,
    };
  }

  _pickMode(print) {
    if (print.lowFreq > 0.55) return "Night Signal";
    if (print.composition.WIND > 0.4) return "Night Water";
    if (print.composition.MACHINE > 0.4) return "City Dub";
    return "Deep Room";
  }

  // ---- helpers -----------------------------------------------------------
  _setState(state, label) {
    this.state = state;
    this.dom.hud.state.textContent = label;
    if (label) this._callout(label);
  }
  _updateTimer() {
    const left = Math.max(0, this.runSeconds - this.elapsed);
    this.dom.hud.timer.textContent = left.toFixed(1).padStart(4, "0");
  }
  _callout(text, ms = 1200) {
    const el = this.dom.callout;
    el.textContent = text;
    el.classList.add("show");
    if (text.length <= 1) el.classList.remove("glitch");
    else el.classList.add("glitch");
    clearTimeout(this._coTimer);
    this._coTimer = setTimeout(() => el.classList.remove("show"), ms);
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
