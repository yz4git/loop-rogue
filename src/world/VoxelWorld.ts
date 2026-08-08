import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import { VOXEL_DEFINITIONS, VoxelType } from "./VoxelDefinitions";
import { HandcraftedStageSource } from "../stages/HandcraftedStageSource";
import type { StageMetadata, StagePoint, StageSource } from "../stages/StageSource";
import { VoxelStorage } from "./VoxelStorage";

type Chunk = {
  key: string;
  cx: number;
  cy: number;
  cz: number;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  queued: boolean;
};

const FACE_DIRS = [
  { normal: [1, 0, 0], neighbor: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { normal: [-1, 0, 0], neighbor: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { normal: [0, 1, 0], neighbor: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { normal: [0, -1, 0], neighbor: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 0, 1], neighbor: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { normal: [0, 0, -1], neighbor: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
] as const;

export interface DestroyResult {
  hit: THREE.Vector3 | null;
  damaged: number;
  destroyed: number;
  oreDestroyed: number;
  orePoints: THREE.Vector3[];
  bedrockHit: boolean;
  dirtyChunks: number;
}

export class VoxelWorld {
  readonly group = new THREE.Group();
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly chunkSize = GAME_CONFIG.world.chunkSize;
  readonly spawnPoint: StagePoint;
  readonly goalPoint: StagePoint;
  readonly metadata?: StageMetadata;
  private readonly source: StageSource;
  readonly storage: VoxelStorage;
  private readonly chunks = new Map<string, Chunk>();
  private readonly rebuildQueue: Chunk[] = [];
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly collisionProbe = new THREE.Vector3();

  constructor(source: StageSource = new HandcraftedStageSource()) {
    this.source = source;
    this.group.name = "voxel-world";
    const snapshot = source.generate();
    this.width = snapshot.width;
    this.height = snapshot.height;
    this.depth = snapshot.depth;
    this.storage = new VoxelStorage(this.width, this.height, this.depth);
    this.storage.types.set(snapshot.types);
    this.spawnPoint = { ...snapshot.spawn };
    this.goalPoint = { ...snapshot.goal };
    this.metadata = snapshot.metadata;
    this.rebuildHealth();
    this.createChunks();
    for (const chunk of this.chunks.values()) this.enqueue(chunk);
  }

  private index(x: number, y: number, z: number): number {
    return this.storage.index(x, y, z);
  }

  private inBounds(x: number, y: number, z: number): boolean {
    return this.storage.inBounds(x, y, z);
  }

  getType(x: number, y: number, z: number): VoxelType {
    return this.inBounds(x, y, z) ? this.storage.get(x, y, z) as VoxelType : VoxelType.Bedrock;
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return this.getType(x, y, z) !== VoxelType.Empty;
  }

  collidesAabb(center: THREE.Vector3, halfWidth: number, bodyHeight: number): boolean {
    // 面に触れているだけの隣接セルを衝突扱いしない。
    const epsilon = 0.0001;
    const minX = Math.floor(center.x - halfWidth + epsilon);
    const maxX = Math.floor(center.x + halfWidth - epsilon);
    const minY = Math.floor(center.y - bodyHeight * 0.5 + epsilon);
    const maxY = Math.floor(center.y + bodyHeight * 0.5 - epsilon);
    const minZ = Math.floor(center.z - halfWidth + epsilon);
    const maxZ = Math.floor(center.z + halfWidth - epsilon);
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (this.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  /** 足裏が実際に重なるセルだけを調べ、立てる最も高い上面を返す。 */
  findSupportY(
    footPosition: THREE.Vector3,
    halfWidth: number,
    bodyHeight: number,
    maxDrop: number,
    maxRise = 0.02,
  ): number | null {
    const epsilon = 0.0001;
    const minX = Math.floor(footPosition.x - halfWidth + epsilon);
    const maxX = Math.floor(footPosition.x + halfWidth - epsilon);
    const minZ = Math.floor(footPosition.z - halfWidth + epsilon);
    const maxZ = Math.floor(footPosition.z + halfWidth - epsilon);
    const highestSurface = footPosition.y + maxRise;
    const lowestSurface = footPosition.y - maxDrop;
    const highestVoxelY = Math.min(this.height - 1, Math.floor(highestSurface - epsilon));
    const lowestVoxelY = Math.max(0, Math.floor(lowestSurface - 1));

    for (let y = highestVoxelY; y >= lowestVoxelY; y -= 1) {
      const surfaceY = y + 1;
      if (surfaceY > highestSurface + epsilon || surfaceY < lowestSurface - epsilon) continue;
      let hasFloor = false;
      for (let z = minZ; z <= maxZ && !hasFloor; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (this.isSolidAt(x, y, z)) {
            hasFloor = true;
            break;
          }
        }
      }
      if (!hasFloor) continue;
      this.collisionProbe.set(footPosition.x, surfaceY + bodyHeight * 0.5, footPosition.z);
      if (!this.collidesAabb(this.collisionProbe, halfWidth, bodyHeight)) return surfaceY;
    }
    return null;
  }

  private rebuildHealth(): void {
    this.storage.health.fill(0);
    for (let index = 0; index < this.storage.types.length; index += 1) {
      this.storage.health[index] = VOXEL_DEFINITIONS[this.storage.types[index] as VoxelType].maxHealth;
    }
  }

  private createChunks(): void {
    for (let cz = 0; cz < Math.ceil(this.depth / this.chunkSize); cz += 1) {
      for (let cy = 0; cy < Math.ceil(this.height / this.chunkSize); cy += 1) {
        for (let cx = 0; cx < Math.ceil(this.width / this.chunkSize); cx += 1) {
          const key = `${cx},${cy},${cz}`;
          const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
          mesh.name = `voxel-chunk-${key}`;
          mesh.userData.chunkKey = key;
          this.group.add(mesh);
          this.chunks.set(key, { key, cx, cy, cz, mesh, queued: false });
        }
      }
    }
  }

  private enqueue(chunk: Chunk | undefined): void {
    if (!chunk || chunk.queued) return;
    chunk.queued = true;
    this.rebuildQueue.push(chunk);
  }

  private chunkAt(x: number, y: number, z: number): Chunk | undefined {
    return this.chunks.get(`${Math.floor(x / this.chunkSize)},${Math.floor(y / this.chunkSize)},${Math.floor(z / this.chunkSize)}`);
  }

  private markDirty(x: number, y: number, z: number): void {
    this.enqueue(this.chunkAt(x, y, z));
    for (const dir of FACE_DIRS) this.enqueue(this.chunkAt(x + dir.neighbor[0], y + dir.neighbor[1], z + dir.neighbor[2]));
  }

  processRebuildQueue(limit = GAME_CONFIG.rendering.rebuildsPerFrame): number {
    let rebuilt = 0;
    while (rebuilt < limit && this.rebuildQueue.length > 0) {
      const chunk = this.rebuildQueue.shift();
      if (!chunk) break;
      chunk.queued = false;
      this.rebuildChunk(chunk);
      rebuilt += 1;
    }
    return rebuilt;
  }

  get pendingRebuilds(): number { return this.rebuildQueue.length; }
  get chunkCount(): number { return this.chunks.size; }

  private rebuildChunk(chunk: Chunk): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let vertex = 0;
    const startX = chunk.cx * this.chunkSize;
    const startY = chunk.cy * this.chunkSize;
    const startZ = chunk.cz * this.chunkSize;
    for (let z = startZ; z < Math.min(startZ + this.chunkSize, this.depth); z += 1) {
      for (let y = startY; y < Math.min(startY + this.chunkSize, this.height); y += 1) {
        for (let x = startX; x < Math.min(startX + this.chunkSize, this.width); x += 1) {
          const type = this.getType(x, y, z);
          if (type === VoxelType.Empty) continue;
          const color = VOXEL_DEFINITIONS[type].color;
          for (const face of FACE_DIRS) {
            const neighbor = this.getType(x + face.neighbor[0], y + face.neighbor[1], z + face.neighbor[2]);
            if (neighbor !== VoxelType.Empty) continue;
            for (const corner of face.corners) {
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              normals.push(face.normal[0], face.normal[1], face.normal[2]);
              colors.push(color.r, color.g, color.b);
            }
            indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
            vertex += 4;
          }
        }
      }
    }
    const geometry = chunk.mesh.geometry;
    geometry.dispose();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
  }

  raycast(raycaster: THREE.Raycaster): THREE.Intersection<THREE.Object3D>[] {
    return raycaster.intersectObjects(this.group.children, false);
  }

  destroySphere(hit: THREE.Vector3, radius = GAME_CONFIG.destruction.punchRadius, maxVoxels = GAME_CONFIG.destruction.maxPunchVoxels): DestroyResult {
    const damagedAt = hit.clone();
    const minX = Math.max(0, Math.floor(hit.x - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(hit.x + radius));
    const minY = Math.max(0, Math.floor(hit.y - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(hit.y + radius));
    const minZ = Math.max(0, Math.floor(hit.z - radius));
    const maxZ = Math.min(this.depth - 1, Math.ceil(hit.z + radius));
    const candidates: Array<{ x: number; y: number; z: number; distance: number; type: VoxelType }> = [];
    let bedrockHit = false;
    for (let z = minZ; z <= maxZ; z += 1) for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      const type = this.getType(x, y, z);
      const dx = x + 0.5 - hit.x;
      const dy = y + 0.5 - hit.y;
      const dz = z + 0.5 - hit.z;
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance > radius * radius) continue;
      if (type === VoxelType.Bedrock) bedrockHit = true;
      else if (type !== VoxelType.Empty) candidates.push({ x, y, z, distance, type });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    let damaged = 0;
    let destroyed = 0;
    let oreDestroyed = 0;
    const orePoints: THREE.Vector3[] = [];
    for (const candidate of candidates.slice(0, maxVoxels)) {
      const index = this.index(candidate.x, candidate.y, candidate.z);
      damaged += 1;
      this.storage.health[index] = Math.max(0, this.storage.health[index] - 1);
      if (this.storage.health[index] === 0) {
        this.storage.types[index] = VoxelType.Empty;
        destroyed += 1;
        if (candidate.type === VoxelType.Ore) {
          oreDestroyed += 1;
          orePoints.push(new THREE.Vector3(candidate.x + 0.5, candidate.y + 0.5, candidate.z + 0.5));
        }
      }
      this.markDirty(candidate.x, candidate.y, candidate.z);
    }
    return { hit: damaged > 0 || bedrockHit ? damagedAt : null, damaged, destroyed, oreDestroyed, orePoints, bedrockHit, dirtyChunks: this.rebuildQueue.length };
  }

  reset(): void {
    const snapshot = this.source.generate();
    if (snapshot.width !== this.width || snapshot.height !== this.height || snapshot.depth !== this.depth) return;
    this.storage.types.set(snapshot.types);
    this.rebuildHealth();
    for (const chunk of this.chunks.values()) this.enqueue(chunk);
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) chunk.mesh.geometry.dispose();
    this.material.dispose();
  }
}
