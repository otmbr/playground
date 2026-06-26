import * as THREE from "three";
import gsap from "gsap";
import { clamp } from "./math.ts";

// Orbit camera with inertia. The camera always looks at the origin (where the
// star / shell / interior sits); the user drags to rotate around it, pinches or
// scrolls to zoom. When idle it auto-rotates gently.

export interface CameraHome {
  theta: number; // azimuth
  phi: number; // polar (0..PI)
  radius: number;
}

export class CameraRig {
  theta = 0.5;
  phi = 1.2;
  radius = 7;

  autoRotate = true;
  minRadius = 1.6;
  maxRadius = 60;

  private vTheta = 0;
  private vPhi = 0;
  private target = new THREE.Vector3(0, 0, 0);
  private dragging = false;
  private scripted = false; // a gsap transition owns the camera
  private idleTime = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.apply();
  }

  startDrag(): void {
    this.dragging = true;
    this.scripted = false;
    this.idleTime = 0;
    this.vTheta = 0;
    this.vPhi = 0;
    gsap.killTweensOf(this);
  }

  drag(dx: number, dy: number): void {
    const s = 0.006;
    this.theta -= dx * s;
    this.phi -= dy * s;
    this.clampPhi();
    this.vTheta = -dx * s;
    this.vPhi = -dy * s;
  }

  endDrag(): void {
    this.dragging = false;
    this.idleTime = 0;
  }

  zoom(factor: number): void {
    this.radius = clamp(this.radius * factor, this.minRadius, this.maxRadius);
    this.idleTime = 0;
  }

  /** Smoothly fly to a home pose (used by observer modes / reset). */
  animateTo(home: CameraHome, duration = 1.4): void {
    this.scripted = true;
    gsap.killTweensOf(this);
    gsap.to(this, {
      theta: home.theta,
      phi: home.phi,
      radius: home.radius,
      duration,
      ease: "power3.inOut",
      onComplete: () => {
        this.scripted = false;
        this.idleTime = 0;
      },
    });
  }

  /** Scripted radius-only tween (the dolly through the shell). */
  tweenRadius(radius: number, duration: number, onComplete?: () => void): void {
    this.scripted = true;
    gsap.killTweensOf(this);
    gsap.to(this, {
      radius,
      duration,
      ease: "power4.inOut",
      onComplete: () => {
        onComplete?.();
      },
    });
  }

  /** Hard snap (no animation), e.g. after the interior scene swap. */
  snapTo(home: CameraHome): void {
    gsap.killTweensOf(this);
    this.scripted = false;
    this.theta = home.theta;
    this.phi = home.phi;
    this.radius = home.radius;
    this.idleTime = 0;
    this.apply();
  }

  update(dt: number): void {
    if (!this.dragging && !this.scripted) {
      // inertia after release
      this.theta += this.vTheta;
      this.phi += this.vPhi;
      this.clampPhi();
      this.vTheta *= 0.9;
      this.vPhi *= 0.9;

      this.idleTime += dt;
      if (this.autoRotate && this.idleTime > 1.5 && Math.abs(this.vTheta) < 0.0006) {
        this.theta += dt * 0.08;
      }
    }
    this.apply();
  }

  private clampPhi(): void {
    this.phi = clamp(this.phi, 0.25, Math.PI - 0.25);
  }

  private apply(): void {
    const r = this.radius;
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + r * sp * Math.sin(this.theta),
      this.target.y + r * Math.cos(this.phi),
      this.target.z + r * sp * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }
}
