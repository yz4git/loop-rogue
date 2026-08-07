import { GAME_CONFIG } from "../core/Settings";
import { VoxelType } from "../world/VoxelDefinitions";
import { createStageArray, setStageVoxel, type StageSnapshot, type StageSource } from "./StageSource";

export class HandcraftedStageSource implements StageSource {
  readonly id = "handcrafted";

  generate(): StageSnapshot {
    const { width, height, depth } = GAME_CONFIG.world;
    const types = createStageArray(width, height, depth);
    const set = (x: number, y: number, z: number, type: VoxelType): void => setStageVoxel(types, width, height, depth, x, y, z, type);
    for (let z = 0; z < depth; z += 1) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const edge = x === 0 || z === 0 || x === width - 1 || z === depth - 1 || y === 0 || y === height - 1;
          if (edge) set(x, y, z, VoxelType.Bedrock);
          else {
            const shelf = y < 5 || (y < 13 && ((x + z) % 7 !== 0)) || y < 23;
            if (shelf) {
              const ore = y > 9 && (x * 11 + y * 7 + z * 13) % 47 === 0;
              const rock = y > 8 && (x * 3 + z * 5 + y) % 9 === 0;
              set(x, y, z, ore ? VoxelType.Ore : rock ? VoxelType.Rock : VoxelType.Soil);
            }
          }
        }
      }
    }
    for (let z = 1; z < 8; z += 1) for (let y = 8; y < 12; y += 1) for (let x = 19; x < 29; x += 1) set(x, y, z, VoxelType.Empty);
    for (let z = 30; z < 38; z += 1) for (let y = 8; y < 14; y += 1) for (let x = 19; x < 30; x += 1) set(x, y, z, VoxelType.Empty);
    for (let z = 7; z < 31; z += 1) for (let y = 8; y < 13; y += 1) for (let x = 22; x < 27; x += 1) set(x, y, z, VoxelType.Empty);
    for (let z = 18; z < 25; z += 1) for (let y = 8; y < 13; y += 1) for (let x = 10; x < 22; x += 1) set(x, y, z, VoxelType.Empty);
    return {
      width,
      height,
      depth,
      types,
      spawn: { ...GAME_CONFIG.player.spawn },
      goal: { ...GAME_CONFIG.goal.position },
    };
  }
}
