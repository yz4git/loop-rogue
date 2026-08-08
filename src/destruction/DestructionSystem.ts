import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import { VoxelType } from "../world/VoxelDefinitions";
import type { VoxelWorld } from "../world/VoxelWorld";

export type DestructionSource = "punch" | "ground-pound" | "explosion";

export interface DestructionRequest {
  center: THREE.Vector3;
  radius: number;
  maxVoxels: number;
  source: DestructionSource;
}

export interface DestructionResult {
  source: DestructionSource;
  hit: THREE.Vector3 | null;
  damagedVoxels: number;
  destroyedCount: number;
  oreDestroyed: number;
  orePoints: THREE.Vector3[];
  explosionPoints: THREE.Vector3[];
  bedrockHit: boolean;
  dirtyChunks: number;
}

interface VoxelCandidate {
  x: number;
  y: number;
  z: number;
  distance: number;
  type: VoxelType;
}

export class DestructionSystem {
  constructor(private world: VoxelWorld) {}

  setWorld(world: VoxelWorld): void {
    this.world = world;
  }

  damageArea(request: DestructionRequest): DestructionResult {
    const hit = request.center.clone();
    const minX = Math.max(0, Math.floor(hit.x - request.radius));
    const maxX = Math.min(this.world.width - 1, Math.ceil(hit.x + request.radius));
    const minY = Math.max(0, Math.floor(hit.y - request.radius));
    const maxY = Math.min(this.world.height - 1, Math.ceil(hit.y + request.radius));
    const minZ = Math.max(0, Math.floor(hit.z - request.radius));
    const maxZ = Math.min(this.world.depth - 1, Math.ceil(hit.z + request.radius));
    const candidates: VoxelCandidate[] = [];
    let bedrockHit = false;
    const radiusSquared = request.radius * request.radius;

    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const type = this.world.getType(x, y, z);
          const dx = x + 0.5 - hit.x;
          const dy = y + 0.5 - hit.y;
          const dz = z + 0.5 - hit.z;
          const distance = dx * dx + dy * dy + dz * dz;
          if (distance > radiusSquared) continue;
          if (type === VoxelType.Bedrock) {
            bedrockHit = true;
          } else if (type !== VoxelType.Empty) {
            candidates.push({ x, y, z, distance, type });
          }
        }
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    let damagedVoxels = 0;
    let destroyedCount = 0;
    let oreDestroyed = 0;
    const orePoints: THREE.Vector3[] = [];
    for (const candidate of candidates.slice(0, request.maxVoxels)) {
      const index = this.world.storage.index(candidate.x, candidate.y, candidate.z);
      damagedVoxels += 1;
      this.world.storage.health[index] = Math.max(0, this.world.storage.health[index] - 1);
      if (this.world.storage.health[index] === 0) {
        this.world.storage.types[index] = VoxelType.Empty;
        destroyedCount += 1;
        if (candidate.type === VoxelType.Ore) {
          oreDestroyed += 1;
          orePoints.push(new THREE.Vector3(candidate.x + 0.5, candidate.y + 0.5, candidate.z + 0.5));
        }
      }
      this.world.markVoxelDirty(candidate.x, candidate.y, candidate.z);
    }

    const explosionPoints = orePoints.map((point) => point.clone());
    return {
      source: request.source,
      hit: damagedVoxels > 0 || bedrockHit ? hit : null,
      damagedVoxels,
      destroyedCount,
      oreDestroyed,
      orePoints,
      explosionPoints,
      bedrockHit,
      dirtyChunks: this.world.pendingRebuilds,
    };
  }

  explode(
    centers: readonly THREE.Vector3[],
    radius = GAME_CONFIG.destruction.blastRadius,
    maxVoxels = GAME_CONFIG.destruction.maxBlastVoxels,
  ): DestructionResult {
    const aggregate: DestructionResult = {
      source: "explosion",
      hit: null,
      damagedVoxels: 0,
      destroyedCount: 0,
      oreDestroyed: 0,
      orePoints: [],
      explosionPoints: [],
      bedrockHit: false,
      dirtyChunks: this.world.pendingRebuilds,
    };

    for (const center of centers) {
      const result = this.damageArea({
        center,
        radius,
        maxVoxels,
        source: "explosion",
      });
      aggregate.hit ??= result.hit;
      aggregate.damagedVoxels += result.damagedVoxels;
      aggregate.destroyedCount += result.destroyedCount;
      aggregate.oreDestroyed += result.oreDestroyed;
      aggregate.orePoints.push(...result.orePoints);
      aggregate.explosionPoints.push(...result.explosionPoints);
      aggregate.bedrockHit ||= result.bedrockHit;
      aggregate.dirtyChunks = result.dirtyChunks;
    }
    return aggregate;
  }
}
