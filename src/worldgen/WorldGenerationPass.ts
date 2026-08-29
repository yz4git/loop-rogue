import { VoxelType } from "../world/VoxelDefinitions";
import { createStageArray, setStageVoxel, type StagePoint } from "../stages/StageSource";
import type { RandomStageSettings } from "../stages/ProceduralStageSource";
import { hashSeed, SeededRandom } from "./SeededRandom";
import { ValueNoise2D, ValueNoise3D } from "./Noise";
import type { ReachabilityResult } from "./Reachability";
import type { ReservedVolume } from "./Structures";

export const WORLDGEN_SIZE = {
  small: { width: 48, height: 32, depth: 48 },
  medium: { width: 64, height: 40, depth: 64 },
} as const;

export interface GenerationPassMetric {
  id: string;
  elapsedMs: number;
  progress: number;
}

export interface WorldGenerationMetrics {
  caves: number;
  carverVoxels: number;
  trees: number;
  boulders: number;
  structures: number;
  landmarks: number;
  jigsawPieces: number;
  jigsawConnectors: number;
  breakSetpieces: number;
}

export interface WorldGenerationContext {
  seed: string;
  numericSeed: number;
  generatorVersion: number;
  settings: RandomStageSettings;
  width: number;
  height: number;
  depth: number;
  types: Uint8Array;
  surface: Int16Array;
  mid: number;
  centerX: number;
  startZ: number;
  startSurface: number;
  goalX: number;
  goalZ: number;
  goalSurface: number;
  spawn: StagePoint;
  goal: StagePoint;
  terrain: ValueNoise2D;
  hills: ValueNoise2D;
  ridge: ValueNoise2D;
  warpX: ValueNoise2D;
  warpZ: ValueNoise2D;
  caveNoise: ValueNoise3D;
  oreRandom: SeededRandom;
  metrics: WorldGenerationMetrics;
  generationPasses: GenerationPassMetric[];
  coinSpawns: StagePoint[];
  enemySpawns: StagePoint[];
  structureLoot: StagePoint[];
  structureEnemies: StagePoint[];
  reservedVolumes: ReservedVolume[];
  biomeCounts: Partial<Record<"grassland" | "forest" | "rocky-highland" | "ruins", number>>;
  reachability?: ReachabilityResult;
}

export interface WorldGenerationPass {
  readonly id: string;
  readonly progress: number;
  run(context: WorldGenerationContext): void;
}

export function voxelIndex(context: WorldGenerationContext, x: number, y: number, z: number): number {
  return x + context.width * (y + context.height * z);
}

export function setVoxel(context: WorldGenerationContext, x: number, y: number, z: number, type: VoxelType): void {
  setStageVoxel(context.types, context.width, context.height, context.depth, x, y, z, type);
}

export function createWorldGenerationContext(
  settings: RandomStageSettings,
  generatorVersion: number,
): WorldGenerationContext {
  const dimensions = WORLDGEN_SIZE[settings.size];
  const { width, height, depth } = dimensions;
  return {
    seed: settings.seed,
    numericSeed: hashSeed(settings.seed, "world"),
    generatorVersion,
    settings,
    width,
    height,
    depth,
    types: createStageArray(width, height, depth),
    surface: new Int16Array(width * depth),
    mid: height * 0.43,
    centerX: Math.floor(width / 2),
    startZ: 5,
    startSurface: 10,
    goalX: Math.floor(width / 2),
    goalZ: depth - 6,
    goalSurface: 10,
    spawn: { x: 0, y: 0, z: 0 },
    goal: { x: 0, y: 0, z: 0 },
    terrain: new ValueNoise2D(hashSeed(settings.seed, "terrain")),
    hills: new ValueNoise2D(hashSeed(settings.seed, "hills")),
    ridge: new ValueNoise2D(hashSeed(settings.seed, "ridges")),
    warpX: new ValueNoise2D(hashSeed(settings.seed, "warp-x")),
    warpZ: new ValueNoise2D(hashSeed(settings.seed, "warp-z")),
    caveNoise: new ValueNoise3D(hashSeed(settings.seed, "caves")),
    oreRandom: new SeededRandom(hashSeed(settings.seed, "ore")),
    metrics: {
      caves: 0,
      carverVoxels: 0,
      trees: 0,
      boulders: 0,
      structures: 0,
      landmarks: 0,
      jigsawPieces: 0,
      jigsawConnectors: 0,
      breakSetpieces: 0,
    },
    generationPasses: [],
    coinSpawns: [],
    enemySpawns: [],
    structureLoot: [],
    structureEnemies: [],
    reservedVolumes: [],
    biomeCounts: {},
  };
}
