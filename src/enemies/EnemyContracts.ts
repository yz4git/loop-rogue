export interface EnemySnapshot {
  id: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  active: boolean;
}

export interface EnemyBehavior {
  update(enemy: EnemySnapshot, target: { x: number; y: number; z: number }, deltaSeconds: number): void;
}

export interface RewardEvent {
  kind: "coin" | "gem" | "combo";
  amount: number;
}
