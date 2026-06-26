import * as THREE from "three";
import type { SimulationState } from "../core/SimulationState.ts";

// Scene D — the interior universe. The "inside is bigger than outside" trick is
// a scale switch, not literal nested geometry (Section 8). Here we build a vast
// cosmological grid, dark-energy fog, drifting newborn-galaxy particles, and a
// shell-as-sky around the camera.

export class InteriorUniverse {
  readonly group = new THREE.Group();
  private readonly metric: THREE.Mesh;
  private readonly metricMat: THREE.MeshBasicMaterial;
  private readonly galaxies: THREE.Points;
  private readonly fog: THREE.Mesh;
  private readonly fogMat: THREE.ShaderMaterial;
  private readonly skyMat: THREE.ShaderMaterial;
  private expansion = 0;

  constructor() {
    // Expanding cosmological metric (large wireframe sphere of grid lines)
    const metricGeo = new THREE.IcosahedronGeometry(40, 6);
    this.metricMat = new THREE.MeshBasicMaterial({
      color: 0x4a90ff,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    this.metric = new THREE.Mesh(metricGeo, this.metricMat);

    // Newborn galaxies drifting outward (Hubble-like flow)
    const count = 1400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();
      const r = 4 + Math.random() * 55;
      positions[i * 3] = dir.x * r;
      positions[i * 3 + 1] = dir.y * r;
      positions[i * 3 + 2] = dir.z * r;
      const warm = Math.random();
      colors[i * 3] = 0.6 + warm * 0.4;
      colors[i * 3 + 1] = 0.7 + Math.random() * 0.3;
      colors[i * 3 + 2] = 1.0;
    }
    const galGeo = new THREE.BufferGeometry();
    galGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    galGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.galaxies = new THREE.Points(
      galGeo,
      new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    // Dark-energy fog volume around the viewer
    const fogGeo = new THREE.SphereGeometry(70, 32, 32);
    this.fogMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAudioBloom: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAudioBloom; varying vec3 vDir;
        void main(){
          float g = 0.5 + 0.5 * sin(vDir.y * 3.0 + uTime * 0.3);
          vec3 a = vec3(0.05, 0.02, 0.12);
          vec3 b = vec3(0.12, 0.20, 0.45);
          vec3 col = mix(a, b, g) * (0.7 + uAudioBloom * 0.5);
          gl_FragColor = vec4(col, 0.9);
        }
      `,
    });
    this.fog = new THREE.Mesh(fogGeo, this.fogMat);

    // Shell becomes the sky — a faint membrane band high overhead / all around
    const skyGeo = new THREE.SphereGeometry(60, 64, 64);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec3 vDir;
        void main(){
          float bands = sin(vDir.x*18.0 + uTime) * sin(vDir.y*18.0 - uTime*0.7);
          float a = smoothstep(0.4, 1.0, abs(bands)) * 0.10;
          vec3 col = mix(vec3(0.15,0.85,0.95), vec3(0.75,0.35,1.0), 0.5+0.5*bands);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, this.skyMat);

    this.group.add(this.fog, sky, this.metric, this.galaxies);
    this.group.visible = false;
  }

  setActive(active: boolean): void {
    this.group.visible = active;
    if (active) this.expansion = 0;
  }

  update(state: SimulationState, dt: number, audioBloom: number): void {
    if (!state.insideInterior) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    // continual gentle cosmological expansion
    this.expansion = Math.min(this.expansion + dt * 0.02, 0.6);
    const s = 1 + this.expansion;
    this.metric.scale.setScalar(s);
    this.galaxies.scale.setScalar(s);
    this.metric.rotation.y += dt * 0.01;
    this.galaxies.rotation.y -= dt * 0.006;
    this.fogMat.uniforms.uTime.value += dt;
    this.fogMat.uniforms.uAudioBloom.value = audioBloom;
    this.skyMat.uniforms.uTime.value += dt;
  }
}
