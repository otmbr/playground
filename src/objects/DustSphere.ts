import * as THREE from "three";
import { lerp } from "../core/math.ts";
import type { SimulationState } from "../core/SimulationState.ts";

// Infalling dust shell — particles that spiral inward as the star collapses.

export class DustSphere {
  readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly radii: Float32Array;
  private readonly angles: Float32Array;
  private readonly speeds: Float32Array;
  private readonly heights: Float32Array;
  private readonly count: number;

  constructor(count = 2200) {
    this.count = count;
    const positions = new Float32Array(count * 3);
    this.radii = new Float32Array(count);
    this.angles = new Float32Array(count);
    this.speeds = new Float32Array(count);
    this.heights = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 2.5 + Math.random() * 4.0;
      const a = Math.random() * Math.PI * 2;
      this.radii[i] = r;
      this.angles[i] = a;
      this.speeds[i] = 0.2 + Math.random() * 0.8;
      this.heights[i] = (Math.random() - 0.5) * 3.0;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = this.heights[i];
      positions[i * 3 + 2] = Math.sin(a) * r;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    this.material = new THREE.PointsMaterial({
      color: 0xffb070,
      size: 0.045,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, this.material);
  }

  update(state: SimulationState, dt: number): void {
    const attr = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const inward = 0.2 + state.collapseProgress * 2.4;

    for (let i = 0; i < this.count; i++) {
      // spiral inward; faster the deeper the collapse
      this.angles[i] += dt * this.speeds[i] * (0.5 + state.collapseProgress * 3.0);
      const targetR = lerp(this.radii[i], 0.25, state.collapseProgress);
      const r = targetR - state.collapseProgress * inward * 0.05;
      const rr = Math.max(r, 0.12);
      const h = this.heights[i] * (1 - state.collapseProgress * 0.85);
      arr[i * 3] = Math.cos(this.angles[i]) * rr;
      arr[i * 3 + 1] = h;
      arr[i * 3 + 2] = Math.sin(this.angles[i]) * rr;
    }
    attr.needsUpdate = true;

    // redden as collapse proceeds
    this.material.color.setRGB(1.0, lerp(0.69, 0.2, state.collapseProgress), lerp(0.44, 0.08, state.collapseProgress));
    this.material.opacity = state.insideInterior ? 0 : 0.85;
    this.points.visible = !state.insideInterior;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
