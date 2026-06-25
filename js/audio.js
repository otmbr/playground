// LOW NOISE — Audio engine (Web Audio API)
// Sound set: Kick, Sub, Pad, Noise, Echo, Glitch.
// The player does not "add" sound — they REDUCE noise and excavate the signal.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;

    // Live parameters, written by the game loop, read by the scheduler.
    this.params = {
      filter: 0.5,     // 0..1  tilt L/R  -> cutoff position
      depth: 0.5,      // 0..1  tilt F/B  -> resonance + sub weight
      stability: 0,    // 0..1  hold      -> tames noise jitter
      noise: 1.0,      // 1..0  swipe/tap -> remaining disturbance (lower = cleaner)
      echo: 0,         // 0..1  two-finger-> dub echo amount
      bassCharge: 0,   // 0..1  stillness -> sub swell
      low: 0,          // 0..1  DROP INTO LOW crossfade
      tempo: 124,      // bpm
    };

    this._lookahead = 0.025;   // s, scheduler tick
    this._scheduleAhead = 0.12; // s
    this._nextKick = 0;
    this._step = 0;
    this._timer = null;
  }

  async start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._build();
    this._startClock();
    this.started = true;
  }

  // ---- graph -------------------------------------------------------------
  _build() {
    const ctx = this.ctx;

    // Master + recording tap.
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.recDest = ctx.createMediaStreamDestination();
    this.master.connect(ctx.destination);
    this.master.connect(this.recDest);

    // Player-controlled master filter (the "lens" you tilt).
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 800;
    this.filter.Q.value = 1;
    this.filter.connect(this.master);

    // Dub echo (two fingers).
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 60 / this.params.tempo * 0.75; // dotted-ish
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.45;
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.echoSend.connect(this.delay);
    this.delay.connect(this.filter);

    // Bus that most voices share (so echo + filter apply uniformly).
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.filter);
    this.bus.connect(this.echoSend);

    // --- SUB (continuous low oscillator) ---
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = 48; // ~G1
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.0001;
    this.sub.connect(this.subGain).connect(this.filter); // sub bypasses echo
    this.sub.start();

    // --- PAD (detuned saws, the warm body) ---
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padGain.connect(this.bus);
    this.padVoices = [];
    [110, 110.4, 164.81, 220].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 3 ? "triangle" : "sawtooth";
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 7;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.25;
      o.connect(g).connect(this.padGain);
      o.start();
      this.padVoices.push(o);
    });

    // --- NOISE (the disturbance you reduce) ---
    this.noiseBuf = this._makeNoise(2.5);
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = this.noiseBuf;
    this.noiseSrc.loop = true;
    this.noiseBP = ctx.createBiquadFilter();
    this.noiseBP.type = "bandpass";
    this.noiseBP.frequency.value = 3000;
    this.noiseBP.Q.value = 0.6;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.0001;
    this.noiseSrc.connect(this.noiseBP).connect(this.noiseGain).connect(this.master); // noise is "outside" the lens
    this.noiseSrc.start();
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // mild pink-ish smoothing so it reads as "room/world" not hiss
      last = 0.97 * last + 0.03 * white;
      d[i] = (white * 0.4 + last * 1.2);
    }
    return buf;
  }

  // ---- per-frame parameter application -----------------------------------
  // Called by the game loop ~60fps with the current params.
  update() {
    if (!this.started) return;
    const ctx = this.ctx, p = this.params, t = ctx.currentTime, k = 0.08;

    // Filter cutoff: tilt maps log-style 200Hz..9kHz, opened further by LOW pull-down.
    const minF = 200, maxF = 9000;
    const cutoff = minF * Math.pow(maxF / minF, p.filter);
    const lowPull = 1 - 0.55 * p.low; // LOW darkens the highs
    this.filter.frequency.setTargetAtTime(cutoff * lowPull, t, k);
    this.filter.Q.setTargetAtTime(0.7 + p.depth * 6 + p.low * 2, t, k);

    // Master comes up once running.
    this.master.gain.setTargetAtTime(0.9, t, 0.5);

    // Noise gain: starts dominant, player reduces it. Stability tames its jitter.
    const noiseLvl = Math.max(0, p.noise) * (1 - 0.7 * p.stability) * (1 - 0.6 * p.low);
    this.noiseGain.gain.setTargetAtTime(0.0001 + noiseLvl * 0.5, t, k);
    this.noiseBP.frequency.setTargetAtTime(1200 + (1 - p.stability) * 4000, t, k);

    // Sub: charged by stillness + depth, blooms in LOW.
    const subLvl = (0.15 + p.bassCharge * 0.55 + p.depth * 0.2 + p.low * 0.6);
    this.subGain.gain.setTargetAtTime(Math.min(0.95, subLvl), t, 0.12);
    this.sub.frequency.setTargetAtTime(48 - p.low * 8, t, 0.3); // sink a little

    // Pad: present once signal forms, warmer in LOW.
    const padLvl = (0.1 + (1 - p.noise) * 0.25 + p.low * 0.25);
    this.padGain.gain.setTargetAtTime(Math.min(0.5, padLvl), t, 0.2);

    // Echo send.
    this.echoSend.gain.setTargetAtTime(p.echo * 0.6, t, k);
    this.feedback.gain.setTargetAtTime(0.3 + p.echo * 0.25 + p.low * 0.1, t, k);
  }

  // ---- beat clock --------------------------------------------------------
  _startClock() {
    this._nextKick = this.ctx.currentTime + 0.1;
    this._step = 0;
    const tick = () => {
      const ctx = this.ctx;
      const spb = 60 / this.params.tempo; // seconds per beat
      const stepDur = spb / 2; // 8th notes
      while (this._nextKick < ctx.currentTime + this._scheduleAhead) {
        this._scheduleStep(this._step, this._nextKick);
        this._nextKick += stepDur;
        this._step = (this._step + 1) % 16;
      }
      this._timer = setTimeout(tick, this._lookahead * 1000);
    };
    tick();
  }

  _scheduleStep(step, when) {
    const p = this.params;
    // Kick only really lands once the signal is forming; clearer as noise drops.
    const clarity = 1 - p.noise;
    if (step % 4 === 0) this._kick(when, 0.6 + clarity * 0.4 + p.low * 0.2);
    // Off-beat ghost kick appears in LOW.
    if (p.low > 0.4 && step % 8 === 6) this._kick(when, 0.3 * p.low);
    // Glitch: residual digital artifacts while noise is high (tap removes them).
    if (p.noise > 0.35 && (step === 3 || step === 11) && Math.random() < p.noise) {
      this._glitch(when, p.noise);
    }
  }

  _kick(when, amp = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(160, when);
    o.frequency.exponentialRampToValueAtTime(46, when + 0.12);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.min(1, amp), when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
    o.connect(g).connect(this.filter);
    o.start(when);
    o.stop(when + 0.4);
  }

  _glitch(when, intensity) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const dur = 0.02 + Math.random() * 0.05;
    src.playbackRate.value = 0.5 + Math.random() * 3;
    const bp = ctx.createBiquadFilter();
    bp.type = "highpass";
    bp.frequency.value = 2000 + Math.random() * 4000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.25 * intensity, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(bp).connect(g).connect(this.bus);
    const off = (Math.random() * 0.06);
    src.start(when + off);
    src.stop(when + off + dur + 0.02);
  }

  // ---- recording (shareable loop) ----------------------------------------
  startRecording() {
    if (!this.recDest) return;
    this._chunks = [];
    let mime = "";
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
    }
    try {
      this.recorder = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      this.recorder = null;
      return;
    }
    this.recorder.ondataavailable = (e) => { if (e.data.size) this._chunks.push(e.data); };
    this.recorder.start();
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === "inactive") return resolve(null);
      this.recorder.onstop = () => {
        const blob = new Blob(this._chunks, { type: this._chunks[0]?.type || "audio/webm" });
        resolve(blob);
      };
      this.recorder.stop();
    });
  }

  fadeOutAndStop(seconds = 1.2) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.0001, t, seconds / 4);
  }

  dispose() {
    if (this._timer) clearTimeout(this._timer);
    if (this.ctx) this.ctx.close();
    this.started = false;
  }
}
