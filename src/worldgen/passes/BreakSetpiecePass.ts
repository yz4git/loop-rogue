import { VoxelType } from "../../world/VoxelDefinitions";
import { hashSeed, SeededRandom } from "../SeededRandom";
import { setVoxel, type WorldGenerationContext, type WorldGenerationPass } from "../WorldGenerationPass";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function carveBox(
  context: WorldGenerationContext,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): void {
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) setVoxel(context, x, y, z, VoxelType.Empty);
    }
  }
}

function oreBurst(context: WorldGenerationContext, x: number, y: number, z: number): void {
  const points = [
    [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, 0, 1],
  ] as const;
  for (const [dx, dy, dz] of points) setVoxel(context, x + dx, y + dy, z + dz, VoxelType.Ore);
}

export class BreakSetpiecePass implements WorldGenerationPass {
  readonly id = "break-setpieces";
  readonly progress = 86;

  run(context: WorldGenerationContext): void {
    const random = new SeededRandom(hashSeed(context.seed, "break-setpieces"));
    const ratios = context.settings.size === "medium" ? [0.25, 0.46, 0.67, 0.82] : [0.28, 0.52, 0.76];

    ratios.forEach((ratio, index) => {
      const z = clamp(Math.floor(context.startZ + (context.goalZ - context.startZ) * ratio), 6, context.depth - 7);
      const side = index % 2 === 0 ? -1 : 1;
      const offset = 6 + random.nextInt(0, 3);
      const x = clamp(context.centerX + side * offset, 5, context.width - 6);
      const surface = context.surface[x + context.width * z] || context.startSurface;
      const y = clamp(surface - 4 - random.nextInt(0, 3), 3, context.height - 7);

      if (index % 3 === 0) this.makeOreVault(context, x, y, z, side);
      else if (index % 3 === 1) this.makeSlamShaft(context, x, y, z);
      else this.makeChainGallery(context, x, y, z, side);
      context.metrics.breakSetpieces += 1;
    });
  }

  private makeOreVault(context: WorldGenerationContext, x: number, y: number, z: number, side: number): void {
    carveBox(context, x - 3, x + 3, y, y + 4, z - 3, z + 3);
    const wallX = x - side * 3;
    for (let localZ = z - 2; localZ <= z + 2; localZ += 1) {
      for (let localY = y; localY <= y + 3; localY += 1) {
        setVoxel(context, wallX, localY, localZ, localY === y + 1 && localZ === z ? VoxelType.Soil : VoxelType.Rock);
      }
    }
    oreBurst(context, x + side, y + 1, z);
    oreBurst(context, x + side, y + 2, z + 1);
    context.coinSpawns.push({ x: x + 0.5, y: y + 1.5, z: z + 0.5 });
  }

  private makeSlamShaft(context: WorldGenerationContext, x: number, y: number, z: number): void {
    const top = clamp(y + 6, 8, context.height - 3);
    carveBox(context, x - 2, x + 2, y, top, z - 2, z + 2);
    for (let localX = x - 2; localX <= x + 2; localX += 1) {
      for (let localZ = z - 2; localZ <= z + 2; localZ += 1) setVoxel(context, localX, top, localZ, VoxelType.Soil);
    }
    oreBurst(context, x, y, z);
    context.enemySpawns.push({ x: x + 0.5, y: y + 1.7, z: z + 0.5 });
  }

  private makeChainGallery(context: WorldGenerationContext, x: number, y: number, z: number, side: number): void {
    carveBox(context, x - 4, x + 4, y, y + 3, z - 2, z + 2);
    for (let step = -3; step <= 3; step += 1) {
      const veinX = x + step;
      const veinY = y + 1 + (Math.abs(step) % 2);
      const veinZ = z + side * (Math.abs(step) % 2);
      setVoxel(context, veinX, veinY, veinZ, VoxelType.Ore);
      if (step % 2 === 0) setVoxel(context, veinX, veinY + 1, veinZ, VoxelType.Ore);
    }
    const weakWallZ = z - side * 2;
    for (let localX = x - 3; localX <= x + 3; localX += 1) {
      for (let localY = y; localY <= y + 2; localY += 1) setVoxel(context, localX, localY, weakWallZ, VoxelType.Soil);
    }
  }
}
