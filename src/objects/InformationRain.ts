import * as THREE from "three";
import { clamp, lerp } from "../core/math.ts";
import type { SimulationState } from "../core/SimulationState.ts";

// The information problem, told emotionally. Fragments fall toward the object.
//   black-hole path: stretch, redshift, freeze near horizon, fade to black.
//   gravastar path:  stick to the shell, form a surface pattern, echo faintly.

interface InfoParticle {
  base: THREE.Vector3; // direction on the unit sphere
  startR: number;
  opacity: number;
  stretch: number;
}

export class InformationRain {
  readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly particles: InfoParticle[] = [];
  private readonly count: number;

  constructor(count = 700) {
    this.count = count;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();
      const r = 3.5 + Math.random() * 3.5;
      this.particles.push({ base: dir, startR: r, opacity: 0.9, stretch: 1 });
      positions[i * 3] = dir.x * r;
      positions[i * 3 + 1] = dir.y * r;
      positions[i * 3 + 2] = dir.z * r;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.material = new THREE.PointsMaterial({
      color: 0x9fd8ff,
      size: 0.06,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, this.material);
  }

  update(state: SimulationState, dt: number): void {
    if (state.insideInterior || state.collapseProgress < 0.05) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;

    const attr = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const shellR = 0.62; // matches GravastarShell radius
    const horizonR = 0.55;

    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      // fall inward, tracking collapse progress
      const fall = clamp(state.collapseProgress * 1.2, 0, 1);
      let r = lerp(p.startR, shellR + 0.2, fall);

      if (state.outcome === "black-hole") {
        // freeze and fade near the horizon, stretch radially
        r = Math.max(r, horizonR + 0.02 + (1 - state.horizonOpacity) * 0.3);
        p.opacity = Math.max(0, p.opacity - dt * 0.12 * state.horizonOpacity);
        p.stretch = lerp(p.stretch, 6.0, dt * 0.5);
      } else if (state.outcome === "gravastar") {
        // snap to the shell as it forms, brighten
        r = lerp(r, shellR, state.shellFormation);
        p.opacity = lerp(p.opacity, 1.0, dt);
        p.stretch = lerp(p.stretch, 1.0, dt);
      }

      arr[i * 3] = p.base.x * r;
      arr[i * 3 + 1] = p.base.y * r;
      arr[i * 3 + 2] = p.base.z * r;
    }
    attr.needsUpdate = true;

    // overall tint: gravastar keeps cyan; black hole drifts to red then dark
    if (state.outcome === "black-hole") {
      const k = state.horizonOpacity;
      this.material.color.setRGB(lerp(0.62, 0.5, k), lerp(0.85, 0.1, k), lerp(1.0, 0.1, k));
      this.material.opacity = lerp(0.9, 0.05, k);
    } else {
      this.material.color.setRGB(0.62, 0.85, 1.0);
      this.material.opacity = 0.9;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
