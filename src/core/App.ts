import * as THREE from "three";
import gsap from "gsap";

import { clamp } from "./math.ts";
import {
  bounceReady,
  recomputeDerived,
  updateTimeline,
} from "./PhysicsToyModel.ts";
import {
  createInitialState,
  Store,
  type AppMode,
  type ObserverMode,
} from "./SimulationState.ts";

import { CollapsingStar } from "../objects/CollapsingStar.ts";
import { SpacetimeGrid } from "../objects/SpacetimeGrid.ts";
import { DustSphere } from "../objects/DustSphere.ts";
import { EventHorizon } from "../objects/EventHorizon.ts";
import { GravastarShell } from "../objects/GravastarShell.ts";
import { DeSitterInterior } from "../objects/DeSitterInterior.ts";
import { InformationRain } from "../objects/InformationRain.ts";
import { Starfield } from "../objects/Starfield.ts";
import { InteriorUniverse } from "../objects/InteriorUniverse.ts";

import { AudioEngine } from "../audio/AudioEngine.ts";
import { CameraRig, type CameraHome } from "./CameraRig.ts";
import { HUD } from "../ui/HUD.ts";
import { Controls } from "../ui/Controls.ts";
import { Scope } from "../ui/Scope.ts";
import { OUTCOME_COPY } from "../ui/labels.ts";

// Camera "home" poses per observer mode, in spherical orbit coordinates.
const CAMERA_HOME: Record<ObserverMode, CameraHome> = {
  external: { theta: 0.5, phi: 1.2, radius: 7 },
  falling: { theta: 0.0, phi: 1.5, radius: 3.0 },
  interior: { theta: 0.0, phi: 1.4, radius: 18 },
};

function haptic(pattern: number | number[]): void {
  navigator.vibrate?.(pattern);
}

export class App {
  readonly store = new Store(createInitialState());

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private star = new CollapsingStar();
  private grid = new SpacetimeGrid();
  private dust = new DustSphere();
  private horizon = new EventHorizon();
  private shell = new GravastarShell();
  private deSitter = new DeSitterInterior();
  private infoRain = new InformationRain();
  private starfield = new Starfield();
  private interior = new InteriorUniverse();

  private audio = new AudioEngine();
  private hud = new HUD();
  private controls: Controls;
  private rig: CameraRig;
  private scope = new Scope(document.getElementById("scope") as HTMLCanvasElement);

  private flashEl = document.getElementById("flash") as HTMLElement;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private collapseTween?: gsap.core.Tween;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x02030a, 1);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.01,
      1000,
    );
    this.rig = new CameraRig(this.camera);
    this.rig.snapTo(CAMERA_HOME.external);

    this.scene.add(
      this.starfield.points,
      this.grid.mesh,
      this.dust.points,
      this.star.mesh,
      this.horizon.group,
      this.shell.mesh,
      this.deSitter.group,
      this.infoRain.points,
      this.interior.group,
    );

    const ambient = new THREE.AmbientLight(0x223355, 0.6);
    this.scene.add(ambient);

    recomputeDerived(this.store.state);

    this.controls = new Controls(this.store, {
      onCollapse: () => this.startCollapse(),
      onReset: () => this.reset(),
      onEnterInterior: () => this.enterInterior(),
      onToggleHonesty: () => this.hud.toggleLegend(),
      onScience: () => this.hud.toggleScience(),
      onToggleMute: () => this.toggleMute(),
      onShare: () => this.shareSeed(),
      onObserver: (m) => this.setObserver(m),
      onMode: (m) => this.setMode(m),
      onHint: (h) => this.hud.caption(h),
    });

    // Re-render UI whenever state changes.
    this.store.subscribe((s) => {
      this.hud.render(s);
      this.controls.render();
      this.controls.setInteriorEnabled(s.outcome === "gravastar" && s.collapseProgress > 0.7);
    });

    this.loadFromHash();
    this.setupInput();

    window.addEventListener("resize", () => this.onResize());
    this.onResize();
  }

  // ----- pointer / touch input (orbit, pinch-zoom, double-tap) ----------

  private setupInput(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = "none";

    const pointers = new Map<number, { x: number; y: number }>();
    let lastX = 0;
    let lastY = 0;
    let lastDist = 0;
    let downTime = 0;
    let downX = 0;
    let downY = 0;
    let lastTap = 0;

    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        this.rig.startDrag();
        lastX = e.clientX;
        lastY = e.clientY;
        downTime = performance.now();
        downX = e.clientX;
        downY = e.clientY;
      } else if (pointers.size === 2) {
        const p = [...pointers.values()];
        lastDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      }
    });

    el.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        this.rig.drag(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX;
        lastY = e.clientY;
      } else if (pointers.size === 2) {
        const p = [...pointers.values()];
        const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (lastDist > 0) this.rig.zoom(lastDist / dist);
        lastDist = dist;
      }
    });

    const onUp = (e: PointerEvent) => {
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (pointers.size < 2) lastDist = 0;
      if (pointers.size === 0) {
        this.rig.endDrag();
        // tap vs drag: short, with little movement
        if (wasSingle) {
          const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
          const quick = performance.now() - downTime < 250;
          if (moved < 8 && quick) {
            const now = performance.now();
            if (now - lastTap < 320) {
              this.rig.animateTo(this.currentHome(), this.reducedMotion ? 0.4 : 1.0);
              this.hud.caption("View reset.");
              haptic(15);
              lastTap = 0;
            } else {
              lastTap = now;
            }
          }
        }
      } else if (pointers.size === 1) {
        const p = [...pointers.values()][0];
        lastX = p.x;
        lastY = p.y;
        this.rig.startDrag();
      }
    };
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.rig.zoom(e.deltaY > 0 ? 1.08 : 0.92);
      },
      { passive: false },
    );

    el.addEventListener("dblclick", () => {
      this.rig.animateTo(this.currentHome(), this.reducedMotion ? 0.4 : 1.0);
    });
  }

  private currentHome(): CameraHome {
    return CAMERA_HOME[this.store.state.observerMode];
  }

  /** Called after the intro gate; unlocks audio and starts the render loop. */
  async start(): Promise<void> {
    await this.audio.unlock();
    this.audio.setMuted(this.store.state.muted);
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
    this.hud.caption("System online. Steer the collapse.");
    if (window.matchMedia("(pointer: coarse)").matches) {
      this.hud.caption("Drag to rotate · pinch to zoom · double-tap to reset view.");
    }
  }

  // ----- interactions ---------------------------------------------------

  private startCollapse(): void {
    const s = this.store.state;
    if (s.collapsing) return;
    this.collapseTween?.kill();
    this.store.update((st) => {
      st.collapsing = true;
      st.insideInterior = false;
      st.bounced = false;
      st.collapseProgress = 0;
      st.radiusKm = st.initialRadiusKm;
      recomputeDerived(st);
    });
    this.interior.setActive(false);
    this.hud.caption("Fuel exhausted. Collapse begins.");
    haptic(20);

    const proxy = { t: 0 };
    const duration = this.reducedMotion ? 4 : 8;
    this.collapseTween = gsap.to(proxy, {
      t: 1,
      duration,
      ease: "power2.in",
      onUpdate: () => {
        this.store.update((st) => updateTimeline(st, proxy.t));
        this.maybeBounce();
      },
      onComplete: () => {
        this.store.update((st) => {
          st.collapsing = false;
        });
        this.announceOutcome();
      },
    });
  }

  /** The signature "Bounce" event (Section 18A.13). */
  private maybeBounce(): void {
    const s = this.store.state;
    if (s.bounced || !bounceReady(s)) return;
    this.store.update((st) => {
      st.bounced = true;
    });
    this.hud.caption("[Audio caption] Interior harmonic bloom detected.");
    this.hud.caption("Mini Big Bang detected. Collapse halted by vacuum pressure.");
    this.audio.strikeShell(0.7);
    haptic([30, 40, 60]);
    if (!this.reducedMotion) this.doFlash();
  }

  private doFlash(): void {
    // near black-out, then a bright bloom — "Collapse did not end. It turned inside out."
    gsap.killTweensOf(this.flashEl);
    gsap.set(this.flashEl, { background: "#000", opacity: 0 });
    gsap
      .timeline()
      .to(this.flashEl, { opacity: 0.9, duration: 0.25 })
      .set(this.flashEl, { background: "radial-gradient(circle, #cfe9ff 0%, #6fb8ff 40%, #02030a 100%)" })
      .to(this.flashEl, { opacity: 0, duration: 1.4, ease: "power3.out" });
  }

  private announceOutcome(): void {
    const s = this.store.state;
    for (const line of OUTCOME_COPY[s.outcome]) this.hud.caption(line);
    if (s.outcome === "black-hole") {
      this.hud.caption("[Audio caption] High frequencies disappearing.");
    }
  }

  private enterInterior(): void {
    const s = this.store.state;
    if (s.outcome !== "gravastar") return;
    if (s.insideInterior) {
      this.exitInterior();
      return;
    }
    this.hud.caption("Entering interior. Scale inversion engaged.");
    haptic(25);

    // Section 8 trick: dolly the camera through the thin shell, then switch
    // scenes and reframe at cosmological scale.
    this.rig.tweenRadius(0.4, this.reducedMotion ? 0.8 : 2.4, () => {
      this.store.update((st) => {
        st.insideInterior = true;
        st.observerMode = "interior";
      });
      this.interior.setActive(true);
      this.rig.snapTo(CAMERA_HOME.interior);
      this.audio.strikeShell(0.4);
      this.hud.caption("Inside is larger than outside. Spacetime expands.");
    });
  }

  private exitInterior(): void {
    this.store.update((st) => {
      st.insideInterior = false;
      st.observerMode = "external";
    });
    this.interior.setActive(false);
    this.rig.snapTo(CAMERA_HOME.external);
    document.querySelectorAll(".obs").forEach((b) => b.classList.remove("active"));
    document.querySelector('.obs[data-observer="external"]')?.classList.add("active");
  }

  private reset(): void {
    this.collapseTween?.kill();
    const fresh = createInitialState();
    this.store.update((st) => {
      Object.assign(st, fresh);
      recomputeDerived(st);
    });
    this.interior.setActive(false);
    this.setObserver("external");
    this.hud.caption("Reset. A new star awaits.");
  }

  private setObserver(mode: ObserverMode): void {
    if (mode === "interior") {
      this.enterInterior();
      return;
    }
    if (this.store.state.insideInterior) this.exitInterior();
    this.store.patch({ observerMode: mode });
    this.rig.animateTo(CAMERA_HOME[mode], this.reducedMotion ? 0.5 : 1.6);
  }

  private setMode(mode: AppMode): void {
    this.store.patch({ appMode: mode });
  }

  private toggleMute(): void {
    const muted = !this.store.state.muted;
    this.store.patch({ muted });
    this.audio.setMuted(muted);
    this.controls.setMuted(muted);
  }

  // ----- presets / sharing ---------------------------------------------

  private shareSeed(): void {
    const s = this.store.state;
    const seed = {
      m: +s.massSolar.toFixed(2),
      r: +s.initialRadiusKm.toFixed(2),
      v: +s.vacuumEnergy.toFixed(3),
      s: +s.shellTension.toFixed(3),
      n: +s.quantumNoise.toFixed(3),
      e: +s.entropyLeakage.toFixed(3),
    };
    const hash = "#" + btoa(JSON.stringify(seed));
    const url = location.origin + location.pathname + hash;
    history.replaceState(null, "", hash);
    navigator.clipboard?.writeText(url).then(
      () => this.hud.caption("Universe seed copied to clipboard."),
      () => this.hud.caption("Universe seed set in URL."),
    );
  }

  private loadFromHash(): void {
    if (!location.hash || location.hash.length < 2) return;
    try {
      const seed = JSON.parse(atob(location.hash.slice(1)));
      this.store.update((s) => {
        if (typeof seed.m === "number") s.massSolar = clamp(seed.m, 3, 50);
        if (typeof seed.r === "number") {
          s.initialRadiusKm = clamp(seed.r, 5, 250);
          s.radiusKm = s.initialRadiusKm;
        }
        if (typeof seed.v === "number") s.vacuumEnergy = clamp(seed.v, 0, 1);
        if (typeof seed.s === "number") s.shellTension = clamp(seed.s, 0, 1);
        if (typeof seed.n === "number") s.quantumNoise = clamp(seed.n, 0, 1);
        if (typeof seed.e === "number") s.entropyLeakage = clamp(seed.e, 0, 1);
        recomputeDerived(s);
      });
    } catch {
      /* ignore malformed seeds */
    }
  }

  // ----- loop -----------------------------------------------------------

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const s = this.store.state;

    const bands = this.audio.getBands();

    this.starfield.update(dt);
    this.grid.update(s);
    this.dust.update(s, dt);
    this.star.update(s, dt, bands.highs);
    this.horizon.update(s, dt, this.camera);
    this.shell.update(s, dt, bands.bass);
    this.deSitter.update(s, dt, bands.mids);
    this.infoRain.update(s, dt);
    this.interior.update(s, dt, bands.mids);

    this.audio.update(s);

    // orbit camera (user drag + inertia + gentle idle auto-rotate)
    this.rig.update(dt);

    // live oscilloscope readout, tinted by the current fate
    if (this.scope.visible) {
      const color =
        s.outcome === "black-hole"
          ? "#ff7a5c"
          : s.outcome === "gravastar"
            ? "#15d9f2"
            : "#7fd0ff";
      this.scope.draw(this.audio.getTimeDomain(), color, dt);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
