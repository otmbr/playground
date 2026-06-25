// LOW NOISE — SCAN. Brief, abstract analysis of the environment.
// Never stored, never uploaded. We derive a "noiseprint", then drop the stream.

export async function scanEnvironment(audioCtx, durationMs = 2500) {
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (_) {
    // Permission denied / no mic — fall back to a neutral synthetic print.
    return synthPrint();
  }

  const src = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;
  src.connect(analyser);

  const freq = new Uint8Array(analyser.frequencyBinCount);
  const time = new Uint8Array(analyser.fftSize);

  const samples = [];
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);
      samples.push(measure(freq, time, audioCtx.sampleRate));
      if (performance.now() - t0 < durationMs) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });

  // Release the mic immediately.
  stream.getTracks().forEach((t) => t.stop());
  src.disconnect();

  return aggregate(samples);
}

function measure(freq, time, sampleRate) {
  const n = freq.length;
  const nyquist = sampleRate / 2;
  const binHz = nyquist / n;

  let low = 0, mid = 0, high = 0, total = 0, peak = 0, weighted = 0;
  for (let i = 0; i < n; i++) {
    const v = freq[i];
    const hz = i * binHz;
    total += v;
    weighted += v * hz;
    if (v > peak) peak = v;
    if (hz < 250) low += v;
    else if (hz < 2000) mid += v;
    else high += v;
  }
  const centroid = total > 0 ? weighted / total : 0; // brightness
  // RMS from time domain → loudness; zero-crossings → "sharpness/pulse".
  let sum = 0, zc = 0, prev = 0;
  for (let i = 0; i < time.length; i++) {
    const s = (time[i] - 128) / 128;
    sum += s * s;
    if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zc++;
    prev = s;
  }
  const rms = Math.sqrt(sum / time.length);
  return { low, mid, high, total, centroid, rms, zc, peak };
}

function aggregate(samples) {
  const avg = (k) => samples.reduce((a, s) => a + s[k], 0) / samples.length;
  const low = avg("low"), mid = avg("mid"), high = avg("high");
  const band = low + mid + high || 1;

  const noiseLevel = clamp01(avg("rms") * 4);           // overall loudness
  const density = clamp01(avg("total") / (samples[0] ? 12000 : 1)); // spectral fill
  const sharpness = clamp01(avg("centroid") / 5000);    // brightness
  const pulse = clamp01(avg("zc") / 600);               // rate of change
  const lowFreq = clamp01(low / band * 1.6);            // bass weight
  // Voice tends to sit in mid band with moderate sharpness → rough "human presence".
  const human = clamp01((mid / band) * 1.8 - sharpness * 0.4);

  // Composition for the NOISEPRINT line.
  const machine = clamp01(sharpness * (high / band) * 2.2);
  const wind = clamp01(lowFreq * (1 - human) * 1.4);
  const composition = normalize({ HUMAN: human + 0.05, WIND: wind + 0.03, MACHINE: machine + 0.03 });

  return { noiseLevel, density, sharpness, pulse, lowFreq, human, composition, synthetic: false };
}

function synthPrint() {
  // Plausible "quiet room" default when no mic is available.
  const composition = normalize({ HUMAN: 0.5, WIND: 0.2, MACHINE: 0.3 });
  return {
    noiseLevel: 0.45, density: 0.4, sharpness: 0.35, pulse: 0.3,
    lowFreq: 0.4, human: 0.5, composition, synthetic: true,
  };
}

export function formatNoiseprint(print) {
  const c = print.composition;
  const parts = Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${Math.round(v * 100)}% ${k}`);
  return `NOISEPRINT: ${parts.join(" / ")}`;
}

function normalize(obj) {
  const sum = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const k in obj) out[k] = obj[k] / sum;
  return out;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
