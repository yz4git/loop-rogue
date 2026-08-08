import { VoxelType } from "../../world/VoxelDefinitions";
import { setVoxel, type WorldGenerationContext, type WorldGenerationPass } from "../WorldGenerationPass";

export class CavePass implements WorldGenerationPass {
  readonly id = "caves";
  readonly progress = 62;

  run(context: WorldGenerationContext): void {
    let caves = 0;
    for (let z = 3; z < context.depth - 3; z += 1) {
      for (let y = 3; y < context.height - 3; y += 1) {
        for (let x = 3; x < context.width - 3; x += 1) {
          const surfaceY = context.surface[x + context.width * z] || context.startSurface;
          if (y > surfaceY - 3 || y < 3) continue;
          const density = context.caveNoise.sample(x / 8, y / 7, z / 8);
          const tunnel = context.caveNoise.sample((x + 17) / 13, (y - 9) / 9, (z + 31) / 13);
          if (density * 0.72 + tunnel * 0.28 > 0.48) {
            setVoxel(context, x, y, z, VoxelType.Empty);
            caves += 1;
          }
        }
      }
    }
    context.metrics.caves = caves;
  }
}
