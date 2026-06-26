// LOW NOISE — Input. Movement, touch, stillness.
// Five interactions: Tilt, Hold, Swipe, Tap, Stillness.

export class InputManager {
  constructor(target = window) {
    this.target = target;
    this.state = {
      tiltLR: 0,     // -1..1  (gamma / left-right)
      tiltFB: 0,     // -1..1  (beta / forward-back)
      holding: false,
      holdTime: 0,   // seconds held
      twoFinger: false,
      stillness: 0,  // 0..1   rolling calm of the device
      pointerX: 0.5, // 0..1
      pointerY: 0.5,
    };

    // discrete-event listeners
    this._on = { tap: [], swipe: [] };

    this._hasOrientation = false;
    this._lastG = 0; this._lastB = 0;
    this._motionAccum = 0;
    this._lastTime = performance.now();

    // touch tracking
    this._touchStart = null;
    this._holdStartT = 0;
    this._moved = false;
  }

  on(evt, fn) { this._on[evt]?.push(fn); return this; }
  _emit(evt, data) { this._on[evt]?.forEach((f) => f(data)); }

  // iOS 13+ requires a user-gesture permission request.
  async requestPermissions() {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function") {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") return false;
      }
    } catch (_) { /* ignore — fall back to touch-only */ }
    return true;
  }

  attach() {
    window.addEventListener("deviceorientation", this._orient, true);
    const el = this.target;
    el.addEventListener("pointerdown", this._down, { passive: false });
    el.addEventListener("pointermove", this._move, { passive: false });
    el.addEventListener("pointerup", this._up, { passive: false });
    el.addEventListener("pointercancel", this._up, { passive: false });
    el.addEventListener("touchstart", this._touch, { passive: false });
    el.addEventListener("touchend", this._touchEnd, { passive: false });
  }

  detach() {
    window.removeEventListener("deviceorientation", this._orient, true);
    const el = this.target;
    el.removeEventListener("pointerdown", this._down);
    el.removeEventListener("pointermove", this._move);
    el.removeEventListener("pointerup", this._up);
    el.removeEventListener("pointercancel", this._up);
    el.removeEventListener("touchstart", this._touch);
    el.removeEventListener("touchend", this._touchEnd);
  }

  // ---- orientation -------------------------------------------------------
  _orient = (e) => {
    if (e.gamma == null && e.beta == null) return;
    this._hasOrientation = true;
    const g = e.gamma || 0; // -90..90 left-right
    const b = e.beta || 0;  // -180..180 front-back
    this.state.tiltLR = clamp(g / 45, -1, 1);
    this.state.tiltFB = clamp((b - 45) / 45, -1, 1); // ~45° upright = neutral
    this._motionAccum += Math.abs(g - this._lastG) + Math.abs(b - this._lastB);
    this._lastG = g; this._lastB = b;
  };

  // ---- pointer / touch ---------------------------------------------------
  _down = (e) => {
    e.preventDefault();
    this.state.holding = true;
    this._holdStartT = performance.now();
    this._touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    this._moved = false;
    this.state.pointerX = e.clientX / window.innerWidth;
    this.state.pointerY = e.clientY / window.innerHeight;
  };

  _move = (e) => {
    if (!this.state.holding) return;
    e.preventDefault();
    this.state.pointerX = e.clientX / window.innerWidth;
    this.state.pointerY = e.clientY / window.innerHeight;
    if (this._touchStart) {
      const dx = e.clientX - this._touchStart.x;
      const dy = e.clientY - this._touchStart.y;
      if (Math.hypot(dx, dy) > 18) {
        this._moved = true;
        // continuous swipe signal (used to "pull" interference)
        this._emit("swipe", { dx, dy, x: this.state.pointerX, y: this.state.pointerY });
      }
      // If no orientation sensor, let vertical drag drive depth, horizontal drive filter.
      if (!this._hasOrientation) {
        this.state.tiltLR = clamp((this.state.pointerX - 0.5) * 2, -1, 1);
        this.state.tiltFB = clamp((0.5 - this.state.pointerY) * 2, -1, 1);
      }
    }
  };

  _up = (e) => {
    e.preventDefault();
    const dt = performance.now() - this._holdStartT;
    if (!this._moved && dt < 220) {
      // a short, still touch = TAP (remove artifact)
      this._emit("tap", { x: this.state.pointerX, y: this.state.pointerY });
    }
    this.state.holding = false;
    this.state.holdTime = 0;
    this._touchStart = null;
  };

  _touch = (e) => {
    this.state.twoFinger = e.touches.length >= 2;
  };
  _touchEnd = (e) => {
    this.state.twoFinger = (e.touches && e.touches.length >= 2);
  };

  // ---- per-frame update --------------------------------------------------
  update() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastTime) / 1000);
    this._lastTime = now;

    if (this.state.holding) this.state.holdTime += dt;

    // Stillness: how little the device + finger have moved recently.
    // motionAccum is degrees of orientation change since last frame.
    const motion = this._motionAccum + (this._moved ? 6 : 0);
    this._motionAccum = 0;
    const calmTarget = 1 - clamp(motion / 8, 0, 1);
    // ease toward target; stillness must be *earned* over time.
    this.state.stillness += (calmTarget - this.state.stillness) * Math.min(1, dt * 2.2);
    this.state.stillness = clamp(this.state.stillness, 0, 1);
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
