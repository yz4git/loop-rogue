export type EnemyBehaviorPhase = "approach" | "telegraph" | "attack" | "recover";

export interface EnemyBehaviorState {
  phase: EnemyBehaviorPhase;
  phaseSeconds: number;
  attackCooldown: number;
  lockedYaw: number;
}

export interface EnemyBehaviorProfile {
  telegraphSeconds: number;
  attackSeconds: number;
  recoverSeconds: number;
  attackRange: number;
  preferredRange: number;
  attackSpeedMultiplier: number;
  attackDamage: number;
}

export const ENEMY_BEHAVIOR_PROFILES = {
  chaser: { telegraphSeconds: 0.38, attackSeconds: 0.26, recoverSeconds: 0.48, attackRange: 1.28, preferredRange: 1.05, attackSpeedMultiplier: 3.2, attackDamage: 1 },
  zigzag: { telegraphSeconds: 0.52, attackSeconds: 0.34, recoverSeconds: 0.62, attackRange: 1.42, preferredRange: 1.35, attackSpeedMultiplier: 3.7, attackDamage: 1 },
  burrower: { telegraphSeconds: 0.68, attackSeconds: 0.34, recoverSeconds: 0.82, attackRange: 1.32, preferredRange: 1.2, attackSpeedMultiplier: 2.9, attackDamage: 1 },
  bomber: { telegraphSeconds: 0.78, attackSeconds: 0.18, recoverSeconds: 1.05, attackRange: 2.35, preferredRange: 2.0, attackSpeedMultiplier: 0.5, attackDamage: 2 },
  brute: { telegraphSeconds: 0.88, attackSeconds: 0.30, recoverSeconds: 1.08, attackRange: 1.62, preferredRange: 1.45, attackSpeedMultiplier: 2.4, attackDamage: 2 },
  boss: { telegraphSeconds: 0.70, attackSeconds: 0.42, recoverSeconds: 0.72, attackRange: 2.1, preferredRange: 1.8, attackSpeedMultiplier: 3.0, attackDamage: 2 },
} as const satisfies Record<string, EnemyBehaviorProfile>;

export function createEnemyBehaviorState(offset = 0): EnemyBehaviorState {
  return { phase: "approach", phaseSeconds: 0, attackCooldown: Math.max(0, offset), lockedYaw: 0 };
}

export function phaseProgress(state: EnemyBehaviorState, profile: EnemyBehaviorProfile): number {
  const total = state.phase === "telegraph" ? profile.telegraphSeconds : state.phase === "attack" ? profile.attackSeconds : state.phase === "recover" ? profile.recoverSeconds : 1;
  return Math.max(0, Math.min(1, state.phaseSeconds / Math.max(0.001, total)));
}
