export class RewardSystem {
  private coinTotal = 0;
  private comboCount = 0;
  private comboExpiresAt = 0;

  get coins(): number {
    return this.coinTotal;
  }

  get combo(): number {
    return this.comboCount;
  }

  reset(): void {
    this.coinTotal = 0;
    this.comboCount = 0;
    this.comboExpiresAt = 0;
  }

  recordDestruction(destroyed: number, oreDestroyed: number, now: number): string {
    return this.recordCombo(destroyed, oreDestroyed, now);
  }

  recordEnemyDefeat(now: number): string {
    return this.recordCombo(1, 0, now);
  }

  collectCoin(value: number): string {
    this.coinTotal += value;
    return `コイン取得 · ${this.coinTotal}G`;
  }

  private recordCombo(destroyed: number, oreDestroyed: number, now: number): string {
    if (destroyed <= 0 && oreDestroyed <= 0) return "";
    this.comboCount = now <= this.comboExpiresAt ? this.comboCount + 1 : 1;
    this.comboExpiresAt = now + 1600;
    const bonus = Math.max(0, this.comboCount - 1) * 5;
    this.coinTotal += oreDestroyed * 25 + bonus;
    return this.comboCount >= 2
      ? ` · COMBO x${this.comboCount}${bonus > 0 ? ` +${bonus}G` : ""}`
      : "";
  }
}
