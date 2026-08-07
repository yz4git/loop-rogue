import { VoxelType } from "../world/VoxelDefinitions";
import { hashSeed, SeededRandom } from "../worldgen/SeededRandom";
import { ValueNoise2D, ridged } from "../worldgen/Noise";
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
    // 暫定ゴールは深部に置く。洞窟と保証ルートはフェーズ2で追加する。
    const goalX = centerX;
    const goalZ = depth - 6;
    const goalSurface = surface[goalX + width * goalZ] || Math.max(8, startSurface - 2);
    for (let z = goalZ - 2; z <= goalZ + 2; z += 1) for (let x = goalX - 2; x <= goalX + 2; x += 1) {
      for (let y = Math.max(2, goalSurface - 1); y < Math.min(height - 1, goalSurface + 3); y += 1) set(x, y, z, VoxelType.Empty);
    }
    return {
      width,
      height,
      depth,
      types,
      spawn: { x: centerX + 0.5, y: startSurface + 1.7, z: startZ + 0.5 },
      goal: { x: goalX + 0.5, y: goalSurface + 0.9, z: goalZ + 0.5 },
    };
  }
}
