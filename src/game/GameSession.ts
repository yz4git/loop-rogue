export type GameState = "loading" | "playing" | "paused" | "cleared" | "gameover";

export interface SessionSnapshot {
  state: GameState;
  hp: number;
  maxHp: number;
  coins: number;
  score: number;
  combo: number;
  destroyed: number;
  enemiesDefeated: number;
  elapsedSeconds: number;
}

export class GameSession {
  private snapshot: SessionSnapshot;
  private comboExpiresAt = 0;

  constructor(private readonly configuredMaxHp: number) {
    this.snapshot = this.createInitialSnapshot();
  }

  get state(): Readonly<SessionSnapshot> {
    return this.snapshot;
  }

  reset(): void {
    this.snapshot = this.createInitialSnapshot();
    this.comboExpiresAt = 0;
  }

  update(delta: number): void {
    if (this.snapshot.state === "playing") {
      this.snapshot.elapsedSeconds += Math.max(0, delta);
    }
  }

  damage(amount: number): boolean {
    this.snapshot.hp = Math.max(0, this.snapshot.hp - Math.max(0, amount));
    if (this.snapshot.hp === 0) this.snapshot.state = "gameover";
    return this.snapshot.state === "gameover";
  }

  addCoin(amount = 1): void {
    this.snapshot.coins += Math.max(0, amount);
  }

  collectCoin(amount: number): string {
    this.addCoin(amount);
    return `コイン取得 · ${this.snapshot.coins}G`;
  }

  recordDestruction(voxels: number, score: number): void {
    this.snapshot.destroyed += Math.max(0, voxels);
    this.snapshot.score += Math.max(0, score);
  }

  recordDestructionReward(destroyed: number, oreDestroyed: number, now: number): string {
    if (destroyed <= 0 && oreDestroyed <= 0) return "";
    this.snapshot.destroyed += Math.max(0, destroyed);
    this.advanceCombo(now);
    const bonus = Math.max(0, this.snapshot.combo - 1) * 5;
    this.snapshot.coins += Math.max(0, oreDestroyed) * 25 + bonus;
    this.snapshot.score += Math.max(0, destroyed) + Math.max(0, oreDestroyed) * 25 + bonus;
    return this.comboMessage(bonus);
  }

  recordEnemyDefeat(now: number): string {
    this.snapshot.enemiesDefeated += 1;
    this.advanceCombo(now);
    const bonus = Math.max(0, this.snapshot.combo - 1) * 5;
    this.snapshot.coins += bonus;
    this.snapshot.score += 100 + bonus;
    return this.comboMessage(bonus);
  }

  clear(): void {
    if (this.snapshot.state === "playing") this.snapshot.state = "cleared";
  }

  private advanceCombo(now: number): void {
    this.snapshot.combo = now <= this.comboExpiresAt ? this.snapshot.combo + 1 : 1;
    this.comboExpiresAt = now + 1600;
  }

  private comboMessage(bonus: number): string {
    return this.snapshot.combo >= 2
      ? ` · COMBO x${this.snapshot.combo}${bonus > 0 ? ` +${bonus}G` : ""}`
      : "";
  }

  private createInitialSnapshot(): SessionSnapshot {
    return {
      state: "playing",
      hp: this.configuredMaxHp,
      maxHp: this.configuredMaxHp,
      coins: 0,
      score: 0,
      combo: 0,
      destroyed: 0,
      enemiesDefeated: 0,
      elapsedSeconds: 0,
    };
  }
}
