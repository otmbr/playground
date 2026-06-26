import * as THREE from "three";
import type { SimulationState } from "../core/SimulationState.ts";

// The iconic object: a vibrating pressure membrane between inward collapse and
// outward expansion. A cosmic eardrum. Reacts to audio bass.

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uTension;
  uniform float uFormation;
  uniform float uAudioBass;

  varying vec3 vNormal;
  varying float vWave;

  void main(){
    vNormal = normalize(normalMatrix * normal);

    float waveA = sin(position.y * 32.0 + uTime * 4.0);
    float waveB = sin(position.x * 21.0 - uTime * 2.7);
    float waveC = sin(position.z * 27.0 + uTime * 3.3);
    float membrane = waveA * waveB + waveC * 0.5;
    vWave = membrane;

    float audio = uAudioBass * 0.08;
    vec3 displaced = position
      + normal * membrane * 0.045 * uTension * uFormation
      + normal * audio;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uTension;
  uniform float uFormation;
  uniform float uAudioBass;

  varying vec3 vNormal;
  varying float vWave;

  void main(){
    float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0,0.0,1.0))), 1.8);

    // teal/violet iridescent membrane
    vec3 a = vec3(0.15, 0.85, 0.95);
    vec3 b = vec3(0.75, 0.35, 1.0);
    vec3 col = mix(a, b, 0.5 + 0.5 * vWave);

    float pulse = 0.6 + 0.4 * sin(uTime * 2.0);
    float glow = fres * (0.8 + uAudioBass) + 0.15;

    float alpha = uFormation * (glow * 0.9 + 0.1) * (0.7 + 0.3 * pulse);
    gl_FragColor = vec4(col * (1.0 + glow), clamp(alpha, 0.0, 0.95));
  }
`;

export class GravastarShell {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor() {
    const geometry = new THREE.SphereGeometry(0.62, 192, 192);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uTension: { value: 0 },
        uFormation: { value: 0 },
        uCompactness: { value: 0 },
        uAudioBass: { value: 0 },
      },
      vertexShader,
      fragmentShader,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.visible = false;
  }

  update(state: SimulationState, dt: number, audioBass: number): void {
    const u = this.material.uniforms;
    u.uTime.value += dt;
    u.uTension.value = state.shellTension;
    u.uFormation.value = state.shellFormation;
    u.uCompactness.value = state.compactness;
    u.uAudioBass.value = audioBass;
    this.mesh.visible = state.shellFormation > 0.001 && !state.insideInterior;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
