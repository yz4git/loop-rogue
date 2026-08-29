import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import type { VoxelWorld } from "../world/VoxelWorld";
import type { VoxelPlayerCollision } from "./VoxelPlayerCollision";

export interface PlayerMotionState {
  grounded: boolean;
  jumpBufferedUntil: number;
  coyoteUntil: number;
  groundPoundActive: boolean;
}

export interface PlayerRuntimeModifiers {
  moveSpeed: number;
  acceleration: number;
  jumpVelocity: number;
}

export interface PlayerControllerCallbacks {
  onMessage?: (message: string) => void;
  onGroundPoundLanded?: () => void;
}

export class PlayerController {
  readonly input = new THREE.Vector2();
  readonly velocity = new THREE.Vector3();
  private readonly desiredMove = new THREE.Vector3();
  private readonly motion: PlayerMotionState = {
    grounded: false,
    jumpBufferedUntil: 0,
    coyoteUntil: 0,
    groundPoundActive: false,
  };
  private runtimeModifiers: PlayerRuntimeModifiers = {
    moveSpeed: 1,
    acceleration: 1,
    jumpVelocity: 1,
  };

  constructor(
    private readonly player: THREE.Group,
    private world: VoxelWorld,
    private collision: VoxelPlayerCollision,
    private readonly callbacks: PlayerControllerCallbacks = {},
  ) {}

  get grounded(): boolean {
    return this.motion.grounded;
  }

  get groundPoundActive(): boolean {
    return this.motion.groundPoundActive;
  }

  get velocityY(): number {
    return this.velocity.y;
  }

  setWorld(world: VoxelWorld, collision: VoxelPlayerCollision): void {
    this.world = world;
    this.collision = collision;
  }

  setRuntimeModifiers(modifiers: PlayerRuntimeModifiers): void {
    this.runtimeModifiers = {
      moveSpeed: Math.max(0.5, modifiers.moveSpeed),
      acceleration: Math.max(0.5, modifiers.acceleration),
      jumpVelocity: Math.max(0.7, modifiers.jumpVelocity),
    };
  }

  setMoveInput(x: number, y: number): void {
    this.input.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
  }

  requestJump(): void {
    const now = performance.now();
    if (!this.motion.grounded && this.velocity.y <= 0) {
      this.snapToGround(false, GAME_CONFIG.player.groundProbeDistance);
    }
    if (!this.motion.grounded && now > this.motion.coyoteUntil) {
      this.motion.jumpBufferedUntil = now + 500;
      return;
    }
    this.velocity.y = GAME_CONFIG.player.jumpVelocity * this.runtimeModifiers.jumpVelocity;
    this.motion.grounded = false;
    this.motion.jumpBufferedUntil = 0;
    this.callbacks.onMessage?.("ジャンプ");
  }

  beginGroundPound(): boolean {
    if (this.motion.groundPoundActive) return false;
    this.motion.groundPoundActive = true;
    this.velocity.y = GAME_CONFIG.destruction.groundPoundVelocity;
    return true;
  }

  endGroundPound(): void {
    this.motion.groundPoundActive = false;
  }

  reset(): void {
    this.velocity.set(0, 0, 0);
    this.input.set(0, 0);
    this.motion.grounded = false;
    this.motion.groundPoundActive = false;
    this.motion.jumpBufferedUntil = 0;
    this.motion.coyoteUntil = performance.now() + 180;
  }

  snapToGround(force = false, maxDrop = GAME_CONFIG.player.groundSnapDistance): boolean {
    if (this.motion.groundPoundActive) return false;
    if (!force && this.velocity.y > 0.01) return false;
    const snapDistance = force ? 4 : maxDrop;
    if (!this.collision.snapToGround(this.player.position, snapDistance)) {
      if (!force) this.motion.grounded = false;
      return false;
    }
    this.velocity.y = 0;
    this.motion.grounded = true;
    this.motion.coyoteUntil = performance.now() + 100;
    return true;
  }

  hasGroundSupport(): boolean {
    return this.collision.hasGroundSupport(this.player.position);
  }

  update(delta: number, cameraYaw: number): void {
    const inputLength = this.input.length();
    const desired = this.desiredMove.set(
      Math.cos(cameraYaw) * this.input.x + Math.sin(cameraYaw) * this.input.y,
      0,
      -Math.sin(cameraYaw) * this.input.x + Math.cos(cameraYaw) * this.input.y,
    );
    const moveSpeed = GAME_CONFIG.player.moveSpeed * this.runtimeModifiers.moveSpeed;
    if (inputLength > 0.01) desired.normalize().multiplyScalar(moveSpeed * Math.min(1, inputLength));
    else desired.set(0, 0, 0);

    const control = this.motion.grounded ? 1 : GAME_CONFIG.player.airControl;
    const acceleration = GAME_CONFIG.player.acceleration * this.runtimeModifiers.acceleration;
    const blend = Math.min(1, acceleration * control * delta);
    this.velocity.x += (desired.x - this.velocity.x) * blend;
    this.velocity.z += (desired.z - this.velocity.z) * blend;
    if (inputLength < 0.01 && this.motion.grounded) {
      this.velocity.x *= Math.max(0, 1 - 14 * delta);
      this.velocity.z *= Math.max(0, 1 - 14 * delta);
    }

    if (this.motion.grounded && this.hasGroundSupport() && this.velocity.y <= 0) {
      this.velocity.y = 0;
    } else {
      this.motion.grounded = false;
      this.velocity.y = Math.max(
        -GAME_CONFIG.player.maxFallSpeed,
        this.velocity.y - GAME_CONFIG.player.gravity * delta,
      );
    }

    const subSteps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(this.velocity.x), Math.abs(this.velocity.y), Math.abs(this.velocity.z)) * delta / 0.18),
    );
    const stepDelta = delta / subSteps;
    for (let step = 0; step < subSteps; step += 1) {
      this.motion.grounded = this.collision.moveHorizontal(
        this.player.position,
        this.velocity.x * stepDelta,
        this.velocity.z * stepDelta,
        this.motion.grounded && this.velocity.y <= 0,
      );
      const vertical = this.collision.moveVertical(this.player.position, this.velocity.y * stepDelta);
      if (vertical.hitCeiling) this.velocity.y = 0;
      if (vertical.landed) {
        this.motion.grounded = true;
        this.velocity.y = 0;
        this.motion.coyoteUntil = performance.now() + 100;
        if (this.motion.groundPoundActive) this.callbacks.onGroundPoundLanded?.();
      }
    }

    if (this.motion.grounded) this.snapToGround(false, GAME_CONFIG.player.groundSnapDistance);
    if (this.motion.grounded) this.motion.coyoteUntil = performance.now() + 100;
    if (this.motion.jumpBufferedUntil > performance.now() && this.motion.grounded) {
      this.velocity.y = GAME_CONFIG.player.jumpVelocity * this.runtimeModifiers.jumpVelocity;
      this.motion.grounded = false;
      this.motion.jumpBufferedUntil = 0;
      this.callbacks.onMessage?.("ジャンプ");
    }
    if (inputLength > 0.1) this.player.rotation.y = Math.atan2(desired.x, desired.z);

    if (
      this.player.position.y < -4 ||
      this.player.position.x < 1 ||
      this.player.position.z < 1 ||
      this.player.position.x > this.world.width - 1 ||
      this.player.position.z > this.world.depth - 1
    ) {
      this.player.position.set(this.world.spawnPoint.x, this.world.spawnPoint.y, this.world.spawnPoint.z);
      this.reset();
      this.snapToGround(true);
      this.callbacks.onMessage?.("落下したため入口へ戻りました");
    }
  }
}
