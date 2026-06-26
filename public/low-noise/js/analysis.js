// LOW NOISE — CITY DUB autodetection.
// Continuous, local mic analysis. Nothing stored, nothing uploaded.
// Extracts: onsets (events), tempo (from walking cadence), pitch/key,
// band energy (low/mid/high) and loudness. The environment composes the track.

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export class AudioAnalyzer {
  constructor(audioCtx) {
    this.ctx = audioCtx;
    this.stream = null;
    this.analyser = null;
    this.onOnset = null; // (band:'low'|'mid'|'high', strength:0..1) => void

    this.state = {
      bpm: 100,
      freq: 0,
      note: null,       // 0..11 pitch class
      noteName: "—",
      bands: { low: 0, mid: 0, high: 0 },
      centroid: 0,
      level: 0,         // 0..1 loudness
      onsetRate: 0,     // onsets / second (rolling)
      confidence: 0,    // tempo confidence 0..1
    };

    this._prevMag = null;
    this._fluxAvg = 0;
    this._lastOnset = 0;
    this._onsetTimes = [];   // ms timestamps, last ~8s
    this._noteVotes = new Array(12).fill(0);
    this._frame = 0;
    this._t0 = 0;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    src.connect(this.analyser);

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Float32Array(this.analyser.fftSize);
    this._prevMag = new Float32Array(this.analyser.frequencyBinCount);
    this._t0 = performance.now();
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  // Called every animation frame.
  update(nowMs) {
    if (!this.analyser) return;
    this.analyser.getByteFrequencyData(this.freqData);
    this._frame++;

    const f = this.freqData, n = f.length;
    const nyq = this.ctx.sampleRate / 2, binHz = nyq / n;

    // --- band energy + centroid + spectral flux (onset detector) ---
    let low = 0, mid = 0, high = 0, total = 0, weighted = 0;
    let flux = 0, fluxLow = 0, fluxMid = 0, fluxHigh = 0;
    for (let i = 0; i < n; i++) {
      const mag = f[i] / 255;
      const hz = i * binHz;
      total += mag; weighted += mag * hz;
      const d = mag - this._prevMag[i];
      const pos = d > 0 ? d : 0;
      if (hz < 250) { low += mag; fluxLow += pos; }
      else if (hz < 2000) { mid += mag; fluxMid += pos; }
      else { high += mag; fluxHigh += pos; }
      flux += pos;
      this._prevMag[i] = mag;
    }
    const band = low + mid + high || 1;
    this.state.bands = { low: low / band, mid: mid / band, high: high / band };
    this.state.centroid = total > 0 ? weighted / total : 0;
    this.state.level = lerp(this.state.level, clamp01(total / n * 6), 0.2);

    // --- onset detection: adaptive threshold on spectral flux ---
    this._fluxAvg = this._fluxAvg * 0.92 + flux * 0.08;
    const threshold = this._fluxAvg * 1.5 + 0.6;
    const since = nowMs - this._lastOnset;
    if (flux > threshold && since > 120) { // debounce ~120ms
      this._lastOnset = nowMs;
      // which band drove the onset?
      const band3 = Math.max(fluxLow, fluxMid, fluxHigh);
      const which = band3 === fluxLow ? "low" : band3 === fluxMid ? "mid" : "high";
      const strength = clamp01(flux / (threshold * 2));
      this._onsetTimes.push(nowMs);
      if (this.onOnset) this.onOnset(which, strength);
    }
    // trim onset history to 8s
    const cutoff = nowMs - 8000;
    while (this._onsetTimes.length && this._onsetTimes[0] < cutoff) this._onsetTimes.shift();
    this.state.onsetRate = this._onsetTimes.length / 8;

    // --- pitch (every 6 frames; autocorrelation is the expensive part) ---
    if (this._frame % 6 === 0) this._detectPitch();

    // --- tempo (every ~30 frames ≈ twice a second) ---
    if (this._frame % 30 === 0) this._detectTempo();
  }

  _detectPitch() {
    this.analyser.getFloatTimeDomainData(this.timeData);
    const buf = this.timeData, size = buf.length, sr = this.ctx.sampleRate;

    // RMS gate — ignore near-silence (no reliable pitch).
    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.008) return;

    // Autocorrelation over a musical range (~65–1000 Hz).
    const minLag = Math.floor(sr / 1000), maxLag = Math.floor(sr / 65);
    let bestLag = -1, bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < size - lag; i++) corr += buf[i] * buf[i + lag];
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }
    if (bestLag <= 0) return;
    const freq = sr / bestLag;
    if (freq < 60 || freq > 1100) return;

    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    this._noteVotes[pc] += 1;
    this.state.freq = freq;

    // Decay votes so the key can drift with the environment.
    if (this._frame % 180 === 0) for (let i = 0; i < 12; i++) this._noteVotes[i] *= 0.6;

    let top = 0;
    for (let i = 1; i < 12; i++) if (this._noteVotes[i] > this._noteVotes[top]) top = i;
    this.state.note = top;
    this.state.noteName = NOTE_NAMES[top];
  }

  _detectTempo() {
    const times = this._onsetTimes;
    if (times.length < 4) { this.state.confidence = 0; return; }

    // Inter-onset interval histogram (30ms bins, 300–1000ms = 60–200 steps/min).
    const bins = {};
    for (let i = 1; i < times.length; i++) {
      const iv = times[i] - times[i - 1];
      if (iv < 280 || iv > 1100) continue;
      const b = Math.round(iv / 30) * 30;
      bins[b] = (bins[b] || 0) + 1;
    }
    let bestIv = 0, bestCount = 0, totalCount = 0;
    for (const b in bins) { totalCount += bins[b]; if (bins[b] > bestCount) { bestCount = bins[b]; bestIv = +b; } }
    if (!bestIv) { this.state.confidence = 0; return; }

    let bpm = 60000 / bestIv;
    while (bpm > 150) bpm /= 2;
    while (bpm < 70) bpm *= 2;

    this.state.bpm = lerp(this.state.bpm, bpm, 0.3);
    this.state.confidence = clamp01(bestCount / Math.max(4, totalCount));
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
