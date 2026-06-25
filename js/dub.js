// LOW NOISE — CITY DUB generative engine.
// The street plays it: walking cadence → tempo, ambient pitch → key,
// onsets → evolving per-band loops. Synthesized (no live resampling, no feedback).

export class DubEngine {
  constructor(ctx) {
    this.ctx = ctx;
    this.bpm = 100;
    this.root = 9; // pitch class (A) until detection kicks in
    this.step = 0;
    this._next = 0;
    this._timer = null;
    this._lookahead = 0.025;
    this._ahead = 0.12;
    this._lastStep = 0;

    // Evolving loop memory: weight per band per 16th step.
    this.grid = { low: new Array(16).fill(0), mid: new Array(16).fill(0), high: new Array(16).fill(0) };
    this.activity = 0;

    // stats for the report
    this.stats = { onsets: 0, bars: 0, peakBpm: 0 };
  }

  start() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.recDest = ctx.createMediaStreamDestination();
    this.master.connect(ctx.destination);
    this.master.connect(this.recDest);

    // Warmth filter + dub echo.
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 5000;
    this.filter.Q.value = 0.8;
    this.filter.connect(this.master);

    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.4;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.42;
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0.28;
    this.delay.connect(this.feedback).connect(this.delay);
    this.echoSend.connect(this.delay).connect(this.filter);

    this.bus = ctx.createGain();
    this.bus.connect(this.filter);
    this.bus.connect(this.echoSend);

    // PAD (sustained chord, set by detected key).
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padGain.connect(this.bus);
    this.padOsc = [];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.detune.value = (i - 1) * 8;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      o.connect(g).connect(this.padGain);
      o.start();
      this.padOsc.push(o);
    }

    this._setChord(this.root);
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.8);
    this._startClock();
  }

  // Called by the analyzer when an environmental event is detected.
  onOnset(band, strength) {
    this.stats.onsets++;
    // Deposit weight into the evolving loop at the current step.
    const w = this.grid[band];
    w[this._lastStep] = Math.min(2.5, w[this._lastStep] + 0.6 + strength);
    this.activity = Math.min(1, this.activity + 0.08);
    // Immediate live hit so you hear the sound become part of the beat now.
    this._voice(band, this.ctx.currentTime, 0.4 + strength * 0.5);
  }

  // Called each frame with the live analyzer state.
  setKey(pitchClass) {
    if (pitchClass == null) return;
    this._pendingRoot = pitchClass;
  }
  setTempo(bpm) { this._pendingBpm = bpm; }

  _startClock() {
    this._next = this.ctx.currentTime + 0.1;
    this.step = 0;
    const tick = () => {
      const ctx = this.ctx;
      const stepDur = 60 / this.bpm / 4; // 16th notes
      while (this._next < ctx.currentTime + this._ahead) {
        this._scheduleStep(this.step, this._next);
        this._lastStep = this.step;
        this._next += stepDur;
        this.step = (this.step + 1) % 16;
        if (this.step === 0) this._onBar();
      }
      this._timer = setTimeout(tick, this._lookahead * 1000);
    };
    tick();
  }

  _onBar() {
    this.stats.bars++;
    // Apply pending tempo/key changes only at bar boundaries (no drift / clicks).
    if (this._pendingBpm) {
      this.bpm = clamp(this._pendingBpm, 60, 160);
      this.stats.peakBpm = Math.max(this.stats.peakBpm, Math.round(this.bpm));
      const beat = 60 / this.bpm;
      this.delay.delayTime.setTargetAtTime(beat * 0.75, this.ctx.currentTime, 0.2);
    }
    if (this._pendingRoot != null && this._pendingRoot !== this.root) {
      this.root = this._pendingRoot;
      this._setChord(this.root);
    }
    // Loops evolve: old patterns fade, new ones take over.
    for (const k in this.grid) for (let i = 0; i < 16; i++) this.grid[k][i] *= 0.86;
    this.activity *= 0.9;
    // Pad presence follows activity.
    this.padGain.gain.setTargetAtTime(0.04 + this.activity * 0.16, this.ctx.currentTime, 0.4);
  }

  _scheduleStep(step, when) {
    // A steady pulse seeds the groove even before loops form.
    if (step % 4 === 0) this._voice("low", when, 0.5 + this.activity * 0.4);
    // Bass walks the key on the beat.
    if (step % 4 === 0 || (step % 8 === 6 && this.activity > 0.3)) {
      this._bass(when, step % 8 === 6 ? 7 : 0); // root, sometimes fifth
    }
    // Play evolved loop cells (probabilistic by accumulated weight).
    for (const band of ["low", "mid", "high"]) {
      const w = this.grid[band][step];
      if (w > 0.25 && rand(when) < Math.min(0.95, w)) {
        this._voice(band, when, Math.min(1, 0.3 + w * 0.4));
      }
    }
  }

  _setChord(root) {
    // Minor triad in a comfortable mid octave.
    const semis = [0, 3, 7];
    this.padOsc.forEach((o, i) => {
      const midi = 48 + root + semis[i % 3];
      o.frequency.setTargetAtTime(midiToFreq(midi), this.ctx.currentTime, 0.3);
    });
  }

  _bass(when, semitone) {
    const ctx = this.ctx;
    const midi = 28 + this.root + semitone; // low octave
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(midiToFreq(midi), when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.5, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    o.connect(g).connect(this.bus);
    o.start(when); o.stop(when + 0.32);
  }

  // band → instrument: low=kick, mid=snare/clap, high=hat
  _voice(band, when, amp = 0.6) {
    if (band === "low") return this._kick(when, amp);
    if (band === "mid") return this._snare(when, amp);
    return this._hat(when, amp);
  }

  _kick(when, amp) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, when);
    o.frequency.exponentialRampToValueAtTime(48, when + 0.11);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.min(1, amp), when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.33);
    o.connect(g).connect(this.bus);
    o.start(when); o.stop(when + 0.36);
  }

  _snare(when, amp) {
    const ctx = this.ctx;
    const dur = 0.18;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.5 * amp, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(bp).connect(g).connect(this.bus);
    src.start(when); src.stop(when + dur + 0.02);
  }

  _hat(when, amp) {
    const ctx = this.ctx;
    const dur = 0.05;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.3 * amp, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(hp).connect(g).connect(this.bus);
    src.start(when); src.stop(when + dur + 0.02);
  }

  _noiseBuf() {
    if (this._nb) return this._nb;
    const len = Math.floor(this.ctx.sampleRate * 0.3);
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._nb = b;
    return b;
  }

  // ---- recording (shareable track) ----
  startRecording() {
    this._chunks = [];
    if (!window.MediaRecorder) { this.recorder = null; return; }
    const canCheck = typeof MediaRecorder.isTypeSupported === "function";
    let mime = "";
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"]) {
      if (canCheck && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
    }
    try {
      this.recorder = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime } : undefined);
    } catch (_) { this.recorder = null; return; }
    this.recorder.ondataavailable = (e) => { if (e.data.size) this._chunks.push(e.data); };
    this.recorder.start();
  }
  stopRecording() {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === "inactive") return resolve(null);
      this.recorder.onstop = () => resolve(new Blob(this._chunks, { type: this._chunks[0]?.type || "audio/webm" }));
      this.recorder.stop();
    });
  }

  fadeOutAndStop(seconds = 2) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.0001, t, seconds / 4);
  }
  dispose() { if (this._timer) clearTimeout(this._timer); }
}

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
// deterministic-ish jitter keyed on schedule time (Math.random is fine here too)
function rand() { return Math.random(); }
