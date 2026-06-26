import { clamp } from "../core/math.ts";
import type { SimulationState } from "../core/SimulationState.ts";
import { AudioReactiveAnalyser } from "./AudioReactiveAnalyser.ts";
import { ShellResonator } from "./ShellResonator.ts";

// Real-time Web Audio engine. Every physical parameter has a sonic
// consequence; the analyser feeds the visuals back (Section 18A).
//
//   Black hole  = frequencies disappear.
//   Gravastar   = harmonics return.

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private filter!: BiquadFilterNode;

  private sub!: OscillatorNode;
  private subGain!: GainNode;

  private pulse!: OscillatorNode; // collapse "heartbeat" via amplitude LFO-ish gating
  private pulseGain!: GainNode;
  private pulseLFO!: OscillatorNode;
  private pulseLFOGain!: GainNode;

  private pad!: OscillatorNode; // vacuum-energy / dark-energy drone
  private pad2!: OscillatorNode;
  private padGain!: GainNode;

  private noise!: AudioBufferSourceNode; // quantum glitch / plasma
  private noiseGain!: GainNode;
  private noiseFilter!: BiquadFilterNode;

  private analyserNode!: AnalyserNode;
  private analyser!: AudioReactiveAnalyser;
  private shell!: ShellResonator;

  private started = false;
  private muted = false;

  /** Lazily create the context on first user gesture. */
  async unlock(): Promise<void> {
    if (this.started) {
      if (this.ctx && this.ctx.state !== "running") await this.ctx.resume();
      return;
    }
    this.started = true;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 18000;

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyser = new AudioReactiveAnalyser(this.analyserNode);

    // master chain: filter -> analyser -> master -> destination
    this.filter.connect(this.analyserNode);
    this.analyserNode.connect(this.master);
    this.master.connect(ctx.destination);

    // sub gravity oscillator
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.sub.connect(this.subGain).connect(this.filter);
    this.sub.start();

    // collapse heartbeat: a low tone gated by an LFO whose rate tracks collapse
    this.pulse = ctx.createOscillator();
    this.pulse.type = "sine";
    this.pulse.frequency.value = 55;
    this.pulseGain = ctx.createGain();
    this.pulseGain.gain.value = 0;
    this.pulseLFO = ctx.createOscillator();
    this.pulseLFO.type = "sine";
    this.pulseLFO.frequency.value = 1.0;
    this.pulseLFOGain = ctx.createGain();
    this.pulseLFOGain.gain.value = 0.0;
    this.pulseLFO.connect(this.pulseLFOGain).connect(this.pulseGain.gain);
    this.pulse.connect(this.pulseGain).connect(this.filter);
    this.pulse.start();
    this.pulseLFO.start();

    // vacuum / dark-energy pad: two detuned saws softened
    this.pad = ctx.createOscillator();
    this.pad.type = "sawtooth";
    this.pad.frequency.value = 220;
    this.pad2 = ctx.createOscillator();
    this.pad2.type = "sawtooth";
    this.pad2.frequency.value = 220 * 1.005;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 1200;
    this.pad.connect(this.padGain);
    this.pad2.connect(this.padGain);
    this.padGain.connect(padFilter).connect(this.filter);
    this.pad.start();
    this.pad2.start();

    // quantum glitch / plasma noise
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 2000;
    this.noiseFilter.Q.value = 0.7;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.filter);
    this.noise.start();

    // shell resonator instrument
    this.shell = new ShellResonator(ctx, this.filter);
  }

  get isStarted(): boolean {
    return this.started;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.05);
    }
  }

  /** Fire the shell bell (used by the Bounce). */
  strikeShell(amount = 0.6): void {
    if (this.started) this.shell.excite(amount);
  }

  getBands() {
    return this.started ? this.analyser.sample() : { bass: 0, mids: 0, highs: 0 };
  }

  update(state: SimulationState): void {
    if (!this.started || !this.ctx) return;
    const now = this.ctx.currentTime;

    // sub frequency tracks mass; gain rises with collapse
    const subFreq = 24 + state.massSolar * 1.35;
    this.sub.frequency.setTargetAtTime(subFreq, now, 0.05);
    this.subGain.gain.setTargetAtTime(0.18 + state.collapseProgress * 0.5, now, 0.08);

    // low-pass closes with compactness (black hole = frequencies disappear)
    const cutoff = this.mapCompactnessToCutoff(state.compactness);
    this.filter.frequency.setTargetAtTime(cutoff, now, 0.06);

    // heartbeat speeds up through collapse
    const beatRate = 0.8 + state.collapseProgress * 5.0;
    this.pulseLFO.frequency.setTargetAtTime(beatRate, now, 0.1);
    this.pulseLFOGain.gain.setTargetAtTime(0.25 * state.collapseProgress, now, 0.1);
    this.pulseGain.gain.setTargetAtTime(0.1 * state.collapseProgress, now, 0.1);

    // vacuum pad brightens / opens with vacuum energy, especially as gravastar
    const padTarget =
      state.outcome === "gravastar"
        ? state.vacuumEnergy * (0.1 + state.deSitterBubbleRadius * 0.5)
        : state.vacuumEnergy * 0.05;
    this.padGain.gain.setTargetAtTime(padTarget, now, 0.2);
    // open the pad into a richer chord as the interior blooms
    const padFreq = 174 + state.deSitterBubbleRadius * 60;
    this.pad.frequency.setTargetAtTime(padFreq, now, 0.2);
    this.pad2.frequency.setTargetAtTime(padFreq * 1.5, now, 0.2);

    // quantum glitch noise
    this.noiseGain.gain.setTargetAtTime(state.quantumNoise * 0.12 + state.entropyLeakage * 0.05, now, 0.1);
    this.noiseFilter.frequency.setTargetAtTime(800 + state.quantumNoise * 6000, now, 0.1);

    // shell resonance
    this.shell.update(state.shellTension, state.shellFormation);

    // black hole: collapse high freqs to near-silence, leave the sub
    if (state.outcome === "black-hole") {
      this.padGain.gain.setTargetAtTime(0, now, 0.2);
    }
  }

  private mapCompactnessToCutoff(compactness: number): number {
    const n = clamp(compactness / 0.5, 0, 1);
    return 18000 * (1 - n) + 140 * n;
  }
}
