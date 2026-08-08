import type { WorldGenerationContext, WorldGenerationPass } from "../WorldGenerationPass";

export class BiomePass implements WorldGenerationPass {
  readonly id = "biomes";
  readonly progress = 100;

  run(context: WorldGenerationContext): void {
    const counts: Partial<Record<"grassland" | "forest" | "rocky-highland" | "ruins", number>> = {};
    for (let z = 1; z < context.depth - 1; z += 2) {
      for (let x = 1; x < context.width - 1; x += 2) {
        const surfaceY = context.surface[x + context.width * z];
        const key = context.settings.theme === "forest"
          ? "forest"
          : context.settings.theme === "mountain"
            ? "rocky-highland"
            : context.settings.theme === "ruins"
              ? "ruins"
              : surfaceY > context.mid + 4
                ? "rocky-highland"
                : (x + z) % 5 === 0
                  ? "forest"
                  : "grassland";
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    context.biomeCounts = counts;
  }
}
