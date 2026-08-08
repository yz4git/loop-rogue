import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import type { VoxelWorld } from "../world/VoxelWorld";

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
}

export interface CameraOrbitState {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface CameraCollisionPort {
  resolve(target: CameraTarget, desired: CameraTarget): CameraTarget;
}

export class CameraController {
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private behindTransition = 0;
  private shakeUntil = 0;
  private shakeStrength = 0;

  yaw = Math.PI;
  pitch = 0.25;
  readonly distance = GAME_CONFIG.camera.distance;
  private manuallyControlled = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private world: VoxelWorld,
  ) {}

  get isManual(): boolean {
    return this.manuallyControlled;
  }

  setWorld(world: VoxelWorld): void {
    this.world = world;
  }

  beginManual(): void {
    this.manuallyControlled = true;
    this.behindTransition = 0;
  }

  endManual(): void {
    this.manuallyControlled = false;
  }

  rotate(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * GAME_CONFIG.camera.sensitivity;
    this.pitch = Math.max(
      GAME_CONFIG.camera.minPitch,
      Math.min(GAME_CONFIG.camera.maxPitch, this.pitch + deltaY * GAME_CONFIG.camera.sensitivity),
    );
  }

  alignBehind(playerRotationY: number): void {
    if (this.manuallyControlled) return;
    this.yaw = playerRotationY + Math.PI;
    this.behindTransition = 1;
  }

  addShake(durationMs: number, strength: number): void {
    const end = performance.now() + durationMs;
    this.shakeUntil = Math.max(this.shakeUntil, end);
    this.shakeStrength = Math.max(this.shakeStrength, strength);
  }

  reset(): void {
    this.yaw = Math.PI;
    this.pitch = 0.25;
    this.manuallyControlled = false;
    this.behindTransition = 0;
    this.shakeUntil = 0;
    this.shakeStrength = 0;
  }

  update(delta: number, playerPosition: THREE.Vector3, now = performance.now()): void {
    this.target.copy(playerPosition);
    this.target.y += GAME_CONFIG.camera.height;
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horizontal,
    );
    this.direction.copy(this.desired).sub(this.target);
    const distance = this.direction.length();
    if (distance > 0.001) {
      this.direction.normalize();
      this.raycaster.set(this.target, this.direction);
      const obstacle = this.world.raycast(this.raycaster)[0];
      if (obstacle && obstacle.distance < distance) {
        this.desired.copy(this.target).addScaledVector(
          this.direction,
          Math.max(1.2, obstacle.distance - 0.35),
        );
      }
    }
    const followRate = this.behindTransition > 0 ? 28 : 12;
    this.camera.position.lerp(this.desired, Math.min(1, delta * followRate));
    this.behindTransition = Math.max(0, this.behindTransition - delta * 4);
    if (now < this.shakeUntil) {
      const falloff = Math.min(1, (this.shakeUntil - now) / 180);
      this.camera.position.x += Math.sin(now * 0.11) * this.shakeStrength * falloff;
      this.camera.position.y += Math.cos(now * 0.14) * this.shakeStrength * falloff;
    } else {
      this.shakeStrength = 0;
    }
    this.camera.lookAt(this.target);
  }

  /** Pure numeric helper retained for collision and camera unit tests. */
  getPosition(target: CameraTarget, orbit: CameraOrbitState): CameraTarget {
    const horizontal = Math.cos(orbit.pitch) * orbit.distance;
    return {
      x: target.x + Math.sin(orbit.yaw) * horizontal,
      y: target.y + Math.sin(orbit.pitch) * orbit.distance,
      z: target.z + Math.cos(orbit.yaw) * horizontal,
    };
  }
}
