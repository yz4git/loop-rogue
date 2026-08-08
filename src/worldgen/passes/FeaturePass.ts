import { VoxelType } from "../../world/VoxelDefinitions";
import { hashSeed, SeededRandom } from "../SeededRandom";
import { setVoxel, type WorldGenerationContext, type WorldGenerationPass } from "../WorldGenerationPass";

export class FeaturePass implements WorldGenerationPass {
  readonly id = "features";
  readonly progress = 80;

  run(context: WorldGenerationContext): void {
    let trees = 0;
    let boulders = 0;
    const featureRandom = new SeededRandom(hashSeed(context.seed, "features"));
    const featureCandidates = context.settings.theme === "mountain"
      ? 4
      : context.settings.theme === "forest"
        ? 10
        : 7;

    for (let candidate = 0; candidate < featureCandidates; candidate += 1) {
      const x = 4 + featureRandom.nextInt(0, context.width - 9);
      const z = 9 + featureRandom.nextInt(0, Math.max(1, context.depth - 19));
      if (Math.abs(x - context.centerX) < 5 && z < context.startZ + 9) continue;
      if (Math.abs(x - context.goalX) < 5 && Math.abs(z - context.goalZ) < 7) continue;
      const ground = context.surface[x + context.width * z] || context.startSurface;
      const tree = context.settings.theme === "forest" || candidate % 3 !== 0;

      if (tree) {
        const trunkHeight = 3 + featureRandom.nextInt(0, 2);
        for (let y = 1; y <= trunkHeight; y += 1) {
          setVoxel(context, x, ground + y, z, VoxelType.Wood);
        }
        for (let dz = -2; dz <= 2; dz += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            if (Math.abs(dx) + Math.abs(dz) > 3) continue;
            setVoxel(context, x + dx, ground + trunkHeight, z + dz, VoxelType.Leaves);
          }
        }
        trees += 1;
      } else {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (Math.abs(dx) + Math.abs(dz) === 2 && featureRandom.next() < 0.5) continue;
            setVoxel(context, x + dx, ground + 1 + (dx === 0 && dz === 0 ? 1 : 0), z + dz, VoxelType.Rock);
          }
        }
        boulders += 1;
      }
    }

    const exposedOre = Math.max(2, Math.floor((context.width * context.depth) / 700));
    for (let index = 0; index < exposedOre; index += 1) {
      const x = 3 + featureRandom.nextInt(0, context.width - 7);
      const z = 7 + featureRandom.nextInt(0, Math.max(1, context.depth - 15));
      if (Math.abs(x - context.centerX) < 4 && z < 12) continue;
      const ground = context.surface[x + context.width * z] || context.startSurface;
      setVoxel(context, x, ground + 1, z, VoxelType.Ore);
      context.coinSpawns.push({ x: x + 0.5, y: ground + 1.6, z: z + 0.5 });
    }

    context.metrics.trees = trees;
    context.metrics.boulders = boulders;
  }
}
