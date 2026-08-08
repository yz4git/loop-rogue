import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";

interface EffectParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: THREE.Vector3;
}

export class EffectManager {
  private readonly impactRing: THREE.Mesh;
  private readonly debris: EffectParticle[] = [];
  private readonly dust: EffectParticle[] = [];
  private readonly debrisGeometry = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  private readonly dustGeometry = new THREE.SphereGeometry(0.13, 6, 4);
  private readonly debrisMaterial = new THREE.MeshBasicMaterial({ color: 0xc77b4e });
  private readonly debrisRockMaterial = new THREE.MeshBasicMaterial({ color: 0x9fa9b5 });
  private readonly dustMaterial = new THREE.MeshBasicMaterial({
    color: 0xd7a06c,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  private impactStartedAt = 0;
  private hitStopUntil = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.impactRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.2, 18),
      new THREE.MeshBasicMaterial({
        color: 0xffc36b,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      }),
    );
    this.impactRing.visible = false;
    this.scene.add(this.impactRing);

    for (let index = 0; index < GAME_CONFIG.effects.maxDebris; index += 1) {
      const mesh = new THREE.Mesh(
        this.debrisGeometry,
        index % 3 === 0 ? this.debrisRockMaterial : this.debrisMaterial,
      );
      mesh.visible = false;
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        spin: new THREE.Vector3(),
      });
    }
    for (let index = 0; index < GAME_CONFIG.effects.maxDust; index += 1) {
      const mesh = new THREE.Mesh(this.dustGeometry, this.dustMaterial);
      mesh.visible = false;
      this.scene.add(mesh);
      this.dust.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        spin: new THREE.Vector3(),
      });
    }
  }

  hitStop(seconds: number): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + seconds * 1000);
  }

  isHitStopped(now = performance.now()): boolean {
    return now < this.hitStopUntil;
  }

  showImpact(point: THREE.Vector3, strong: boolean): void {
    const material = this.impactRing.material as THREE.MeshBasicMaterial;
    this.impactRing.position.copy(point);
    this.impactRing.scale.setScalar(strong ? 1.2 : 0.8);
    this.impactStartedAt = performance.now();
    this.impactRing.visible = true;
    material.opacity = 0.9;
    this.impactRing.lookAt(this.camera.position);
  }

  spawnDestruction(point: THREE.Vector3, destroyed: number, intensity = 1): void {
    const debrisCount = Math.min(
      GAME_CONFIG.effects.maxDebris,
      Math.max(5, Math.round(destroyed * 2 * intensity)),
    );
    let spawned = 0;
    for (const particle of this.debris) {
      if (particle.mesh.visible) continue;
      particle.mesh.visible = true;
      particle.mesh.position.copy(point);
      particle.mesh.position.x += (Math.random() - 0.5) * 0.45;
      particle.mesh.position.y += (Math.random() - 0.5) * 0.45;
      particle.mesh.position.z += (Math.random() - 0.5) * 0.45;
      particle.velocity.set(
        (Math.random() - 0.5) * 3.2,
        1.2 + Math.random() * 2.6,
        (Math.random() - 0.5) * 3.2,
      );
      particle.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      particle.maxLife = GAME_CONFIG.effects.debrisLifetime * (0.65 + Math.random() * 0.55);
      particle.life = particle.maxLife;
      spawned += 1;
      if (spawned >= debrisCount) break;
    }

    let dustSpawned = 0;
    for (const particle of this.dust) {
      if (particle.mesh.visible) continue;
      particle.mesh.visible = true;
      particle.mesh.position.copy(point);
      particle.velocity.set(
        (Math.random() - 0.5) * 0.8,
        0.35 + Math.random() * 0.7,
        (Math.random() - 0.5) * 0.8,
      );
      particle.maxLife = 0.35 + Math.random() * 0.25;
      particle.life = particle.maxLife;
      particle.mesh.scale.setScalar(0.6 + Math.random() * 0.45);
      dustSpawned += 1;
      if (dustSpawned >= Math.min(GAME_CONFIG.effects.maxDust, Math.round(8 * intensity))) break;
    }
  }

  update(delta: number, now = performance.now()): void {
    for (const particle of this.debris) {
      if (!particle.mesh.visible) continue;
      particle.life -= delta;
      particle.velocity.y -= 8.5 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += particle.spin.x * delta;
      particle.mesh.rotation.y += particle.spin.y * delta;
      particle.mesh.rotation.z += particle.spin.z * delta;
      if (particle.life <= 0) particle.mesh.visible = false;
    }
    for (const particle of this.dust) {
      if (!particle.mesh.visible) continue;
      particle.life -= delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.scale.multiplyScalar(1 + delta * 1.8);
      this.dustMaterial.opacity = Math.max(0.04, 0.42 * (particle.life / particle.maxLife));
      if (particle.life <= 0) particle.mesh.visible = false;
    }
    if (!this.impactRing.visible) return;
    const age = (now - this.impactStartedAt) / 260;
    const material = this.impactRing.material as THREE.MeshBasicMaterial;
    this.impactRing.scale.setScalar(this.impactRing.scale.x + delta * 4);
    material.opacity = Math.max(0, 0.9 - age * 1.2);
    if (material.opacity <= 0) this.impactRing.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.impactRing);
    this.impactRing.geometry.dispose();
    (this.impactRing.material as THREE.Material).dispose();
    for (const particle of this.debris) this.scene.remove(particle.mesh);
    for (const particle of this.dust) this.scene.remove(particle.mesh);
    this.debrisGeometry.dispose();
    this.dustGeometry.dispose();
    this.debrisMaterial.dispose();
    this.debrisRockMaterial.dispose();
    this.dustMaterial.dispose();
  }
}
