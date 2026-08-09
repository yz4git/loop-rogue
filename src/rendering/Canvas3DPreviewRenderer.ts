import * as THREE from "three";
import { VOXEL_DEFINITIONS, VoxelType } from "../world/VoxelDefinitions";
import type { VoxelWorld } from "../world/VoxelWorld";

export interface CanvasPreviewEntity {
  mesh: THREE.Object3D;
  visible?: boolean;
  active?: boolean;
}

export interface Canvas3DPreviewState {
  world: VoxelWorld;
  camera: THREE.PerspectiveCamera;
  player: THREE.Object3D;
  enemies: readonly CanvasPreviewEntity[];
  coins: readonly CanvasPreviewEntity[];
  goal: THREE.Object3D;
  attackAnimationUntil?: number;
  groundPoundActive?: boolean;
}

export interface CanvasProjectedPoint {
  x: number;
  y: number;
  depth: number;
}

export type CanvasFaceNormal = readonly [number, number, number];

export interface CanvasPreviewFace {
  points: number[];
  depth: number;
  color: string;
}

export interface CanvasOcclusionWorld {
  isSolidAt(x: number, y: number, z: number): boolean;
}

export function projectWorldPoint(
  point: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  forward: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  width: number,
  height: number,
  fov: number,
  output: CanvasProjectedPoint = { x: 0, y: 0, depth: 0 },
): CanvasProjectedPoint | null {
  const relativeX = point.x - cameraPosition.x;
  const relativeY = point.y - cameraPosition.y;
  const relativeZ = point.z - cameraPosition.z;
  const depth = relativeX * forward.x + relativeY * forward.y + relativeZ * forward.z;
  if (depth <= 0.2) return null;
  const focal = (height * 0.5) / Math.tan(THREE.MathUtils.degToRad(fov) * 0.5);
  output.x = width * 0.5 + ((relativeX * right.x + relativeY * right.y + relativeZ * right.z) * focal) / depth;
  output.y = height * 0.5 - ((relativeX * up.x + relativeY * up.y + relativeZ * up.z) * focal) / depth;
  output.depth = depth;
  return output.x > -width * 0.35 && output.x < width * 1.35
    && output.y > -height * 0.35 && output.y < height * 1.35
    ? output
    : null;
}

export function isFaceFacingCamera(
  normal: CanvasFaceNormal,
  faceCenter: THREE.Vector3,
  cameraPosition: THREE.Vector3,
): boolean {
  const toCameraX = cameraPosition.x - faceCenter.x;
  const toCameraY = cameraPosition.y - faceCenter.y;
  const toCameraZ = cameraPosition.z - faceCenter.z;
  return normal[0] * toCameraX + normal[1] * toCameraY + normal[2] * toCameraZ > 0.0001;
}

export function isEntityOccluded(
  world: CanvasOcclusionWorld,
  cameraPosition: THREE.Vector3,
  entityPosition: THREE.Vector3,
  sampleStep = 0.45,
): boolean {
  const deltaX = entityPosition.x - cameraPosition.x;
  const deltaY = entityPosition.y - cameraPosition.y;
  const deltaZ = entityPosition.z - cameraPosition.z;
  const distance = Math.hypot(deltaX, deltaY, deltaZ);
  const steps = Math.min(48, Math.ceil(distance / Math.max(0.25, sampleStep)));
  for (let index = 1; index < steps; index += 1) {
    const amount = index / steps;
    const x = Math.floor(cameraPosition.x + deltaX * amount);
    const y = Math.floor(cameraPosition.y + deltaY * amount);
    const z = Math.floor(cameraPosition.z + deltaZ * amount);
    if (world.isSolidAt(x, y, z)) return true;
  }
  return false;
}

export function sortActiveFaces(
  faces: readonly CanvasPreviewFace[],
  faceCount: number,
  output: CanvasPreviewFace[],
): number {
  const activeCount = Math.max(0, Math.min(faceCount, faces.length));
  for (let index = 0; index < activeCount; index += 1) output[index] = faces[index];
  output.length = activeCount;
  output.sort((left, right) => right.depth - left.depth);
  return activeCount;
}

const FACE_DEFINITIONS = [
  { normal: [1, 0, 0], neighbor: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.92 },
  { normal: [-1, 0, 0], neighbor: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.84 },
  { normal: [0, 1, 0], neighbor: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.16 },
  { normal: [0, -1, 0], neighbor: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.62 },
  { normal: [0, 0, 1], neighbor: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 1.0 },
  { normal: [0, 0, -1], neighbor: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.78 },
] as const;

const EMPTY = VoxelType.Empty;

/**
 * WebGLが無いクラウドプレビュー用の軽量描画器。
 * ゲーム状態は一切持たず、毎フレームVoxelWorldと実体の位置だけを投影する。
 */
export class Canvas3DPreviewRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly forward = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly relative = new THREE.Vector3();
  private readonly pointScratch: ProjectedPoint[] = [
    { x: 0, y: 0, depth: 0 },
    { x: 0, y: 0, depth: 0 },
    { x: 0, y: 0, depth: 0 },
    { x: 0, y: 0, depth: 0 },
  ];
  private readonly baseProjection: ProjectedPoint = { x: 0, y: 0, depth: 0 };
  private readonly topProjection: ProjectedPoint = { x: 0, y: 0, depth: 0 };
  private readonly entityProjection: ProjectedPoint = { x: 0, y: 0, depth: 0 };
  private readonly entityTopProjection: ProjectedPoint = { x: 0, y: 0, depth: 0 };
  private readonly headingPoint = new THREE.Vector3();
  private readonly faceCenterScratch = new THREE.Vector3();
  private readonly faces: CanvasPreviewFace[] = [];
  private readonly activeFaces: CanvasPreviewFace[] = [];
  private readonly colors = new Map<string, string>();
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private faceCount = 0;
  private lastCssWidth = 0;
  private lastCssHeight = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getState: () => Canvas3DPreviewState,
    private readonly renderDistance = 12,
  ) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
    canvas.className = "voxel-canvas canvas-3d-preview";
    canvas.setAttribute("aria-label", "共有ゲーム状態のCanvas 3Dプレビュー");
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
    this.resize();
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const cssWidth = Math.max(1, Math.floor(this.canvas.clientWidth || parent?.clientWidth || window.innerWidth));
    const cssHeight = Math.max(1, Math.floor(this.canvas.clientHeight || parent?.clientHeight || window.innerHeight));
    if (cssWidth === this.lastCssWidth && cssHeight === this.lastCssHeight) return;
    this.lastCssWidth = cssWidth;
    this.lastCssHeight = cssHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    this.width = Math.max(1, Math.floor(cssWidth * this.pixelRatio));
    this.height = Math.max(1, Math.floor(cssHeight * this.pixelRatio));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
  }

  render(now = performance.now()): void {
    this.resize();
    const state = this.getState();
    const camera = state.camera;
    const context = this.context;
    context.fillStyle = "#081421";
    context.fillRect(0, 0, this.width, this.height);
    this.prepareCamera(camera);
    this.faceCount = 0;
    this.drawVoxelFaces(state.world, state.player.position);
    const activeFaceCount = sortActiveFaces(this.faces, this.faceCount, this.activeFaces);
    for (let index = 0; index < activeFaceCount; index += 1) this.drawFace(this.activeFaces[index]);

    if (!isEntityOccluded(state.world, camera.position, state.goal.position)) this.drawGoal(state.goal);
    for (const coin of state.coins) {
      if (coin.visible === false || coin.active === false || !coin.mesh.visible) continue;
      if (isEntityOccluded(state.world, camera.position, coin.mesh.position)) continue;
      this.drawCoin(coin.mesh.position);
    }
    for (const enemy of state.enemies) {
      if (enemy.visible === false || !enemy.mesh.visible) continue;
      if (isEntityOccluded(state.world, camera.position, enemy.mesh.position)) continue;
      this.drawEnemy(enemy.mesh.position);
    }
    this.drawPlayer(state.player, state.groundPoundActive === true);
    this.drawOverlay(state, now);
  }

  private prepareCamera(camera: THREE.PerspectiveCamera): void {
    this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    this.right.crossVectors(this.forward, this.up).normalize();
  }

  private focalLength(camera: THREE.PerspectiveCamera): number {
    return (this.height * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  }

  private project(point: THREE.Vector3, output: CanvasProjectedPoint, camera: THREE.PerspectiveCamera): boolean {
    return projectWorldPoint(
      point,
      camera.position,
      this.forward,
      this.right,
      this.up,
      this.width,
      this.height,
      camera.fov,
      output,
    ) !== null;
  }

  private drawVoxelFaces(world: VoxelWorld, playerPosition: THREE.Vector3): void {
    const centerX = Math.floor(playerPosition.x);
    const centerY = Math.floor(playerPosition.y);
    const centerZ = Math.floor(playerPosition.z);
    const minX = Math.max(0, centerX - this.renderDistance);
    const maxX = Math.min(world.width - 1, centerX + this.renderDistance);
    const minZ = Math.max(0, centerZ - this.renderDistance);
    const maxZ = Math.min(world.depth - 1, centerZ + this.renderDistance);
    const minY = Math.max(0, centerY - 7);
    const maxY = Math.min(world.height - 1, centerY + 9);
    const radiusSq = this.renderDistance * this.renderDistance;
    const camera = this.getState().camera;

    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dx = x + 0.5 - playerPosition.x;
          const dy = y + 0.5 - playerPosition.y;
          const dz = z + 0.5 - playerPosition.z;
          if (dx * dx + dz * dz + dy * dy * 0.25 > radiusSq) continue;
          const type = world.getType(x, y, z);
          if (type === EMPTY) continue;
          for (const face of FACE_DEFINITIONS) {
            if (this.faceCount >= 1800) return;
            if (world.getType(x + face.neighbor[0], y + face.neighbor[1], z + face.neighbor[2]) !== EMPTY) continue;
            this.faceCenterScratch.set(
              x + 0.5 + face.normal[0] * 0.5,
              y + 0.5 + face.normal[1] * 0.5,
              z + 0.5 + face.normal[2] * 0.5,
            );
            if (!isFaceFacingCamera(face.normal, this.faceCenterScratch, camera.position)) continue;
            const record = this.faces[this.faceCount] ?? this.createFace();
            let depth = 0;
            let visible = true;
            for (let cornerIndex = 0; cornerIndex < 4; cornerIndex += 1) {
              const corner = face.corners[cornerIndex];
              const point = this.pointScratch[cornerIndex];
              this.headingPoint.set(x + corner[0], y + corner[1], z + corner[2]);
              if (!this.project(this.headingPoint, point, camera)) visible = false;
              record.points[cornerIndex * 2] = point.x;
              record.points[cornerIndex * 2 + 1] = point.y;
              depth += point.depth;
            }
            if (!visible) continue;
            record.depth = depth * 0.25;
            record.color = this.colorFor(type, face.shade);
            this.faceCount += 1;
          }
        }
      }
    }
  }

  private createFace(): CanvasPreviewFace {
    const record: CanvasPreviewFace = { points: [0, 0, 0, 0, 0, 0, 0, 0], depth: Number.NEGATIVE_INFINITY, color: "#000" };
    this.faces.push(record);
    return record;
  }

  private drawFace(face: CanvasPreviewFace): void {
    const context = this.context;
    context.beginPath();
    context.moveTo(face.points[0], face.points[1]);
    context.lineTo(face.points[2], face.points[3]);
    context.lineTo(face.points[4], face.points[5]);
    context.lineTo(face.points[6], face.points[7]);
    context.closePath();
    context.fillStyle = face.color;
    context.fill();
    context.strokeStyle = "rgba(6, 14, 25, .2)";
    context.lineWidth = this.pixelRatio;
    context.stroke();
  }

  private colorFor(type: VoxelType, shade: number): string {
    const shadeKey = Math.round(shade * 100);
    const key = `${type}:${shadeKey}`;
    const cached = this.colors.get(key);
    if (cached) return cached;
    const hex = VOXEL_DEFINITIONS[type].color.getHex();
    const red = Math.min(255, Math.round(((hex >> 16) & 0xff) * shade));
    const green = Math.min(255, Math.round(((hex >> 8) & 0xff) * shade));
    const blue = Math.min(255, Math.round((hex & 0xff) * shade));
    const color = `rgb(${red}, ${green}, ${blue})`;
    this.colors.set(key, color);
    return color;
  }

  private drawPlayer(player: THREE.Object3D, groundPoundActive: boolean): void {
    if (!this.project(player.position, this.baseProjection, this.getState().camera)) return;
    this.headingPoint.set(player.position.x, player.position.y + 1.65, player.position.z);
    const camera = this.getState().camera;
    if (!this.project(this.headingPoint, this.topProjection, camera)) return;
    const context = this.context;
    const projectedHeight = Math.abs(this.topProjection.y - this.baseProjection.y);
    const bodyHeight = Math.max(18, Math.min(150, projectedHeight));
    const visualTopY = this.baseProjection.y - bodyHeight;
    const bodyWidth = Math.max(8, Math.min(72, bodyHeight * 0.28));
    context.fillStyle = "rgba(0, 0, 0, .28)";
    context.beginPath();
    context.ellipse(this.baseProjection.x, this.baseProjection.y + 2 * this.pixelRatio, bodyWidth * 0.9, bodyWidth * 0.28, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = groundPoundActive ? "#ffe28a" : "#f0a35b";
    context.fillRect(this.baseProjection.x - bodyWidth * 0.5, visualTopY + bodyWidth * 0.45, bodyWidth, Math.max(10, bodyHeight - bodyWidth * 0.45));
    context.fillStyle = "#68e2d1";
    context.beginPath();
    context.arc(this.topProjection.x, visualTopY + bodyWidth * 0.25, bodyWidth * 0.56, 0, Math.PI * 2);
    context.fill();
    const heading = player.rotation.y;
    this.headingPoint.set(player.position.x + Math.sin(heading) * 0.8, player.position.y + 0.85, player.position.z + Math.cos(heading) * 0.8);
    if (this.project(this.headingPoint, this.entityProjection, camera)) {
      context.strokeStyle = "#eaffff";
      context.lineWidth = Math.max(1, this.pixelRatio * 1.5);
      context.beginPath();
      context.moveTo(this.topProjection.x, visualTopY + bodyWidth);
      context.lineTo(this.entityProjection.x, this.entityProjection.y);
      context.stroke();
    }
  }

  private drawEnemy(position: THREE.Vector3): void {
    const camera = this.getState().camera;
    this.headingPoint.set(position.x, position.y + 0.95, position.z);
    if (!this.project(this.headingPoint, this.entityTopProjection, camera)) return;
    this.headingPoint.set(position.x, position.y, position.z);
    if (!this.project(this.headingPoint, this.entityProjection, camera)) return;
    const size = Math.max(6, Math.min(32, Math.abs(this.entityProjection.y - this.entityTopProjection.y) * 0.72));
    const context = this.context;
    context.fillStyle = "#c95d72";
    context.beginPath();
    context.moveTo(this.entityTopProjection.x, this.entityTopProjection.y - size * 0.2);
    context.lineTo(this.entityTopProjection.x + size * 0.58, this.entityProjection.y - size * 0.28);
    context.lineTo(this.entityTopProjection.x, this.entityProjection.y + size * 0.2);
    context.lineTo(this.entityTopProjection.x - size * 0.58, this.entityProjection.y - size * 0.28);
    context.closePath();
    context.fill();
  }

  private drawCoin(position: THREE.Vector3): void {
    const camera = this.getState().camera;
    if (!this.project(position, this.entityProjection, camera)) return;
    const radius = Math.max(4, Math.min(14, 10 * this.focalLength(camera) / this.entityProjection.depth / 8));
    const context = this.context;
    context.fillStyle = "#ffd166";
    context.strokeStyle = "#fff1aa";
    context.lineWidth = this.pixelRatio;
    context.beginPath();
    context.arc(this.entityProjection.x, this.entityProjection.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  private drawGoal(goal: THREE.Object3D): void {
    const camera = this.getState().camera;
    if (!this.project(goal.position, this.entityProjection, camera)) return;
    const size = Math.max(8, Math.min(22, 14 * this.focalLength(camera) / this.entityProjection.depth / 8));
    const context = this.context;
    context.strokeStyle = "#75e3d6";
    context.lineWidth = Math.max(2, this.pixelRatio * 1.5);
    context.beginPath();
    context.moveTo(this.entityProjection.x, this.entityProjection.y - size);
    context.lineTo(this.entityProjection.x + size, this.entityProjection.y);
    context.lineTo(this.entityProjection.x, this.entityProjection.y + size);
    context.lineTo(this.entityProjection.x - size, this.entityProjection.y);
    context.closePath();
    context.stroke();
  }

  private drawOverlay(state: Canvas3DPreviewState, now: number): void {
    const context = this.context;
    const scale = this.pixelRatio;
    context.fillStyle = "rgba(218, 248, 255, .72)";
    context.font = `${Math.max(10, Math.round(11 * scale))}px monospace`;
    context.fillText("CANVAS 3D PREVIEW", 12 * scale, 38 * scale);
    if (state.attackAnimationUntil && state.attackAnimationUntil > now) {
      const alpha = Math.min(0.4, (state.attackAnimationUntil - now) / 180);
      context.fillStyle = `rgba(255, 222, 138, ${alpha})`;
      context.fillRect(0, 0, this.width, this.height);
    }
  }
}
