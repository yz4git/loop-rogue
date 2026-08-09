import * as THREE from "three";
import { GameRuntime } from "./GameRuntime";
import { Canvas3DPreviewRenderer } from "../rendering/Canvas3DPreviewRenderer";
import type { StageSource } from "../stages/StageSource";
import { VoxelWorld } from "../world/VoxelWorld";
import type { GameViewState } from "../ui/GameViewState";

export type CanvasDemoStats = GameViewState;

/**
 * WebGLが使えない環境でも、通常版と同じGameRuntimeを動かす表示コンテナ。
 * このクラスは物理・敵・破壊・生成ルールを実装せず、Canvas描画だけを担当する。
 */
export class Canvas3DPreviewDemo {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  readonly surface: HTMLCanvasElement;
  world: VoxelWorld;

  private readonly mount: HTMLElement;
  private readonly onStats: (stats: CanvasDemoStats) => void;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly player = new THREE.Group();
  private readonly runtime: GameRuntime;
  private readonly previewRenderer: Canvas3DPreviewRenderer;
  private animationFrame = 0;
  private statsTimer = 0;
  private paused = false;
  private lastTime = performance.now();

  constructor(
    mount: HTMLElement,
    onStats: (stats: CanvasDemoStats) => void,
    source?: StageSource,
  ) {
    this.mount = mount;
    this.onStats = onStats;
    this.scene.background = new THREE.Color(0x081421);
    this.world = new VoxelWorld(source);
    this.scene.add(this.world.group);
    this.scene.add(this.player);

    this.runtime = new GameRuntime(
      this.scene,
      this.camera,
      this.player,
      this.raycaster,
      this.world,
      () => undefined,
    );
    this.runtime.initialize();
    this.surface = document.createElement("canvas");
    this.surface.className = "voxel-canvas canvas-3d-preview";
    this.surface.setAttribute("aria-label", "共有ゲーム状態のCanvas 3Dプレビュー");
    mount.appendChild(this.surface);

    this.previewRenderer = new Canvas3DPreviewRenderer(this.surface, () => ({
      world: this.runtime.currentWorld,
      camera: this.runtime.cameraObject,
      player: this.runtime.playerObject,
      enemies: this.runtime.enemyStates,
      coins: this.runtime.coinStates,
      goal: this.runtime.goalObject,
      attackAnimationUntil: this.runtime.attackAnimationUntil,
      groundPoundActive: this.runtime.isGroundPoundActive,
    }));
    this.runtime.attachInput(window, this.surface);
    window.addEventListener("resize", this.resize);
    window.addEventListener("orientationchange", this.resize);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.resize();
    this.animate();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.previewRenderer.resize();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      this.clock.start();
      this.lastTime = performance.now();
      this.resize();
    }
  };

  private readonly animate = (): void => {
    const now = performance.now();
    if (this.paused) {
      this.clock.getDelta();
      this.lastTime = now;
      this.animationFrame = window.requestAnimationFrame(this.animate);
      return;
    }
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const frame = this.runtime.update(delta, now);
    if (frame.shouldRender) this.previewRenderer.render(now);
    this.statsTimer += delta;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      this.onStats(this.runtime.getViewState({ calls: 1, triangles: 0 }, delta > 0 ? Math.round(1 / delta) : 0, Math.round(delta * 1000 * 10) / 10));
    }
    this.lastTime = now;
    this.animationFrame = window.requestAnimationFrame(this.animate);
  };

  setMoveInput(x: number, y: number): void {
    if (!this.paused) this.runtime.setMoveInput(x, y);
  }

  jump(): void {
    if (!this.paused) this.runtime.jump();
  }

  punch(): void {
    if (!this.paused) this.runtime.punch();
  }

  beginPunchHold(): void {
    if (!this.paused) this.runtime.punch();
  }

  endPunchHold(): void {
    // InputManagerの共通PUNCHコマンドを使うため、短押しは開始時に処理する。
  }

  switchStage(source: StageSource): void {
    const previousWorld = this.runtime.switchStage(source);
    this.scene.remove(previousWorld.group);
    previousWorld.dispose();
    this.world = this.runtime.currentWorld;
    this.scene.add(this.world.group);
    this.previewRenderer.resize();
  }

  reset(): void {
    if (!this.paused) this.runtime.reset();
  }

  pause(): void {
    this.paused = true;
    this.runtime.setMoveInput(0, 0);
    this.runtime.detachInput();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.runtime.attachInput(window, this.surface);
    this.clock.getDelta();
    this.lastTime = performance.now();
  }

  isPaused(): boolean {
    return this.paused;
  }

  dispose(): void {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("orientationchange", this.resize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.runtime.dispose();
    this.surface.remove();
  }
}
