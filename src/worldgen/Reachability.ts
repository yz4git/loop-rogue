import { VoxelType } from "../world/VoxelDefinitions";
import { stageIndex, type StagePoint } from "../stages/StageSource";

export interface ReachabilityResult {
  reachable: boolean;
  cost: number;
  visited: number;
}

const DIRECTIONS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
const UNREACHED = 0x3fffffff;

function traversalCost(type: VoxelType): number {
  if (type === VoxelType.Empty) return 1;
  if (type === VoxelType.Rock) return 5;
  if (type === VoxelType.Ore) return 6;
  return 2;
}

/**
 * Integer-weight Dijkstra specialized for voxel digging costs.
 *
 * The previous FIFO relaxation queue could enqueue the same voxel repeatedly
 * and was backed by an Int32Array sized to the number of voxels. Weighted
 * relaxation can legitimately need more than that many queue entries, so
 * medium worlds could overflow the queue and spend minutes processing invalid
 * entries. Costs are small positive integers and maxCost is bounded, making a
 * bucket queue both exact and much cheaper than a general heap here.
 */
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
  const layerSize = width * height;
  const costs = new Int32Array(total);
  costs.fill(UNREACHED);

  const boundedMaxCost = Math.max(0, Math.floor(maxCost));
  const buckets: number[][] = Array.from({ length: boundedMaxCost + 1 }, () => []);
  const startIndex = stageIndex(width, height, startX, startY, startZ);
  costs[startIndex] = 0;
  buckets[0].push(startIndex);

  let visited = 0;
  for (let currentCost = 0; currentCost <= boundedMaxCost; currentCost += 1) {
    const bucket = buckets[currentCost];
    while (bucket.length > 0) {
      const current = bucket.pop();
      if (current === undefined || costs[current] !== currentCost) continue;
      visited += 1;

      const z = Math.floor(current / layerSize);
      const remainder = current - z * layerSize;
      const y = Math.floor(remainder / width);
      const x = remainder - y * width;
      if (x === goalX && y === goalY && z === goalZ) {
        return { reachable: true, cost: currentCost, visited };
      }

      for (const [dx, dy, dz] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 1 || ny < 1 || nz < 1 || nx >= width - 1 || ny >= height - 1 || nz >= depth - 1) continue;

        const next = stageIndex(width, height, nx, ny, nz);
        const type = types[next] as VoxelType;
        if (type === VoxelType.Bedrock) continue;

        const nextCost = currentCost + traversalCost(type);
        if (nextCost > boundedMaxCost || nextCost >= costs[next]) continue;
        costs[next] = nextCost;
        buckets[nextCost].push(next);
      }
    }
  }

  return { reachable: false, cost: Number.POSITIVE_INFINITY, visited };
}
