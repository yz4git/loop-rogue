import type { VoxelPlayerCollision } from "./VoxelPlayerCollision";

export interface PlayerInputFrame {
  moveX: number;
  moveZ: number;
  jumpPressed: boolean;
}

export interface PlayerMotionState {
  grounded: boolean;
  velocityY: number;
}

export interface PlayerMovementPort {
  position: { x: number; y: number; z: number };
  collision: VoxelPlayerCollision;
  motion: PlayerMotionState;
}

/**
 * 移動・ジャンプの更新境界。
 * DOM、three.js描画、敵AIを直接参照せず、既存の衝突ソルバーを注入する。
 */
export class PlayerController {
  constructor(private readonly port: PlayerMovementPort) {}

  update(input: PlayerInputFrame, deltaSeconds: number): void {
    const { motion, collision, position } = this.port;
    motion.grounded = collision.moveHorizontal(
      position as never,
      input.moveX * deltaSeconds,
      input.moveZ * deltaSeconds,
      motion.grounded,
    );
  }
}
