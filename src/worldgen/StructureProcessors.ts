import { VoxelType } from "../world/VoxelDefinitions";
import { stageIndex, type StagePoint } from "../stages/StageSource";
import type { ReservedVolume } from "./Structures";

export interface StructureProcessorResult { loot: StagePoint[]; enemies: StagePoint[]; decayed: number; }

/** 構造物を配置した後に、崩れ・報酬・敵のソケットを決定論的に加える。 */
export function processStructures(types: Uint8Array, width: number, height: number, depth: number, reserved: readonly ReservedVolume[], random: { next(): number }): StructureProcessorResult {
  const loot: StagePoint[] = [];
  const enemies: StagePoint[] = [];
  let decayed = 0;
  reserved.forEach((volume, index) => {
    const cx = Math.floor((volume.min.x + volume.max.x) / 2);
    const cz = Math.floor((volume.min.z + volume.max.z) / 2);
    loot.push({ x: cx + 0.5, y: Math.min(height - 2, volume.min.y + 1.5), z: cz + 0.5 });
    if (index % 2 === 0) enemies.push({ x: volume.min.x + 1.5, y: Math.min(height - 2, volume.min.y + 1.7), z: volume.min.z + 1.5 });
    for (let y = volume.min.y; y <= volume.max.y; y += 1) for (let z = volume.min.z; z <= volume.max.z; z += 1) for (let x = volume.min.x; x <= volume.max.x; x += 1) {
      if (random.next() > 0.985 && types[stageIndex(width, height, x, y, z)] === VoxelType.Rock) { types[stageIndex(width, height, x, y, z)] = VoxelType.Empty; decayed += 1; }
    }
  });
  return { loot, enemies, decayed };
}
