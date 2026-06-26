import * as THREE from "three";
import { lerp } from "../core/math.ts";
import type { SimulationState } from "../core/SimulationState.ts";

// A turbulent plasma sphere that shrinks, reddens and grows unstable as it
// collapses. Reacts to audio highs for shimmer.

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uCollapse;
  uniform float uNoise;
  uniform float uAudioHighs;

  varying vec3 vNormal;
  varying vec3 vPos;
  varying float vDisp;

  // cheap value noise
  float hash(vec3 p){ return fract(sin(dot(p, vec3(17.1,113.5,71.7)))*43758.5453); }
  float vnoise(vec3 p){
    vec3 i = floor(p); vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n000=hash(i+vec3(0,0,0)); float n100=hash(i+vec3(1,0,0));
    float n010=hash(i+vec3(0,1,0)); float n110=hash(i+vec3(1,1,0));
    float n001=hash(i+vec3(0,0,1)); float n101=hash(i+vec3(1,0,1));
    float n011=hash(i+vec3(0,1,1)); float n111=hash(i+vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
               mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
  }

  void main(){
    vNormal = normalize(normalMatrix * normal);
    vPos = position;

    float t = uTime * (0.4 + uCollapse * 2.5);
    float n = vnoise(position * 2.4 + t);
    n += 0.5 * vnoise(position * 5.1 - t * 0.7);

    // surface gets more violent as collapse + quantum noise rise
    float amp = 0.04 + uCollapse * 0.10 + uNoise * 0.08 + uAudioHighs * 0.05;
    float disp = (n - 0.5) * amp;
    vDisp = disp;

    vec3 displaced = position + normal * disp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uCollapse;
  uniform float uCompactness;
  uniform float uAudioHighs;

  varying vec3 vNormal;
  varying vec3 vPos;
  varying float vDisp;

  void main(){
    // hot core -> cooler edge, shifting redder as it collapses
    vec3 hot = vec3(1.0, 0.95, 0.75);
    vec3 mid = vec3(1.0, 0.55, 0.18);
    vec3 cool = vec3(0.85, 0.12, 0.05);

    float fres = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0,0.0,1.0)), 0.0), 2.0);
    float band = 0.5 + 0.5 * sin(vPos.y * 14.0 + uTime * 2.0);

    vec3 col = mix(mid, hot, band);
    // redshift toward cool as collapse + compactness rise
    col = mix(col, cool, clamp(uCollapse * 0.7 + uCompactness, 0.0, 1.0));
    col += vDisp * 2.0 * vec3(1.0, 0.6, 0.3);
    col += fres * vec3(1.0, 0.5, 0.2) * (0.4 + uAudioHighs);

    // emissive glow
    float glow = 1.2 - uCollapse * 0.3;
    gl_FragColor = vec4(col * glow, 1.0);
  }
`;

export class CollapsingStar {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor() {
    const geometry = new THREE.SphereGeometry(1, 128, 128);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCollapse: { value: 0 },
        uCompactness: { value: 0 },
        uNoise: { value: 0 },
        uAudioHighs: { value: 0 },
      },
      vertexShader,
      fragmentShader,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  update(state: SimulationState, dt: number, audioHighs: number): void {
    // scale shrinks dramatically through the collapse; if it becomes a black
    // hole it nearly vanishes, gravastar settles a bit larger (the shell takes
    // over visually).
    const floor = state.outcome === "gravastar" ? 0.16 : 0.06;
    const scale = lerp(1.0, floor, state.collapseProgress);
    this.mesh.scale.setScalar(scale);

    const u = this.material.uniforms;
    u.uTime.value += dt;
    u.uCollapse.value = state.collapseProgress;
    u.uCompactness.value = state.compactness;
    u.uNoise.value = state.quantumNoise;
    u.uAudioHighs.value = audioHighs;

    // fade out as the horizon / shell takes over near the end
    const m = this.material;
    const fade =
      state.outcome === "black-hole"
        ? 1 - state.horizonOpacity
        : state.outcome === "gravastar"
          ? 1 - state.shellFormation * 0.85
          : 1;
    m.opacity = fade;
    m.transparent = fade < 1;
    this.mesh.visible = fade > 0.02 && !state.insideInterior;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
