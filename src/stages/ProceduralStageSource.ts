import { VoxelType } from "../world/VoxelDefinitions";
import { hashSeed, SeededRandom } from "../worldgen/SeededRandom";
import { ValueNoise2D, ValueNoise3D, ridged } from "../worldgen/Noise";
import { checkDigReachability } from "../worldgen/Reachability";
import { placeStructures } from "../worldgen/Structures";
import { generateJigsawNetwork } from "../worldgen/Jigsaw";
import { createStageArray, setStageVoxel, type StageSnapshot, type StageSource } from "./StageSource";

export const WORLD_GENERATOR_VERSION = 1;

export interface RandomStageSettings {
  seed: string;
  size: "small" | "medium";
  difficulty: "easy" | "normal" | "hard";
  theme: "mixed" | "forest" | "mountain" | "ruins";
}

const SIZE = {
  small: { width: 48, height: 32, depth: 48 },
  medium: { width: 64, height: 40, depth: 64 },
} as const;

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
    const dimensions = SIZE[this.settings.size];
    const { width, height, depth } = dimensions;
    const types = createStageArray(width, height, depth);
    const set = (x: number, y: number, z: number, type: VoxelType): void => setStageVoxel(types, width, height, depth, x, y, z, type);
    const terrain = new ValueNoise2D(hashSeed(this.settings.seed, "terrain"));
    const hills = new ValueNoise2D(hashSeed(this.settings.seed, "hills"));
    const ridge = new ValueNoise2D(hashSeed(this.settings.seed, "ridges"));
    const warpX = new ValueNoise2D(hashSeed(this.settings.seed, "warp-x"));
    const warpZ = new ValueNoise2D(hashSeed(this.settings.seed, "warp-z"));
    const caveNoise = new ValueNoise3D(hashSeed(this.settings.seed, "caves"));
    const random = new SeededRandom(hashSeed(this.settings.seed, "ore"));
    const surface = new Int16Array(width * depth);
    const mid = height * 0.43;
    const themeHeight = this.settings.theme === "mountain" ? 3 : this.settings.theme === "forest" ? 1 : 0;
    for (let z = 1; z < depth - 1; z += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const wx = warpX.sample(x / 18, z / 18) * 3.4;
        const wz = warpZ.sample(x / 18, z / 18) * 3.4;
        const base = terrain.fbm((x + wx) / 22, (z + wz) / 22, 4);
        const broad = hills.fbm((x + wx) / 10, (z + wz) / 10, 3);
        const sharp = ridged(ridge, (x + wx) / 15, (z + wz) / 15);
        const erosion = terrain.fbm((x + 30) / 7, (z - 20) / 7, 2);
        const heightValue = Math.round(mid + base * 5 + broad * 5 + sharp * 4 - erosion * 2 + themeHeight);
        surface[x + width * z] = Math.max(7, Math.min(height - 5, heightValue));
      }
    }
    const centerX = Math.floor(width / 2);
    const startZ = 5;
    const startSurface = surface[centerX + width * startZ] || 10;
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const edgeColumn = x === 0 || z === 0 || x === width - 1 || z === depth - 1;
        const surfaceY = surface[x + width * z] || startSurface;
        for (let y = 0; y < height; y += 1) {
          if (edgeColumn || y === 0 || y === height - 1) set(x, y, z, VoxelType.Bedrock);
          else if (y <= surfaceY) {
            const depthFromSurface = surfaceY - y;
            const ore = depthFromSurface > 3 && random.next() < 0.008;
            const rock = depthFromSurface > 4 && (depthFromSurface > 8 || random.next() < 0.28);
            set(x, y, z, ore ? VoxelType.Ore : rock ? VoxelType.Rock : VoxelType.Soil);
          }
        }
      }
    }
    // 初期地点は平坦な足場と見通しを確保し、ランダム地形でも開始直後に詰まらないようにする。
    for (let z = 2; z <= 8; z += 1) for (let x = centerX - 3; x <= centerX + 3; x += 1) {
      const floorY = startSurface;
      for (let y = floorY + 1; y < Math.min(height - 1, floorY + 5); y += 1) set(x, y, z, VoxelType.Empty);
    }
    const goalX = centerX;
    const goalZ = depth - 6;
    const goalSurface = surface[goalX + width * goalZ] || Math.max(8, startSurface - 2);
    for (let z = goalZ - 2; z <= goalZ + 2; z += 1) for (let x = goalX - 2; x <= goalX + 2; x += 1) {
      for (let y = Math.max(2, goalSurface - 1); y < Math.min(height - 1, goalSurface + 3); y += 1) set(x, y, z, VoxelType.Empty);
    }
    // 3Dノイズ洞窟。地表近くと外周は残し、細かい穴だらけにならないよう低周波で掘る。
    let caves = 0;
    for (let z = 3; z < depth - 3; z += 1) for (let y = 3; y < height - 3; y += 1) for (let x = 3; x < width - 3; x += 1) {
      const surfaceY = surface[x + width * z] || startSurface;
      if (y > surfaceY - 3 || y < 3) continue;
      const density = caveNoise.sample(x / 8, y / 7, z / 8);
      const tunnel = caveNoise.sample((x + 17) / 13, (y - 9) / 9, (z + 31) / 13);
      if (density * 0.72 + tunnel * 0.28 > 0.48) {
        set(x, y, z, VoxelType.Empty);
        caves += 1;
      }
    }
    // スタートからゴールへ続くCarver。床を残した浅い楕円トンネルを複数点で掘る。
    let carverVoxels = 0;
    const steps = Math.max(12, depth - startZ - 7);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const z = Math.round(startZ + t * (goalZ - startZ));
      const x = Math.round(centerX + Math.sin(t * Math.PI * 2.2 + hashSeed(this.settings.seed, "path") * 0.00001) * 4);
      const localSurface = surface[Math.max(1, Math.min(width - 2, x)) + width * z] || startSurface;
      const centerY = Math.max(6, Math.min(height - 4, localSurface + 2));
      for (let dz = -1; dz <= 1; dz += 1) for (let dx = -2; dx <= 2; dx += 1) for (let dy = -1; dy <= 2; dy += 1) {
        if ((dx * dx) / 4 + (dy * dy) / 2.25 + (dz * dz) / 1.6 > 1) continue;
        const before = types[(Math.max(0, Math.min(width - 1, x + dx))) + width * (Math.max(0, Math.min(height - 1, centerY + dy)) + height * Math.max(0, Math.min(depth - 1, z + dz)))];
        if (before !== VoxelType.Empty && before !== VoxelType.Bedrock) carverVoxels += 1;
        set(x + dx, centerY + dy, z + dz, VoxelType.Empty);
      }
    }
    // 自然Feature。木と巨岩は地形と同じボクセル配列へ置き、描画・破壊・衝突を共有する。
    let trees = 0;
    let boulders = 0;
    const featureRandom = new SeededRandom(hashSeed(this.settings.seed, "features"));
    const featureCandidates = this.settings.theme === "mountain" ? 4 : this.settings.theme === "forest" ? 10 : 7;
    for (let candidate = 0; candidate < featureCandidates; candidate += 1) {
      const x = 4 + featureRandom.nextInt(0, width - 9);
      const z = 9 + featureRandom.nextInt(0, Math.max(1, depth - 19));
      if (Math.abs(x - centerX) < 5 && z < startZ + 9) continue;
      if (Math.abs(x - goalX) < 5 && Math.abs(z - goalZ) < 7) continue;
      const ground = surface[x + width * z] || startSurface;
      const tree = this.settings.theme === "forest" || candidate % 3 !== 0;
      if (tree) {
        const trunkHeight = 3 + featureRandom.nextInt(0, 2);
        for (let y = 1; y <= trunkHeight; y += 1) set(x, ground + y, z, VoxelType.Wood);
        for (let dz = -2; dz <= 2; dz += 1) for (let dx = -2; dx <= 2; dx += 1) {
          if (Math.abs(dx) + Math.abs(dz) > 3) continue;
          set(x + dx, ground + trunkHeight, z + dz, VoxelType.Leaves);
        }
        trees += 1;
      } else {
        for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
          if (Math.abs(dx) + Math.abs(dz) === 2 && featureRandom.next() < 0.5) continue;
          set(x + dx, ground + 1 + (dx === 0 && dz === 0 ? 1 : 0), z + dz, VoxelType.Rock);
        }
        boulders += 1;
      }
    }
    const exposedOre = Math.max(2, Math.floor((width * depth) / 700));
    const coinSpawns: Array<{ x: number; y: number; z: number }> = [];
    for (let index = 0; index < exposedOre; index += 1) {
      const x = 3 + featureRandom.nextInt(0, width - 7);
      const z = 7 + featureRandom.nextInt(0, Math.max(1, depth - 15));
      if (Math.abs(x - centerX) < 4 && z < 12) continue;
      const ground = surface[x + width * z] || startSurface;
      set(x, ground + 1, z, VoxelType.Ore);
      coinSpawns.push({ x: x + 0.5, y: ground + 1.6, z: z + 0.5 });
    }
    const structureResult = placeStructures(types, width, height, depth, surface, { x: centerX + 0.5, y: startSurface + 1.7, z: startZ + 0.5 }, { x: goalX + 0.5, y: goalSurface + 0.9, z: goalZ + 0.5 }, new SeededRandom(hashSeed(this.settings.seed, "structures")));
    const spawn = { x: centerX + 0.5, y: startSurface + 1.7, z: startZ + 0.5 };
    const goal = { x: goalX + 0.5, y: goalSurface + 0.9, z: goalZ + 0.5 };
    const enemySpawns = [10, 17, 24, 31, 38]
      .filter((z) => z < goalZ - 2)
      .map((z, index) => {
        const x = centerX + (index % 2 === 0 ? -2 : 2);
        const localSurface = surface[Math.max(1, Math.min(width - 2, x)) + width * z] || startSurface;
        return { x: x + 0.5, y: localSurface + 1.7, z: z + 0.5 };
      });
    const jigsaw = generateJigsawNetwork(types, width, height, depth, spawn, goal, new SeededRandom(hashSeed(this.settings.seed, "jigsaw")));
    let reachability = checkDigReachability(types, width, height, depth, spawn, goal);
    if (!reachability.reachable) {
      // 異常なシードでも停止しない最後の補修。中央を縦に掘る。
      for (let z = startZ; z <= goalZ; z += 1) for (let y = 7; y <= 11; y += 1) set(centerX, y, z, VoxelType.Empty);
      reachability = checkDigReachability(types, width, height, depth, spawn, goal);
    }
    return {
      width,
      height,
      depth,
      types,
      spawn,
      goal,
      metadata: { generatorVersion: WORLD_GENERATOR_VERSION, seed: this.settings.seed, difficulty: this.settings.difficulty, theme: this.settings.theme, reachability, caves, carverVoxels, trees, boulders, coinSpawns, enemySpawns, landmarks: structureResult.landmarks, structures: structureResult.structures, jigsawPieces: jigsaw.pieces },
    };
  }
}
