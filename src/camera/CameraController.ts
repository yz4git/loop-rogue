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

/** 描画カメラの追従・衝突境界。ゲームルールから独立させる。 */
export class CameraController {
  constructor(private readonly collision: CameraCollisionPort) {}

  getPosition(target: CameraTarget, orbit: CameraOrbitState): CameraTarget {
    const horizontal = Math.cos(orbit.pitch) * orbit.distance;
    const desired = {
      x: target.x - Math.sin(orbit.yaw) * horizontal,
      y: target.y + Math.sin(orbit.pitch) * orbit.distance,
      z: target.z - Math.cos(orbit.yaw) * horizontal,
    };
    return this.collision.resolve(target, desired);
  }
}
