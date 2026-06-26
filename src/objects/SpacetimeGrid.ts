import * as THREE from "three";
import type { SimulationState } from "../core/SimulationState.ts";

// A flat grid of lines that dips toward the center like an embedding-diagram
// gravity well. The dip deepens with compactness / collapse.

export class SpacetimeGrid {
  readonly mesh: THREE.LineSegments;
  private readonly base: Float32Array;
  private readonly position: THREE.BufferAttribute;
  private readonly material: THREE.LineBasicMaterial;

  constructor(size = 26, divisions = 48) {
    const half = size / 2;
    const step = size / divisions;
    const verts: number[] = [];

    // lines parallel to X
    for (let i = 0; i <= divisions; i++) {
      const z = -half + i * step;
      for (let j = 0; j < divisions; j++) {
        const x0 = -half + j * step;
        const x1 = x0 + step;
        verts.push(x0, 0, z, x1, 0, z);
      }
    }
    // lines parallel to Z
    for (let i = 0; i <= divisions; i++) {
      const x = -half + i * step;
      for (let j = 0; j < divisions; j++) {
        const z0 = -half + j * step;
        const z1 = z0 + step;
        verts.push(x, 0, z0, x, 0, z1);
      }
    }

    const geometry = new THREE.BufferGeometry();
    this.base = new Float32Array(verts);
    this.position = new THREE.BufferAttribute(new Float32Array(verts), 3);
    geometry.setAttribute("position", this.position);

    this.material = new THREE.LineBasicMaterial({
      color: 0x2a4a8c,
      transparent: true,
      opacity: 0.4,
    });

    this.mesh = new THREE.LineSegments(geometry, this.material);
    this.mesh.position.y = -3.2;
    this.mesh.rotation.x = -0.12;
  }

  update(state: SimulationState): void {
    // depth of the well grows with compactness and collapse
    const wellDepth = 1.5 + state.compactness * 14 + state.collapseProgress * 6;
    const arr = this.position.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = this.base[i];
      const z = this.base[i + 2];
      const r = Math.sqrt(x * x + z * z) + 0.6;
      // Flamm-paraboloid-ish dip ~ -k / r
      arr[i + 1] = -wellDepth / r;
    }
    this.position.needsUpdate = true;

    // shift hue: cool blue -> violent magenta as a black hole forms
    const horizon = state.horizonOpacity;
    this.material.color.setRGB(0.16 + horizon * 0.5, 0.29 - horizon * 0.2, 0.55 - horizon * 0.1);
    this.material.opacity = state.insideInterior ? 0 : 0.4;
    this.mesh.visible = !state.insideInterior;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
