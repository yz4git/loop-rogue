import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import type { VoxelWorld } from "../world/VoxelWorld";
import { CameraCollisionSolver } from "./CameraCollisionSolver";

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

export class CameraController {
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly resolved = new THREE.Vector3();
  private readonly logicalPosition = new THREE.Vector3();
  private readonly smoothedPosition = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly solver: CameraCollisionSolver;
  private recenterTargetYaw = Math.PI;
  private recenterRemaining = 0;
  private manualCooldown = 0;
  private shakeUntil = 0;
  private shakeStrength = 0;
  private actualDistance = GAME_CONFIG.camera.baseDistance;
  private collisionActive = false;
  private manuallyControlled = false;

  yaw = Math.PI;
  pitch = GAME_CONFIG.camera.defaultPitch;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    world: VoxelWorld,
  ) {
    this.solver = new CameraCollisionSolver(world);
  }

  get isManual(): boolean {
    return this.manuallyControlled;
  }

  get distance(): number {
    return this.actualDistance;
  }

  setWorld(world: VoxelWorld): void {
    this.solver.setWorld(world);
  }

  beginManual(): void {
    this.manuallyControlled = true;
    this.recenterRemaining = 0;
    this.manualCooldown = 0;
  }

  endManual(): void {
    this.manuallyControlled = false;
    this.manualCooldown = GAME_CONFIG.camera.manualCooldown;
  }

  rotate(deltaX: number, deltaY: number): void {
    // Direct response: no inertia or post-release momentum.
    this.yaw -= deltaX * GAME_CONFIG.camera.yawSensitivity;
    this.pitch = Math.max(
      GAME_CONFIG.camera.minPitch,
      Math.min(GAME_CONFIG.camera.maxPitch, this.pitch + deltaY * GAME_CONFIG.camera.pitchSensitivity),
    );
  }

  alignBehind(playerRotationY: number): void {
    if (this.manuallyControlled || this.manualCooldown > 0 || this.recenterRemaining > 0) return;
    this.recenterTargetYaw = playerRotationY + Math.PI;
    this.recenterRemaining = GAME_CONFIG.camera.recenterDuration;
  }

  addShake(durationMs: number, strength: number): void {
    const end = performance.now() + durationMs;
    this.shakeUntil = Math.max(this.shakeUntil, end);
    this.shakeStrength = Math.min(0.3, Math.max(this.shakeStrength, strength));
  }

  reset(): void {
    this.yaw = Math.PI;
    this.pitch = GAME_CONFIG.camera.defaultPitch;
    this.recenterTargetYaw = this.yaw;
    this.recenterRemaining = 0;
    this.manualCooldown = 0;
    this.manuallyControlled = false;
    this.actualDistance = GAME_CONFIG.camera.baseDistance;
    this.collisionActive = false;
    this.shakeUntil = 0;
    this.shakeStrength = 0;
    this.logicalPosition.set(0, 0, 0);
    this.smoothedPosition.set(0, 0, 0);
    this.camera.position.set(0, 0, 0);
  }

  update(
    delta: number,
    playerPosition: THREE.Vector3,
    playerHeading?: number,
    moving = false,
    groundPoundActive = false,
    now = performance.now(),
  ): void {
    this.manualCooldown = Math.max(0, this.manualCooldown - delta);
    if (!this.manuallyControlled && this.manualCooldown <= 0 && this.recenterRemaining > 0) {
      const step = Math.min(delta, this.recenterRemaining);
      const alpha = 1 - Math.exp(-8 * step);
      this.yaw = this.approachAngle(this.yaw, this.recenterTargetYaw, alpha);
      this.recenterRemaining = Math.max(0, this.recenterRemaining - delta);
    }

    this.target.copy(playerPosition);
    this.target.y += GAME_CONFIG.camera.targetHeight;
    if (groundPoundActive) this.target.y += GAME_CONFIG.camera.groundPoundCameraLift;
    if (!this.manuallyControlled && moving && playerHeading !== undefined) {
      const lookAhead = GAME_CONFIG.camera.lookAhead * Math.min(1, delta * 8);
      this.target.x += Math.sin(playerHeading) * lookAhead;
      this.target.z += Math.cos(playerHeading) * lookAhead;
    }

    const desiredDistance = Math.max(
      GAME_CONFIG.camera.minDistance,
      Math.min(
        GAME_CONFIG.camera.maxDistance,
        GAME_CONFIG.camera.baseDistance + (groundPoundActive ? GAME_CONFIG.camera.groundPoundCameraDistance : 0),
      ),
    );
    const horizontal = Math.cos(this.pitch) * desiredDistance;
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.sin(this.pitch) * desiredDistance,
      this.target.z + Math.cos(this.yaw) * horizontal,
    );
    this.direction.copy(this.desired).sub(this.target).normalize();
    const safeDistance = this.solver.resolve(
      this.target,
      this.desired,
      GAME_CONFIG.camera.cameraCollisionRadius,
      this.resolved,
    );
    const blocked = safeDistance < desiredDistance - GAME_CONFIG.camera.collisionHysteresis;
    if (blocked) {
      this.collisionActive = true;
      this.actualDistance = Math.max(0.65, Math.min(desiredDistance, safeDistance));
    } else if (this.collisionActive) {
      this.actualDistance += (desiredDistance - this.actualDistance)
        * (1 - Math.exp(-GAME_CONFIG.camera.collisionPullOutSpeed * delta));
      if (desiredDistance - this.actualDistance < 0.04) {
        this.actualDistance = desiredDistance;
        this.collisionActive = false;
      }
    } else {
      this.actualDistance = desiredDistance;
    }

    this.logicalPosition.copy(this.target).addScaledVector(this.direction, this.actualDistance);
    const followAlpha = 1 - Math.exp(-GAME_CONFIG.camera.followSpeed * delta);
    this.smoothedPosition.lerp(this.logicalPosition, followAlpha);
    this.camera.position.copy(this.smoothedPosition);

    if (now < this.shakeUntil) {
      const falloff = Math.min(1, (this.shakeUntil - now) / 180);
      this.camera.position.x += Math.sin(now * 0.11) * this.shakeStrength * falloff;
      this.camera.position.y += Math.cos(now * 0.14) * this.shakeStrength * falloff;
    } else {
      this.shakeStrength = 0;
    }
    this.camera.lookAt(this.target);
  }

  private approachAngle(current: number, target: number, alpha: number): number {
    let difference = (target - current + Math.PI) % (Math.PI * 2) - Math.PI;
    if (difference < -Math.PI) difference += Math.PI * 2;
    return current + difference * alpha;
  }

  /** Pure numeric helper retained for camera unit tests. */
  getPosition(target: CameraTarget, orbit: CameraOrbitState): CameraTarget {
    const horizontal = Math.cos(orbit.pitch) * orbit.distance;
    return {
      x: target.x + Math.sin(orbit.yaw) * horizontal,
      y: target.y + Math.sin(orbit.pitch) * orbit.distance,
      z: target.z + Math.cos(orbit.yaw) * horizontal,
    };
  }
}
