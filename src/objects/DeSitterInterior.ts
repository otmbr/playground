import * as THREE from "three";
import { lerp } from "../core/math.ts";
import type { SimulationState } from "../core/SimulationState.ts";

// The mini Big Bang core: a tiny igniting bubble that expands outward, plus an
// expanding wireframe "cosmological metric" grid. Used both as the small bubble
// seen from outside and (scaled up) as the interior universe.

export class DeSitterInterior {
  readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly coreMat: THREE.ShaderMaterial;
  private readonly gridMat: THREE.MeshBasicMaterial;

  constructor() {
    const coreGeo = new THREE.SphereGeometry(0.5, 48, 48);
    this.coreMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uBloom: { value: 0 }, uAudioBloom: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main(){ vNormal = normalize(normalMatrix*normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uBloom; uniform float uAudioBloom;
        varying vec3 vNormal;
        void main(){
          float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0,0.0,1.0))), 2.0);
          vec3 col = mix(vec3(0.6,0.9,1.0), vec3(1.0,1.0,0.95), fres);
          float glow = (0.5 + 0.5*sin(uTime*3.0)) * (0.5 + uAudioBloom);
          gl_FragColor = vec4(col * (1.0+glow), uBloom * (0.5 + fres));
        }
      `,
    });
    this.core = new THREE.Mesh(coreGeo, this.coreMat);

    // expanding wireframe metric
    const gridGeo = new THREE.IcosahedronGeometry(0.5, 4);
    this.gridMat = new THREE.MeshBasicMaterial({
      color: 0x7fd0ff,
      wireframe: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const grid = new THREE.Mesh(gridGeo, this.gridMat);

    this.group.add(this.core, grid);
    this.group.visible = false;
  }

  update(state: SimulationState, dt: number, audioBloom: number): void {
    const expansion = state.deSitterBubbleRadius;
    // tiny -> visible bubble while observed from outside
    const scale = state.insideInterior
      ? 1.0 // interior scene handles big scale separately
      : lerp(0.001, 1.1, expansion);
    this.group.scale.setScalar(scale);
    this.group.rotation.y += dt * 0.05;

    this.coreMat.uniforms.uTime.value += dt;
    this.coreMat.uniforms.uBloom.value = expansion;
    this.coreMat.uniforms.uAudioBloom.value = audioBloom;
    this.gridMat.opacity = expansion * 0.5;

    this.group.visible = expansion > 0.001 && !state.insideInterior;
  }

  dispose(): void {
    this.core.geometry.dispose();
    this.coreMat.dispose();
    this.gridMat.dispose();
  }
}
