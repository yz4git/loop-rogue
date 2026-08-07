import { VoxelType } from "../world/VoxelDefinitions";
import { setStageVoxel, type StagePoint } from "../stages/StageSource";

export interface ReservedVolume {
  min: StagePoint;
  max: StagePoint;
  ownerId: string;
  padding: number;
}

export interface StructureTemplate {
  id: string;
  width: number;
  height: number;
  depth: number;
  layers: readonly string[][];
  weight: number;
}

export interface StructurePlacementResult {
  structures: number;
  landmarks: number;
  reserved: ReservedVolume[];
}

const TEMPLATES: readonly StructureTemplate[] = [
  {
    id: "wood-hut",
    width: 7,
    height: 5,
    depth: 7,
    weight: 5,
    layers: [
      ["       ", " WWWWW ", " W###W ", " W###W ", " W###W ", " WWWWW ", "       "],
      ["       ", " W   W ", " W   W ", " W   W ", " W   W ", " W   W ", "       "],
      ["       ", " W   W ", " W   W ", " W   W ", " W   W ", " W   W ", "       "],
      ["       ", " W   W ", " W   W ", " W   W ", " W   W ", " W   W ", "       "],
      ["       ", " WWWWW ", " WWWWW ", " WWWWW ", " WWWWW ", " WWWWW ", "       "],
    ],
  },
  {
    id: "stone-tower",
    width: 5,
    height: 8,
    depth: 5,
    weight: 3,
    layers: Array.from({ length: 8 }, (_, y) => Array.from({ length: 5 }, (_, z) => y === 7 ? "#####" : z === 0 || z === 4 ? "#####" : "# # #")),
  },
  {
    id: "stone-gate",
    width: 9,
    height: 5,
    depth: 3,
    weight: 2,
    layers: [
      ["### ###", "### ###", "### ###"],
      ["### ###", "#     #", "### ###"],
      ["### ###", "#     #", "### ###"],
      ["### ###", "#     #", "### ###"],
      ["########", "########", "########"],
    ],
  },
];

function overlaps(a: ReservedVolume, b: ReservedVolume): boolean {
  return a.min.x - a.padding <= b.max.x && a.max.x + a.padding >= b.min.x
    && a.min.y - a.padding <= b.max.y && a.max.y + a.padding >= b.min.y
    && a.min.z - a.padding <= b.max.z && a.max.z + a.padding >= b.min.z;
}

export function placeStructures(
  types: Uint8Array,
  width: number,
  height: number,
  depth: number,
  surface: Int16Array,
  start: StagePoint,
  goal: StagePoint,
  random: { nextInt(min: number, max: number): number; next(): number },
): StructurePlacementResult {
  const reserved: ReservedVolume[] = [];
  let structures = 0;
  let landmarks = 0;
  for (let candidate = 0; candidate < 5; candidate += 1) {
    const template = TEMPLATES[candidate % TEMPLATES.length];
    const x = 4 + random.nextInt(0, Math.max(1, width - template.width - 8));
    const z = 10 + random.nextInt(0, Math.max(1, depth - template.depth - 16));
    const ground = surface[Math.min(width - 1, x + Math.floor(template.width / 2)) + width * Math.min(depth - 1, z + Math.floor(template.depth / 2))] || 10;
    const min = { x, y: ground + 1, z };
    const max = { x: x + template.width - 1, y: ground + template.height, z: z + template.depth - 1 };
    if (Math.abs(x + template.width * 0.5 - start.x) < 8 && z < start.z + 13) continue;
    if (Math.hypot(x + template.width * 0.5 - goal.x, z + template.depth * 0.5 - goal.z) < 9) continue;
    const volume = { min, max, ownerId: template.id, padding: 2 };
    if (reserved.some((other) => overlaps(volume, other))) continue;
    if (max.x >= width - 2 || max.z >= depth - 2 || max.y >= height - 2) continue;
    const rotation = candidate % 2;
    for (let layer = 0; layer < template.height; layer += 1) {
      const rows = template.layers[layer] ?? [];
      for (let localZ = 0; localZ < template.depth; localZ += 1) {
        const row = rows[localZ] ?? "";
        for (let localX = 0; localX < template.width; localX += 1) {
          const symbol = row[localX] ?? " ";
          if (symbol === " ") continue;
          const rotatedX = rotation === 0 ? localX : template.width - 1 - localX;
          const type = symbol === "W" ? VoxelType.Wood : symbol === "#" ? VoxelType.Rock : VoxelType.Empty;
          setStageVoxel(types, width, height, depth, x + rotatedX, ground + 1 + layer, z + localZ, type);
        }
      }
    }
    reserved.push(volume);
    structures += 1;
    if (template.id !== "wood-hut") landmarks += 1;
  }
  return { structures, landmarks, reserved };
}
