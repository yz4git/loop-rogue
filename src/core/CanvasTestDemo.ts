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
  private player = { x: 16, y: 3 };
  private enemies = [{ x: 8, y: 5 }, { x: 24, y: 8 }, { x: 18, y: 15 }, { x: 25, y: 18 }];
  private destroyed = 0;
  private coins = 0;
  private lastMessage = "2Dテスト表示 · 矢印/WASDで移動 · SPACEで掘る";

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
    if (event.key === " ") this.doPunch();
  };

  private readonly keyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());

  private readonly doPunch = () => {
    const targetX = Math.round(this.player.x);
    const targetY = Math.round(this.player.y) + 1;
    const index = targetX + targetY * 32;
    if (targetX >= 0 && targetX < 32 && targetY >= 0 && targetY < 22 && this.cells[index] !== 0) {
      this.cells[index] = 0;
      this.destroyed += 1;
      this.lastMessage = `2Dテスト · 掘削成功 ${this.destroyed}ブロック`;
    } else this.lastMessage = "2Dテスト · そこは空洞です";
  };

  private readonly animate = () => {
    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const speed = delta * 5;
    if (this.keys.has("arrowleft") || this.keys.has("a")) this.player.x = Math.max(1, this.player.x - speed);
    if (this.keys.has("arrowright") || this.keys.has("d")) this.player.x = Math.min(30, this.player.x + speed);
    if (this.keys.has("arrowup") || this.keys.has("w")) this.player.y = Math.max(1, this.player.y - speed);
    if (this.keys.has("arrowdown") || this.keys.has("s")) this.player.y = Math.min(20, this.player.y + speed);
    this.draw();
    this.statsTime += delta;
    if (this.statsTime >= 0.25) {
      this.statsTime = 0;
      this.onStats({ fps: delta > 0 ? Math.round(1 / delta) : 0, frameMs: Math.round(delta * 1000), drawCalls: 1, triangles: 0, chunks: 0, pendingChunks: 0, destroyed: this.destroyed, player: `${this.player.x.toFixed(1)}, 0.0, ${this.player.y.toFixed(1)}`, grounded: true, hp: GAME_CONFIG.player.maxHp, maxHp: GAME_CONFIG.player.maxHp, enemies: this.enemies.length, coins: this.coins, status: "playing", lastMessage: this.lastMessage });
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
    this.context.fillStyle = "#ff6f61";
    for (const enemy of this.enemies) this.context.fillRect(offsetX + enemy.x * cell + cell * 0.2, offsetY + enemy.y * cell + cell * 0.2, cell * 0.6, cell * 0.6);
    this.context.fillStyle = "#75e3d6";
    this.context.fillRect(offsetX + this.player.x * cell + cell * 0.15, offsetY + this.player.y * cell + cell * 0.15, cell * 0.7, cell * 0.7);
    this.context.fillStyle = "#ffd166";
    this.context.beginPath(); this.context.arc(offsetX + 28.5 * cell, offsetY + 18.5 * cell, cell * 0.35, 0, Math.PI * 2); this.context.fill();
    this.context.fillStyle = "#e8f4ff"; this.context.font = `${Math.max(12, cell * 0.7)}px sans-serif`; this.context.fillText("2D TEST / SPACE: DIG", 14, 24);
  }

  reset(): void { this.player = { x: 16, y: 3 }; this.destroyed = 0; this.statsTime = 0; for (let i = 0; i < this.cells.length; i += 1) this.cells[i] = i % 7 === 0 ? 2 : 1; this.lastMessage = "2Dテスト表示 · 矢印/WASDで移動 · SPACEで掘る"; }
  setMoveInput(x: number, y: number): void { this.player.x = Math.max(1, Math.min(30, this.player.x + x)); this.player.y = Math.max(1, Math.min(20, this.player.y + y)); }
  punch(): void { this.doPunch(); }
  jump(): void { this.lastMessage = "2Dテスト · JUMP入力を受け付けました"; }
  dispose(): void { window.cancelAnimationFrame(this.animationFrame); window.removeEventListener("resize", this.resize); window.removeEventListener("keydown", this.keyDown); window.removeEventListener("keyup", this.keyUp); this.canvas.removeEventListener("pointerdown", this.doPunch); this.canvas.remove(); }
}
