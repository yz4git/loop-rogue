import { VoxelType } from "../world/VoxelDefinitions";

export interface StagePoint {
  x: number;
  y: number;
  z: number;
}

export interface StageSnapshot {
  width: number;
  height: number;
  depth: number;
  types: Uint8Array;
  spawn: StagePoint;
  goal: StagePoint;
  metadata?: StageMetadata;
}

export interface StageMetadata {
  generatorVersion?: number;
  seed?: string;
  difficulty?: "easy" | "normal" | "hard";
  theme?: "mixed" | "forest" | "mountain" | "ruins";
  reachability?: { reachable: boolean; cost: number; visited: number };
  caves?: number;
  carverVoxels?: number;
  trees?: number;
  boulders?: number;
  structures?: number;
  jigsawPieces?: number;
  landmarks?: number;
  breakSetpieces?: number;
  enemySpawns?: StagePoint[];
  coinSpawns?: StagePoint[];
  generationMs?: number;
  generationPasses?: Array<{ id: string; elapsedMs: number; progress: number }>;
  biomeCounts?: Partial<Record<"grassland" | "forest" | "rocky-highland" | "ruins", number>>;
  structureLoot?: StagePoint[];
}

export interface StageSource {
  readonly id: string;
  generate(): StageSnapshot;
}

export function createStageArray(width: number, height: number, depth: number): Uint8Array {
  return new Uint8Array(width * height * depth);
}

export function stageIndex(width: number, height: number, x: number, y: number, z: number): number {
  return x + width * (y + height * z);
}

export function setStageVoxel(
  types: Uint8Array,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  type: VoxelType,
): void {
  if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) return;
  types[stageIndex(width, height, x, y, z)] = type;
}
