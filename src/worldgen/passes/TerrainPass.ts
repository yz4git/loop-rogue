import type { WorldGenerationContext, WorldGenerationPass } from "../WorldGenerationPass";

export class TerrainPass implements WorldGenerationPass {
  readonly id = "terrain";
  readonly progress = 20;

  run(context: WorldGenerationContext): void {
    const { width, height, depth } = context;
    const themeHeight = context.settings.theme === "mountain"
      ? 3
      : context.settings.theme === "forest"
        ? 1
        : 0;

    for (let z = 1; z < depth - 1; z += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const wx = context.warpX.sample(x / 18, z / 18) * 3.4;
        const wz = context.warpZ.sample(x / 18, z / 18) * 3.4;
        const base = context.terrain.fbm((x + wx) / 22, (z + wz) / 22, 4);
        const broad = context.hills.fbm((x + wx) / 10, (z + wz) / 10, 3);
        const sharp = 1 - Math.abs(context.ridge.fbm((x + wx) / 15, (z + wz) / 15, 3));
        const erosion = context.terrain.fbm((x + 30) / 7, (z - 20) / 7, 2);
        const heightValue = Math.round(
          context.mid + base * 5 + broad * 5 + sharp * 4 - erosion * 2 + themeHeight,
        );
        context.surface[x + width * z] = Math.max(7, Math.min(height - 5, heightValue));
      }
    }
  }
}
