import { generateJigsawNetwork } from "../Jigsaw";
import { hashSeed, SeededRandom } from "../SeededRandom";
import type { WorldGenerationContext, WorldGenerationPass } from "../WorldGenerationPass";

export class GameplayPlacementPass implements WorldGenerationPass {
  readonly id = "gameplay-placement";
  readonly progress = 90;

  run(context: WorldGenerationContext): void {
    const enemyZs = [10, 17, 24, 31, 38];
    context.enemySpawns = enemyZs
      .filter((z) => z < context.goalZ - 2)
      .map((z, index) => {
        const x = context.centerX + (index % 2 === 0 ? -2 : 2);
        const localX = Math.max(1, Math.min(context.width - 2, x));
        const localSurface = context.surface[localX + context.width * z] || context.startSurface;
        return { x: x + 0.5, y: localSurface + 1.7, z: z + 0.5 };
      });

    const jigsaw = generateJigsawNetwork(
      context.types,
      context.width,
      context.height,
      context.depth,
      context.spawn,
      context.goal,
      new SeededRandom(hashSeed(context.seed, "jigsaw")),
    );
    context.metrics.jigsawPieces = jigsaw.pieces;
    context.metrics.jigsawConnectors = jigsaw.connectors;
  }
}
