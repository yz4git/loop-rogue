import * as THREE from "three";
import type { VoxelWorld } from "../world/VoxelWorld";

/**
 * Lightweight voxel-aware swept-sphere camera collision.
 * It samples only the target-to-camera segment and tests nearby solid cells.
 */
export class CameraCollisionSolver {
  private readonly direction = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();

  constructor(private world: VoxelWorld) {}

  setWorld(world: VoxelWorld): void {
    this.world = world;
  }

  resolve(
    target: THREE.Vector3,
    desired: THREE.Vector3,
    radius: number,
    out: THREE.Vector3,
  ): number {
    this.direction.copy(desired).sub(target);
    const length = this.direction.length();
    if (length <= 0.001) {
      out.copy(target);
      return 0;
    }

    this.direction.multiplyScalar(1 / length);
    const sampleStep = 0.16;
    let safeDistance = length;
    for (let distance = Math.min(sampleStep, length); distance <= length; distance += sampleStep) {
      this.probe.copy(target).addScaledVector(this.direction, distance);
      if (this.intersectsSolid(this.probe, radius)) {
        safeDistance = Math.max(0.65, distance - sampleStep);
        break;
      }
    }

    out.copy(target).addScaledVector(this.direction, safeDistance);
    return safeDistance;
  }

  private intersectsSolid(center: THREE.Vector3, radius: number): boolean {
    const minX = Math.floor(center.x - radius);
    const maxX = Math.floor(center.x + radius);
    const minY = Math.floor(center.y - radius);
    const maxY = Math.floor(center.y + radius);
    const minZ = Math.floor(center.z - radius);
    const maxZ = Math.floor(center.z + radius);
    const radiusSq = radius * radius;

    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (!this.world.isSolidAt(x, y, z)) continue;
          const nearestX = Math.max(x, Math.min(center.x, x + 1));
          const nearestY = Math.max(y, Math.min(center.y, y + 1));
          const nearestZ = Math.max(z, Math.min(center.z, z + 1));
          const dx = center.x - nearestX;
          const dy = center.y - nearestY;
          const dz = center.z - nearestZ;
          if (dx * dx + dy * dy + dz * dz < radiusSq) return true;
        }
      }
    }
    return false;
  }
}
