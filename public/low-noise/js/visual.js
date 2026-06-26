// LOW NOISE — Visual field. No notes, no character. You are the signal.
// Black space · neon lines · bass waves · interference particles · trembling core.

const SIGNAL = [57, 255, 139];
const DEEP = [30, 111, 255];

export class Visual {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.particles = [];
    this.phase = 0;
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._seedParticles(120);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.cv.width = w * this.dpr;
    this.cv.height = h * this.dpr;
    this.cv.style.width = w + "px";
    this.cv.style.height = h + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _seedParticles(n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: 0.5 + Math.random() * 1.5,
        seed: Math.random() * 6.28,
      });
    }
  }

  // params = audio.params, input = inputManager.state, signal = 0..1 cleanliness
  render(params, input, signal, dt) {
    const { ctx, w, h } = this;
    this.phase += dt;
    const cx = w / 2, cy = h * 0.46;
    const low = params.low || 0;
    const noise = params.noise;

    // --- background: trailing fade (motion blur) + deep glow, darker in LOW ---
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(0,0,0,${0.18 + low * 0.12})`;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.7);
    const gI = 0.10 + signal * 0.12 + low * 0.1;
    glow.addColorStop(0, rgba(DEEP, gI * (1 - low * 0.4)));
    glow.addColorStop(0.5, rgba(DEEP, gI * 0.25));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // --- radar grid (faint), tilts with the device ---
    this._radar(cx, cy, params, input, low);

    // --- interference particles (count + agitation track NOISE) ---
    ctx.globalCompositeOperation = "lighter";
    const active = Math.floor(20 + noise * (this.particles.length - 20));
    const agitation = 0.4 + noise * 2.2 - input.stillness * 0.6;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const on = i < active;
      p.x += p.vx * agitation * dt * 0.12;
      p.y += p.vy * agitation * dt * 0.12;
      if (p.x < 0) p.x += 1; if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y += 1; if (p.y > 1) p.y -= 1;
      if (!on) continue;
      const px = p.x * w, py = p.y * h;
      const tw = 0.5 + 0.5 * Math.sin(this.phase * 3 + p.seed);
      const a = (0.05 + tw * 0.18) * noise;
      ctx.fillStyle = rgba(noise > 0.5 ? [180, 200, 220] : SIGNAL, a);
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, 6.2832);
      ctx.fill();
    }

    // --- bass waves (bottom), swell with bassCharge + LOW ---
    this._bassWaves(cx, cy, params, low);

    // --- central signal: clean & calm when stable, trembling when noisy ---
    this._core(cx, cy, params, input, signal, low);

    ctx.globalCompositeOperation = "source-over";
  }

  _radar(cx, cy, params, input, low) {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1;
    const tilt = input.tiltLR * 0.18;
    ctx.translate(cx, cy);
    ctx.transform(1, input.tiltFB * 0.06, tilt, 1, 0, 0);
    ctx.strokeStyle = rgba(DEEP, 0.10 + low * 0.05);
    const rings = 5;
    for (let i = 1; i <= rings; i++) {
      const r = (Math.min(w, h) * 0.55) * (i / rings) * (1 + params.depth * 0.1);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 6.2832);
      ctx.stroke();
    }
    // sweep line
    const sweep = this.phase * (0.6 + (1 - params.noise) * 0.6);
    ctx.strokeStyle = rgba(SIGNAL, 0.10);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(sweep) * Math.max(w, h), Math.sin(sweep) * Math.max(w, h));
    ctx.stroke();
    ctx.restore();
  }

  _bassWaves(cx, cy, params, low) {
    const { ctx, w, h } = this;
    const amp = (params.bassCharge * 22 + low * 40 + params.depth * 10);
    if (amp < 1) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const layers = 3;
    for (let L = 0; L < layers; L++) {
      const baseY = h * (0.7 + L * 0.08);
      const a = (0.18 - L * 0.04) * (0.4 + low);
      ctx.strokeStyle = rgba(L === 0 ? SIGNAL : DEEP, a);
      ctx.lineWidth = 2 - L * 0.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const k = x / w * 6.2832 * (1 + L);
        const y = baseY + Math.sin(k + this.phase * (1.2 + L * 0.4)) * amp * (1 - L * 0.25);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _core(cx, cy, params, input, signal, low) {
    const { ctx } = this;
    const baseR = Math.min(this.w, this.h) * (0.12 + low * 0.05);
    const tremble = (1 - signal) * (1 - input.stillness) * 14;
    const segs = 64;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // outer halo
    const halo = ctx.createRadialGradient(cx, cy, baseR * 0.3, cx, cy, baseR * 2.4);
    halo.addColorStop(0, rgba(SIGNAL, 0.22 + signal * 0.25));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 2.4, 0, 6.2832);
    ctx.fill();

    // the signal ring — irregular when noisy, a clean circle when stable
    ctx.lineWidth = 2 + signal * 2 + low * 2;
    ctx.strokeStyle = rgba(low > 0.4 ? mix(SIGNAL, DEEP, low) : SIGNAL, 0.85);
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * 6.2832;
      const wobble = Math.sin(ang * 6 + this.phase * 5) * tremble
                   + (Math.random() - 0.5) * tremble * 0.6;
      const r = baseR + wobble + Math.sin(this.phase * 2 + ang) * (2 + low * 6);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // bright stable core dot — grows as you lock the signal
    const dotR = 3 + signal * 8 + low * 6;
    ctx.fillStyle = rgba(SIGNAL, 0.9);
    ctx.shadowColor = `rgb(${SIGNAL.join(",")})`;
    ctx.shadowBlur = 20 + signal * 30;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }
}

function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
