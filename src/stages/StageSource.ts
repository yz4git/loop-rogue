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
