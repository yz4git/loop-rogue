export type AttackKind = "punch" | "air-punch" | "ground-pound";

export interface AttackRequest {
  kind: AttackKind;
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  timestamp: number;
}

export interface DestructionRequest {
  origin: { x: number; y: number; z: number };
  radius: number;
  damage: number;
  maxVoxels: number;
  minVoxelY?: number;
}

export interface AttackResult {
  hit: boolean;
  destroyedVoxels: number;
  damagedEnemies: number;
  bedrockHit: boolean;
}
