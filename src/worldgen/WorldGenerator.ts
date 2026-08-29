import type { StageSnapshot } from "../stages/StageSource";
import type { RandomStageSettings } from "../stages/ProceduralStageSource";
import { WORLD_GENERATOR_VERSION } from "./WorldGeneratorVersion";
import {
  createWorldGenerationContext,
  type GenerationPassMetric,
  type WorldGenerationContext,
  type WorldGenerationPass,
} from "./WorldGenerationPass";
import { TerrainPass } from "./passes/TerrainPass";
import { LayerPass } from "./passes/LayerPass";
import { CavePass } from "./passes/CavePass";
import { MainRoutePass } from "./passes/MainRoutePass";
import { FeaturePass } from "./passes/FeaturePass";
import { StructurePass } from "./passes/StructurePass";
import { BreakSetpiecePass } from "./passes/BreakSetpiecePass";
import { GameplayPlacementPass } from "./passes/GameplayPlacementPass";
import { ValidationPass } from "./passes/ValidationPass";
import { BiomePass } from "./passes/BiomePass";

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class WorldGenerator {
  private readonly passes: readonly WorldGenerationPass[] = [
    new TerrainPass(),
    new LayerPass(),
    new CavePass(),
    new MainRoutePass(),
    new FeaturePass(),
    new StructurePass(),
    new BreakSetpiecePass(),
    new GameplayPlacementPass(),
    new ValidationPass(),
    new BiomePass(),
  ];

  constructor(private readonly settings: RandomStageSettings) {}

  generate(): StageSnapshot {
    const startedAt = now();
    const context = createWorldGenerationContext(this.settings, WORLD_GENERATOR_VERSION);
    for (const pass of this.passes) {
      const passStartedAt = now();
      pass.run(context);
      const metric: GenerationPassMetric = {
        id: pass.id,
        elapsedMs: Math.round((now() - passStartedAt) * 10) / 10,
        progress: pass.progress,
      };
      context.generationPasses.push(metric);
    }
    return this.createSnapshot(context, Math.round((now() - startedAt) * 10) / 10);
  }

  private createSnapshot(context: WorldGenerationContext, generationMs: number): StageSnapshot {
    const reachability = context.reachability ?? {
      reachable: false,
      cost: Number.POSITIVE_INFINITY,
      visited: 0,
    };
    return {
      width: context.width,
      height: context.height,
      depth: context.depth,
      types: context.types,
      spawn: context.spawn,
      goal: context.goal,
      metadata: {
        generatorVersion: context.generatorVersion,
        seed: context.seed,
        difficulty: context.settings.difficulty,
        theme: context.settings.theme,
        reachability,
        caves: context.metrics.caves,
        carverVoxels: context.metrics.carverVoxels,
        trees: context.metrics.trees,
        boulders: context.metrics.boulders,
        structures: context.metrics.structures,
        landmarks: context.metrics.landmarks,
        jigsawPieces: context.metrics.jigsawPieces,
        breakSetpieces: context.metrics.breakSetpieces,
        enemySpawns: context.enemySpawns.concat(context.structureEnemies),
        coinSpawns: context.coinSpawns.concat(context.structureLoot),
        generationMs,
        generationPasses: context.generationPasses,
        biomeCounts: context.biomeCounts,
        structureLoot: context.structureLoot,
      },
    };
  }
}
