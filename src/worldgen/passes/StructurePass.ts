import { hashSeed, SeededRandom } from "../SeededRandom";
import { placeStructures } from "../Structures";
import { processStructures } from "../StructureProcessors";
import type { WorldGenerationContext, WorldGenerationPass } from "../WorldGenerationPass";

export class StructurePass implements WorldGenerationPass {
  readonly id = "structures";
  readonly progress = 84;

  run(context: WorldGenerationContext): void {
    const structureResult = placeStructures(
      context.types,
      context.width,
      context.height,
      context.depth,
      context.surface,
      context.spawn,
      context.goal,
      new SeededRandom(hashSeed(context.seed, "structures")),
    );
    const processed = processStructures(
      context.types,
      context.width,
      context.height,
      context.depth,
      structureResult.reserved,
      new SeededRandom(hashSeed(context.seed, "processors")),
    );

    context.reservedVolumes = structureResult.reserved;
    context.structureLoot = processed.loot;
    context.structureEnemies = processed.enemies;
    context.metrics.structures = structureResult.structures;
    context.metrics.landmarks = structureResult.landmarks;
  }
}
