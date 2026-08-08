export type GameEvent =
  | { type: "voxelDestroyed"; count: number }
  | { type: "enemyDefeated"; enemyId: number }
  | { type: "playerDamaged"; amount: number }
  | { type: "coinCollected"; amount: number }
  | { type: "goalReached" }
  | { type: "stageCleared" };

export interface GameEventSink {
  emit(event: GameEvent): void;
}
