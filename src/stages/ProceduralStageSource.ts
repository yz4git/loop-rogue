import { WorldGenerator } from "../worldgen/WorldGenerator";
import { WORLD_GENERATOR_VERSION } from "../worldgen/WorldGeneratorVersion";
import type { StageSnapshot, StageSource } from "./StageSource";

export { WORLD_GENERATOR_VERSION };

export interface RandomStageSettings {
  seed: string;
  size: "small" | "medium";
  difficulty: "easy" | "normal" | "hard";
  theme: "mixed" | "forest" | "mountain" | "ruins";
}

export class ProceduralStageSource implements StageSource {
  readonly id = "procedural";
  readonly settings: RandomStageSettings;

  constructor(settings: Partial<RandomStageSettings> = {}) {
    this.settings = {
      seed: settings.seed?.trim() || "first-dig",
      size: settings.size ?? "small",
      difficulty: settings.difficulty ?? "normal",
      theme: settings.theme ?? "mixed",
    };
  }

  generate(): StageSnapshot {
    return new WorldGenerator(this.settings).generate();
  }
}
