import { VoxelType } from "../world/VoxelDefinitions";
import { stageIndex, type StagePoint } from "../stages/StageSource";

export interface ReachabilityResult {
  reachable: boolean;
  cost: number;
  visited: number;
}

const DIRECTIONS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

export function checkDigReachability(
  types: Uint8Array,
  width: number,
  height: number,
  depth: number,
  start: StagePoint,
  goal: StagePoint,
  maxCost = 900,
): ReachabilityResult {
  const startX = Math.max(1, Math.min(width - 2, Math.floor(start.x)));
  const startY = Math.max(1, Math.min(height - 2, Math.floor(start.y)));
  const startZ = Math.max(1, Math.min(depth - 2, Math.floor(start.z)));
  const goalX = Math.max(1, Math.min(width - 2, Math.floor(goal.x)));
  const goalY = Math.max(1, Math.min(height - 2, Math.floor(goal.y)));
  const goalZ = Math.max(1, Math.min(depth - 2, Math.floor(goal.z)));
  const total = width * height * depth;
  const costs = new Int32Array(total);
  costs.fill(0x3fffffff);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const startIndex = stageIndex(width, height, startX, startY, startZ);
  costs[startIndex] = 0;
  queue[tail++] = startIndex;
  let visited = 0;
  while (head < tail) {
    const current = queue[head++];
    visited += 1;
    const cost = costs[current];
    const z = Math.floor(current / (width * height));
    const remainder = current - z * width * height;
    const y = Math.floor(remainder / width);
    const x = remainder - y * width;
    if (x === goalX && y === goalY && z === goalZ) return { reachable: true, cost, visited };
    for (const [dx, dy, dz] of DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (nx < 1 || ny < 1 || nz < 1 || nx >= width - 1 || ny >= height - 1 || nz >= depth - 1) continue;
      const next = stageIndex(width, height, nx, ny, nz);
      const type = types[next] as VoxelType;
      if (type === VoxelType.Bedrock) continue;
      const stepCost = type === VoxelType.Empty ? 1 : type === VoxelType.Rock ? 5 : type === VoxelType.Ore ? 6 : 2;
      const nextCost = cost + stepCost;
      if (nextCost > maxCost || nextCost >= costs[next]) continue;
      costs[next] = nextCost;
      queue[tail++] = next;
    }
  }
  return { reachable: false, cost: Number.POSITIVE_INFINITY, visited };
}
