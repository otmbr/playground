// LOW NOISE — CITY DUB mode controller (fully automatic).
// Walk for 5 minutes. The environment is auto-detected and composed into a track.
// SCAN/LISTEN → BUILD (loops grow) → SETTLE → TRACK (report + shareable loop).

import { AudioAnalyzer } from "./analysis.js";
import { DubEngine } from "./dub.js";
import { Visual } from "./visual.js";

const RUN_SECONDS = 300; // 5 minutes
const NOTE_TO_KEY = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export class CityDub {
  constructor(dom, options = {}) {
    this.dom = dom; // { canvas, hud:{noiseprint,state,timer}, callout, onReport }
    this.runSeconds = options.seconds || RUN_SECONDS;
    this.ctx = null;
    this.analyzer = null;
    this.dub = null;
    this.visual = new Visual(dom.canvas);
    this.state = "idle";
    this.elapsed = 0;
    this._raf = null;
    this._lastT = 0;
    this._calloutFlags = {};
  }

  async start() {
    // AudioContext (Safari needs the webkit prefix + resume inside the gesture).
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.analyzer = new AudioAnalyzer(this.ctx);
    try {
      await this.analyzer.start(); // mic — required for this mode
    } catch (_) {
      this._setState("MIC NEEDED", "MIC NEEDED");
      throw new Error("microphone-required");
    }

    this.dub = new DubEngine(this.ctx);
    this.dub.start();
    this.dub.startRecording();
    this.analyzer.onOnset = (band, strength) => this.dub.onOnset(band, strength);

    this.elapsed = 0;
    this.state = "build";
    this.dom.hud.state.textContent = "CITY DUB";
    this._callout("CITY DUB", 1600);

    this._lastT = performance.now();
    this._loop();
  }

  _loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now;

    // --- autodetection ---
    this.analyzer.update(now);
    const a = this.analyzer.state;

    // Feed detected key + tempo into the generative engine.
    this.dub.setKey(a.note);
    this.dub.setTempo(a.bpm);

    this.elapsed += dt;
    this._updateHud(a);
    this._milestones();

    if (this.elapsed >= this.runSeconds) return this._finish();

    // --- visuals (reuse the LOW NOISE field, driven by the dub state) ---
    const act = this.dub.activity;
    const params = {
      filter: 0.3 + Math.min(0.6, a.centroid / 8000),
      depth: a.bands.low,
      stability: a.confidence,
      noise: clamp01(1 - act * 0.8 - a.confidence * 0.2),
      echo: 0.4,
      bassCharge: a.bands.low,
      low: clamp01(act * a.confidence),
      tempo: a.bpm,
    };
    const input = {
      tiltLR: 0, tiltFB: 0, holding: false, twoFinger: false,
      stillness: a.confidence,
    };
    const signal = clamp01(act * 0.6 + a.confidence * 0.4);
    this.visual.render(params, input, signal, dt);

    this._raf = requestAnimationFrame(this._loop);
  };

  _updateHud(a) {
    const left = Math.max(0, this.runSeconds - this.elapsed);
    const m = Math.floor(left / 60), s = Math.floor(left % 60);
    this.dom.hud.timer.textContent = `${m}:${String(s).padStart(2, "0")}`;
    const bpm = Math.round(a.bpm);
    const key = a.note != null ? `${NOTE_TO_KEY[a.note]}m` : "—";
    this.dom.hud.noiseprint.textContent =
      `${bpm} BPM · KEY ${key} · ${Math.round(a.onsetRate * 10) / 10}/s`;
  }

  _milestones() {
    const f = this._calloutFlags;
    if (!f.locked && this.analyzer.state.confidence > 0.5 && this.dub.stats.bars >= 2) {
      f.locked = true; this._callout("LOCKED", 1400);
      this.dom.hud.state.textContent = "DUB IT DOWN";
    }
    if (!f.deep && this.dub.activity > 0.6) {
      f.deep = true; this._callout("SIGNAL BENDS", 1400);
    }
  }

  async _finish() {
    cancelAnimationFrame(this._raf);
    this.state = "report";
    this.dom.hud.state.textContent = "TRACK READY";
    this._callout("ROOM CLEARED", 1800);
    this.dub.fadeOutAndStop(2);
    const blob = await this.dub.stopRecording();
    await wait(1200);
    this.analyzer.stop();
    const report = this._buildReport();
    this.dom.onReport(report, blob);
  }

  _buildReport() {
    const a = this.analyzer.state;
    const st = this.dub.stats;
    // Count loop cells that survived → "loops" the city formed.
    let loops = 0;
    for (const band of ["low", "mid", "high"])
      for (let i = 0; i < 16; i++) if (this.dub.grid[band][i] > 0.4) loops++;

    const bpm = st.peakBpm || Math.round(a.bpm);
    const key = a.note != null ? NOTE_TO_KEY[a.note] : "—";
    const density = a.onsetRate > 2 ? "Busy" : a.onsetRate > 0.8 ? "Steady" : "Sparse";
    const code = `DUB-${String(bpm).padStart(3, "0")}-${key.replace("#", "S")}MIN`;

    const lines = [
      `Tempo:           ${bpm} BPM`,
      `Key:             ${key} minor`,
      `Bars:            ${st.bars}`,
      `Events Caught:   ${st.onsets}`,
      `Loops Formed:    ${loops}`,
      `Density:         ${density}`,
      `Mode:            City Dub`,
      `Result:          ${code}`,
    ];
    return { text: lines.join("\n"), code, mode: "City Dub", lowFound: loops > 6 };
  }

  _setState(state, label) {
    this.state = state;
    this.dom.hud.state.textContent = label;
  }
  _callout(text, ms = 1200) {
    const el = this.dom.callout;
    el.textContent = text;
    el.classList.add("show");
    el.classList.toggle("glitch", text.length > 1);
    clearTimeout(this._coTimer);
    this._coTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    if (this.analyzer) this.analyzer.stop();
    if (this.dub) this.dub.dispose();
    if (this.ctx) this.ctx.close();
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
