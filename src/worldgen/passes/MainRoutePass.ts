import { VoxelType } from "../../world/VoxelDefinitions";
import { hashSeed } from "../SeededRandom";
import { setVoxel, voxelIndex, type WorldGenerationContext, type WorldGenerationPass } from "../WorldGenerationPass";

export class MainRoutePass implements WorldGenerationPass {
  readonly id = "main-route";
  readonly progress = 72;

  run(context: WorldGenerationContext): void {
    let carverVoxels = 0;
    const steps = Math.max(12, context.depth - context.startZ - 7);
    const pathPhase = hashSeed(context.seed, "path") * 0.00001;

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const z = Math.round(context.startZ + t * (context.goalZ - context.startZ));
      const x = Math.round(context.centerX + Math.sin(t * Math.PI * 2.2 + pathPhase) * 4);
      const localX = Math.max(1, Math.min(context.width - 2, x));
      const localSurface = context.surface[localX + context.width * z] || context.startSurface;
      const centerY = Math.max(6, Math.min(context.height - 4, localSurface + 2));

      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          for (let dy = -1; dy <= 2; dy += 1) {
            if ((dx * dx) / 4 + (dy * dy) / 2.25 + (dz * dz) / 1.6 > 1) continue;
            const px = Math.max(0, Math.min(context.width - 1, x + dx));
            const py = Math.max(0, Math.min(context.height - 1, centerY + dy));
            const pz = Math.max(0, Math.min(context.depth - 1, z + dz));
            const index = voxelIndex(context, px, py, pz);
            const before = context.types[index];
            if (before !== VoxelType.Empty && before !== VoxelType.Bedrock) carverVoxels += 1;
            setVoxel(context, px, py, pz, VoxelType.Empty);
          }
        }
      }
    }
    context.metrics.carverVoxels = carverVoxels;
  }
}
