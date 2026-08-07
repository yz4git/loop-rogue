import { VoxelType } from "../world/VoxelDefinitions";
import { setStageVoxel, type StagePoint } from "../stages/StageSource";

export interface JigsawResult {
  pieces: number;
  rooms: number;
  connectors: number;
}

interface Connector {
  x: number;
  y: number;
  z: number;
  direction: "x" | "z";
}

function carveBox(types: Uint8Array, width: number, height: number, depth: number, center: StagePoint, radiusX: number, radiusY: number, radiusZ: number): number {
  let carved = 0;
  for (let z = -radiusZ; z <= radiusZ; z += 1) for (let y = -radiusY; y <= radiusY; y += 1) for (let x = -radiusX; x <= radiusX; x += 1) {
    if (x * x / Math.max(1, radiusX * radiusX) + y * y / Math.max(1, radiusY * radiusY) + z * z / Math.max(1, radiusZ * radiusZ) > 1.2) continue;
    const px = Math.round(center.x + x);
    const py = Math.round(center.y + y);
    const pz = Math.round(center.z + z);
    setStageVoxel(types, width, height, depth, px, py, pz, VoxelType.Empty);
    carved += 1;
  }
  return carved;
}

export function generateJigsawNetwork(
  types: Uint8Array,
  width: number,
  height: number,
  depth: number,
  start: StagePoint,
  goal: StagePoint,
  random: { next(): number; nextInt(min: number, max: number): number },
): JigsawResult {
  const queue: Connector[] = [{ x: start.x, y: Math.max(7, start.y - 1), z: start.z + 5, direction: "z" }];
  let pieces = 0;
  let rooms = 0;
  let connectors = 0;
  while (queue.length > 0 && pieces < 12) {
    const connector = queue.shift();
    if (!connector) break;
    const step = 4 + random.nextInt(0, 4);
    const room = {
      x: connector.x + (connector.direction === "x" ? (random.next() > 0.5 ? step : -step) : 0),
      y: Math.max(6, Math.min(height - 5, connector.y + random.nextInt(-1, 1))),
      z: connector.z + (connector.direction === "z" ? step : 0),
    };
    if (room.x < 3 || room.x >= width - 3 || room.z < 3 || room.z >= depth - 3) continue;
    carveBox(types, width, height, depth, room, pieces % 3 === 0 ? 3 : 2, 2, pieces % 2 === 0 ? 3 : 2);
    carveBox(types, width, height, depth, { x: (connector.x + room.x) * 0.5, y: room.y, z: (connector.z + room.z) * 0.5 }, 2, 1, 2);
    pieces += 1;
    rooms += pieces % 3 === 0 ? 1 : 0;
    connectors += 1;
    if (Math.abs(room.z - goal.z) > 6 && pieces < 8) {
      queue.push({ x: room.x, y: room.y, z: room.z + 3, direction: pieces % 2 === 0 ? "z" : "x" });
    }
  }
  // 最終部屋には終端コネクターを置き、地下探索の目的地を明確にする。
  carveBox(types, width, height, depth, { x: goal.x, y: goal.y - 1, z: goal.z }, 3, 2, 3);
  return { pieces, rooms, connectors };
}
