import * as THREE from "three";
import type { VoxelWorld } from "../world/VoxelWorld";

export interface VerticalMoveResult {
  landed: boolean;
  hitCeiling: boolean;
}

/**
 * プレイヤーの足元座標を基準にした衝突処理。
 * 判定用ベクトルと実座標を分離し、問い合わせだけで座標が変わることを防ぐ。
 */
export class VoxelPlayerCollision {
  private readonly bodyCenter = new THREE.Vector3();
  private readonly candidate = new THREE.Vector3();
  private readonly stepCandidate = new THREE.Vector3();

  constructor(
    private readonly world: VoxelWorld,
    private readonly radius: number,
    private readonly height: number,
    private readonly stepHeight: number,
    private readonly groundSnapDistance: number,
    private readonly groundProbeDistance: number,
  ) {}

  collidesAtFoot(footPosition: THREE.Vector3): boolean {
    this.bodyCenter.set(
      footPosition.x,
      footPosition.y + this.height * 0.5,
      footPosition.z,
    );
    return this.world.collidesAabb(this.bodyCenter, this.radius, this.height);
  }

  findGroundY(position: THREE.Vector3, maxDrop = this.groundSnapDistance, maxRise = 0.02): number | null {
    return this.world.findSupportY(position, this.radius, this.height, maxDrop, maxRise);
  }

  hasGroundSupport(position: THREE.Vector3): boolean {
    const groundY = this.findGroundY(position, this.groundProbeDistance);
    return groundY !== null && Math.abs(position.y - groundY) <= this.groundProbeDistance;
  }

  snapToGround(position: THREE.Vector3, maxDrop: number): boolean {
    const groundY = this.findGroundY(position, maxDrop);
    if (groundY === null) return false;
    position.y = groundY;
    return true;
  }

  moveHorizontal(position: THREE.Vector3, dx: number, dz: number, grounded: boolean): boolean {
    let supported = grounded;
    const tryAxis = (axis: "x" | "z", amount: number): void => {
      if (Math.abs(amount) < 0.0001) return;
      this.candidate.copy(position);
      this.candidate[axis] += amount;
      if (!this.collidesAtFoot(this.candidate)) {
        position.copy(this.candidate);
        if (supported) supported = this.snapToGround(position, this.groundSnapDistance);
        return;
      }

      if (!supported || this.stepHeight <= 0) return;
      this.stepCandidate.copy(this.candidate);
      const stepY = this.findGroundY(this.stepCandidate, 0.02, this.stepHeight);
      if (stepY === null) return;
      this.stepCandidate.y = stepY;
      if (this.collidesAtFoot(this.stepCandidate)) return;
      position.copy(this.stepCandidate);
      supported = true;
    };

    tryAxis("x", dx);
    tryAxis("z", dz);
    return supported;
  }

  moveVertical(position: THREE.Vector3, amount: number): VerticalMoveResult {
    if (Math.abs(amount) < 0.0001) return { landed: false, hitCeiling: false };
    this.candidate.copy(position);
    this.candidate.y += amount;
    if (!this.collidesAtFoot(this.candidate)) {
      position.copy(this.candidate);
      return { landed: false, hitCeiling: false };
    }

    if (amount > 0) return { landed: false, hitCeiling: true };
    const groundY = this.findGroundY(position, Math.abs(amount) + this.groundProbeDistance);
    if (groundY === null) return { landed: false, hitCeiling: false };
    position.y = groundY;
    return { landed: true, hitCeiling: false };
  }
}
