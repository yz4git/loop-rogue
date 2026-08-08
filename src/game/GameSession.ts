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
}

export class GameSession {
  private snapshot: SessionSnapshot;

  constructor(maxHp: number) {
    this.snapshot = {
      state: "playing",
      hp: maxHp,
      maxHp,
      coins: 0,
      score: 0,
      combo: 0,
      destroyed: 0,
      enemiesDefeated: 0,
    };
  }

  get state(): Readonly<SessionSnapshot> {
    return this.snapshot;
  }

  damage(amount: number): boolean {
    this.snapshot.hp = Math.max(0, this.snapshot.hp - Math.max(0, amount));
    if (this.snapshot.hp === 0) this.snapshot.state = "gameover";
    return this.snapshot.state === "gameover";
  }

  addCoin(amount = 1): void {
    this.snapshot.coins += Math.max(0, amount);
  }

  recordDestruction(voxels: number, score: number): void {
    this.snapshot.destroyed += Math.max(0, voxels);
    this.snapshot.score += Math.max(0, score);
  }

  clear(): void {
    if (this.snapshot.state === "playing") this.snapshot.state = "cleared";
  }
}
