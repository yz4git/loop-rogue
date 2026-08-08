import { GAME_CONFIG } from "./Settings";
import type { DemoStats } from "./VoxelDemo";

/** WebGLが使えない環境で、ゲーム進行だけを確認する軽量テスト表示。 */
export class CanvasTestDemo {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly onStats: (stats: DemoStats) => void;
  private readonly keys = new Set<string>();
  private readonly cells = new Uint8Array(32 * 22);
  private animationFrame = 0;
  private lastTime = performance.now();
  private statsTime = 0;
  // 2Dフォールバックでも、x=横・y=高さ・z=奥行きの3軸を使って検証する。
  private player = { x: 16, y: 1, z: 3 };
  private verticalVelocity = 0;
  private grounded = true;
  private enemies = [{ x: 8, y: 5 }, { x: 24, y: 8 }, { x: 18, y: 15 }, { x: 25, y: 18 }];
  private destroyed = 0;
  private coins = 0;
  private lastMessage = "2D 3軸テスト · 移動とJUMPを確認できます";

  constructor(private readonly mount: HTMLElement, onStats: (stats: DemoStats) => void) {
    this.onStats = onStats;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "voxel-canvas canvas-test-renderer";
    this.canvas.setAttribute("aria-label", "WebGL非対応時の2Dテスト表示");
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
    for (let i = 0; i < this.cells.length; i += 1) this.cells[i] = i % 7 === 0 ? 2 : 1;
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    this.canvas.addEventListener("pointerdown", this.doPunch);
    mount.appendChild(this.canvas);
    this.resize();
    this.animate();
  }

  private readonly resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(1, Math.floor(this.mount.clientWidth * ratio));
    this.canvas.height = Math.max(1, Math.floor(this.mount.clientHeight * ratio));
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
  };

  private readonly keyDown = (event: KeyboardEvent) => {
    this.keys.add(event.key.toLowerCase());
    if (event.key === " ") this.jump();
  };

  private readonly keyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());

  private readonly doPunch = () => {
    const targetX = Math.round(this.player.x);
    const targetZ = Math.round(this.player.z) + 1;
    const index = targetX + targetZ * 32;
    if (targetX >= 0 && targetX < 32 && targetZ >= 0 && targetZ < 22 && this.cells[index] !== 0) {
      this.cells[index] = 0;
      this.destroyed += 1;
      this.lastMessage = `2Dテスト · 掘削成功 ${this.destroyed}ブロック`;
    } else this.lastMessage = "2Dテスト · そこは空洞です";
  };

  private groundHeightAt(): number {
    const x = Math.round(this.player.x);
    const z = Math.round(this.player.z);
    // 2D検証用に高台を1つ用意し、端から降りる挙動も確認できるようにする。
    return x >= 10 && x <= 22 && z >= 12 && z <= 16 ? 4 : 1;
  }

  private readonly animate = () => {
    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const speed = delta * 5;
    if (this.keys.has("arrowleft") || this.keys.has("a")) this.player.x = Math.max(1, this.player.x - speed);
    if (this.keys.has("arrowright") || this.keys.has("d")) this.player.x = Math.min(30, this.player.x + speed);
    if (this.keys.has("arrowup") || this.keys.has("w")) this.player.z = Math.max(1, this.player.z - speed);
    if (this.keys.has("arrowdown") || this.keys.has("s")) this.player.z = Math.min(20, this.player.z + speed);
    const groundY = this.groundHeightAt();
    this.verticalVelocity = Math.max(
      -GAME_CONFIG.player.maxFallSpeed,
      this.verticalVelocity - GAME_CONFIG.player.gravity * delta,
    );
    this.player.y += this.verticalVelocity * delta;
    if (this.player.y <= groundY) {
      this.player.y = groundY;
      this.verticalVelocity = 0;
      this.grounded = true;
    } else this.grounded = false;
    this.draw();
    this.statsTime += delta;
    if (this.statsTime >= 0.25) {
      this.statsTime = 0;
      this.onStats({ fps: delta > 0 ? Math.round(1 / delta) : 0, frameMs: Math.round(delta * 1000), drawCalls: 1, triangles: 0, chunks: 0, pendingChunks: 0, destroyed: this.destroyed, player: `${this.player.x.toFixed(1)}, ${this.player.y.toFixed(2)}, ${this.player.z.toFixed(1)}`, grounded: this.grounded, velocityY: Math.round(this.verticalVelocity * 100) / 100, hp: GAME_CONFIG.player.maxHp, maxHp: GAME_CONFIG.player.maxHp, enemies: this.enemies.length, enemiesDefeated: 0, coins: this.coins, score: 0, combo: 0, elapsedSeconds: 0, gameState: "playing", status: "playing", lastMessage: this.lastMessage, stageMode: "handcrafted", seed: "—", generatorVersion: 0, generationMs: 0, caves: 0, structures: 0, jigsawPieces: 0, reachabilityCost: 0, biomeCounts: "—" });
    }
    this.animationFrame = window.requestAnimationFrame(this.animate);
  };

  private draw(): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const cell = Math.min(width / 32, height / 22);
    const offsetX = (width - cell * 32) * 0.5;
    const offsetY = (height - cell * 22) * 0.5;
    this.context.fillStyle = "#102235";
    this.context.fillRect(0, 0, width, height);
    for (let y = 0; y < 22; y += 1) for (let x = 0; x < 32; x += 1) {
      const type = this.cells[x + y * 32];
      this.context.fillStyle = type === 0 ? "#182f3d" : type === 2 ? "#657080" : "#9b6545";
      this.context.fillRect(offsetX + x * cell + 1, offsetY + y * cell + 1, cell - 2, cell - 2);
    }
    this.context.fillStyle = "rgba(117, 227, 214, .32)";
    this.context.fillRect(offsetX + 10 * cell, offsetY + 12 * cell, 13 * cell, 5 * cell);
    this.context.fillStyle = "#ff6f61";
    for (const enemy of this.enemies) this.context.fillRect(offsetX + enemy.x * cell + cell * 0.2, offsetY + enemy.y * cell + cell * 0.2, cell * 0.6, cell * 0.6);
    this.context.fillStyle = "#75e3d6";
    const visualZ = this.player.z - this.player.y * 0.18;
    this.context.fillRect(offsetX + this.player.x * cell + cell * 0.15, offsetY + visualZ * cell + cell * 0.15, cell * 0.7, cell * 0.7);
    this.context.fillStyle = "#d9f7ff";
    this.context.font = `${Math.max(10, cell * 0.42)}px monospace`;
    this.context.fillText(`X ${this.player.x.toFixed(1)}  Y ${this.player.y.toFixed(2)}  Z ${this.player.z.toFixed(1)}  VY ${this.verticalVelocity.toFixed(1)}  ${this.grounded ? "GROUND" : "AIR"}`, 14, 42);
    this.context.fillStyle = "#ffd166";
    this.context.beginPath(); this.context.arc(offsetX + 28.5 * cell, offsetY + 18.5 * cell, cell * 0.35, 0, Math.PI * 2); this.context.fill();
    this.context.fillStyle = "#e8f4ff"; this.context.font = `${Math.max(12, cell * 0.7)}px sans-serif`; this.context.fillText("2D 3-AXIS TEST / SPACE: JUMP", 14, 24);
  }

  reset(): void { this.player = { x: 16, y: 1, z: 3 }; this.verticalVelocity = 0; this.grounded = true; this.destroyed = 0; this.statsTime = 0; for (let i = 0; i < this.cells.length; i += 1) this.cells[i] = i % 7 === 0 ? 2 : 1; this.lastMessage = "2D 3軸テスト · 移動とJUMPを確認できます"; }
  setMoveInput(x: number, y: number): void { this.player.x = Math.max(1, Math.min(30, this.player.x + x)); this.player.z = Math.max(1, Math.min(20, this.player.z + y)); }
  punch(): void { this.doPunch(); }
  jump(): void { if (!this.grounded) return; this.verticalVelocity = GAME_CONFIG.player.jumpVelocity; this.grounded = false; this.lastMessage = "2D 3軸テスト · JUMP · Y上昇中"; }
  dispose(): void { window.cancelAnimationFrame(this.animationFrame); window.removeEventListener("resize", this.resize); window.removeEventListener("keydown", this.keyDown); window.removeEventListener("keyup", this.keyUp); this.canvas.removeEventListener("pointerdown", this.doPunch); this.canvas.remove(); }
}
