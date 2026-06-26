import * as THREE from "three";
import type { SimulationState } from "../core/SimulationState.ts";

// Black-hole outcome: a pure dark sphere plus a glowing photon ring.

export class EventHorizon {
  readonly group = new THREE.Group();
  private readonly sphere: THREE.Mesh;
  private readonly sphereMat: THREE.MeshBasicMaterial;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.ShaderMaterial;

  constructor() {
    const sphereGeo = new THREE.SphereGeometry(0.5, 64, 64);
    this.sphereMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
    this.sphere = new THREE.Mesh(sphereGeo, this.sphereMat);

    // photon ring as a glowing annulus that always faces the camera
    const ringGeo = new THREE.RingGeometry(0.52, 0.78, 128);
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform float uTime; varying vec2 vUv;
        void main(){
          float d = distance(vUv, vec2(0.5));
          float ring = smoothstep(0.5, 0.42, d) * smoothstep(0.30, 0.42, d);
          float flick = 0.85 + 0.15 * sin(uTime*6.0 + vUv.x*40.0);
          vec3 col = mix(vec3(1.0,0.7,0.3), vec3(1.0,0.95,0.8), ring) * flick;
          gl_FragColor = vec4(col, ring * uOpacity);
        }
      `,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);

    this.group.add(this.sphere, this.ring);
    this.group.visible = false;
  }

  update(state: SimulationState, dt: number, camera: THREE.Camera): void {
    const op = state.horizonOpacity;
    this.group.visible = op > 0.001 && !state.insideInterior;
    this.sphereMat.opacity = op;
    this.ringMat.uniforms.uOpacity.value = op;
    this.ringMat.uniforms.uTime.value += dt;
    this.ring.lookAt(camera.position);
  }

  dispose(): void {
    this.sphere.geometry.dispose();
    this.sphereMat.dispose();
    this.ring.geometry.dispose();
    this.ringMat.dispose();
  }
}
