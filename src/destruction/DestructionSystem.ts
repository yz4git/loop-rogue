import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import type { VoxelWorld, DestroyResult } from "../world/VoxelWorld";

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

export class DestructionSystem {
  constructor(private world: VoxelWorld) {}

  setWorld(world: VoxelWorld): void {
    this.world = world;
  }

  damageArea(request: DestructionRequest): DestructionResult {
    const result = this.world.destroySphere(
      request.center,
      request.radius,
      request.maxVoxels,
    );
    return this.toResult(request.source, result);
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

  private toResult(source: DestructionSource, result: DestroyResult): DestructionResult {
    const explosionPoints = result.orePoints.map((point) => point.clone());
    return {
      source,
      hit: result.hit,
      damagedVoxels: result.damaged,
      destroyedCount: result.destroyed,
      oreDestroyed: result.oreDestroyed,
      orePoints: result.orePoints,
      explosionPoints,
      bedrockHit: result.bedrockHit,
      dirtyChunks: result.dirtyChunks,
    };
  }
}
