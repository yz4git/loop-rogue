import type { GameSession } from "../game/GameSession";

export class RewardSystem {
  constructor(private readonly session: GameSession) {}

  get coins(): number {
    return this.session.state.coins;
  }

  get combo(): number {
    return this.session.state.combo;
  }

  reset(): void {
    // ステージリセット時の全進行はGameSession.reset()が担当する。
  }

  recordDestruction(destroyed: number, oreDestroyed: number, now: number): string {
    return this.session.recordDestructionReward(destroyed, oreDestroyed, now);
  }

  recordEnemyDefeat(now: number): string {
    return this.session.recordEnemyDefeat(now);
  }

  collectCoin(value: number): string {
    return this.session.collectCoin(value);
  }
}
