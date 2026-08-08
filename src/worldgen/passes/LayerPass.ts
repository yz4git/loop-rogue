import { VoxelType } from "../../world/VoxelDefinitions";
import { setVoxel, type WorldGenerationContext, type WorldGenerationPass } from "../WorldGenerationPass";

export class LayerPass implements WorldGenerationPass {
  readonly id = "layers";
  readonly progress = 40;

  run(context: WorldGenerationContext): void {
    const { width, height, depth } = context;
    const centerX = context.centerX;
    const startZ = context.startZ;
    context.startSurface = context.surface[centerX + width * startZ] || 10;

    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const edgeColumn = x === 0 || z === 0 || x === width - 1 || z === depth - 1;
        const surfaceY = context.surface[x + width * z] || context.startSurface;
        for (let y = 0; y < height; y += 1) {
          if (edgeColumn || y === 0 || y === height - 1) {
            setVoxel(context, x, y, z, VoxelType.Bedrock);
          } else if (y <= surfaceY) {
            const depthFromSurface = surfaceY - y;
            const ore = depthFromSurface > 3 && context.oreRandom.next() < 0.008;
            const rock = depthFromSurface > 4
              && (depthFromSurface > 8 || context.oreRandom.next() < 0.28);
            setVoxel(context, x, y, z, ore ? VoxelType.Ore : rock ? VoxelType.Rock : VoxelType.Soil);
          }
        }
      }
    }

    // 開始地点を平坦化し、ランダム地形でも開始直後に詰まらない空間を予約する。
    for (let z = 2; z <= 8; z += 1) {
      for (let x = centerX - 3; x <= centerX + 3; x += 1) {
        for (let y = context.startSurface + 1; y < Math.min(height - 1, context.startSurface + 5); y += 1) {
          setVoxel(context, x, y, z, VoxelType.Empty);
        }
      }
    }

    context.goalX = centerX;
    context.goalZ = depth - 6;
    context.goalSurface = context.surface[context.goalX + width * context.goalZ]
      || Math.max(8, context.startSurface - 2);
    for (let z = context.goalZ - 2; z <= context.goalZ + 2; z += 1) {
      for (let x = context.goalX - 2; x <= context.goalX + 2; x += 1) {
        for (
          let y = Math.max(2, context.goalSurface - 1);
          y < Math.min(height - 1, context.goalSurface + 3);
          y += 1
        ) {
          setVoxel(context, x, y, z, VoxelType.Empty);
        }
      }
    }

    context.spawn = {
      x: centerX + 0.5,
      y: context.startSurface + 1.7,
      z: startZ + 0.5,
    };
    context.goal = {
      x: context.goalX + 0.5,
      y: context.goalSurface + 0.9,
      z: context.goalZ + 0.5,
    };
  }
}
