// The gravastar shell as its own instrument: a bank of bandpass filters tuned
// to a Fibonacci-ish set of frequencies, excited by a noise burst. Sounds like
// metal / glass / skin under cosmic pressure.

const RESONANT = [147, 233, 377, 610, 987];

export class ShellResonator {
  private gain: GainNode;
  private filters: BiquadFilterNode[] = [];
  private noiseBuffer: AudioBuffer;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(destination);

    for (const freq of RESONANT) {
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq;
      filter.Q.value = 18;
      filter.connect(this.gain);
      this.filters.push(filter);
    }

    // short white-noise buffer reused for excitation bursts
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /** A struck-bell excitation: feed a noise burst through the filter bank. */
  excite(amount: number): void {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    for (const f of this.filters) src.connect(f);
    src.start(now);
    src.stop(now + 0.5);

    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(Math.max(amount, 0.0001), now);
    this.gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
  }

  /** Sustained resonance proportional to shell tension * formation. */
  update(shellTension: number, formation: number): void {
    const now = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(shellTension * formation * 0.35, now, 0.12);
    this.filters.forEach((filter, index) => {
      const base = RESONANT[index];
      filter.frequency.setTargetAtTime(base * (1 + shellTension * 0.25), now, 0.1);
    });
  }
}
