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
  chaser: { telegraphSeconds: 0.50, attackSeconds: 0.34, recoverSeconds: 0.55, attackRange: 2.8, preferredRange: 2.35, attackSpeedMultiplier: 3.5, attackDamage: 1 },
  zigzag: { telegraphSeconds: 0.62, attackSeconds: 0.38, recoverSeconds: 0.68, attackRange: 3.2, preferredRange: 2.65, attackSpeedMultiplier: 4.0, attackDamage: 1 },
  burrower: { telegraphSeconds: 0.78, attackSeconds: 0.38, recoverSeconds: 0.90, attackRange: 2.9, preferredRange: 2.45, attackSpeedMultiplier: 3.2, attackDamage: 1 },
  bomber: { telegraphSeconds: 0.90, attackSeconds: 0.22, recoverSeconds: 1.15, attackRange: 4.6, preferredRange: 3.8, attackSpeedMultiplier: 0.55, attackDamage: 2 },
  brute: { telegraphSeconds: 1.00, attackSeconds: 0.34, recoverSeconds: 1.15, attackRange: 3.2, preferredRange: 2.7, attackSpeedMultiplier: 2.8, attackDamage: 2 },
  boss: { telegraphSeconds: 0.82, attackSeconds: 0.48, recoverSeconds: 0.80, attackRange: 3.6, preferredRange: 3.0, attackSpeedMultiplier: 3.3, attackDamage: 2 },
} as const satisfies Record<string, EnemyBehaviorProfile>;

export function createEnemyBehaviorState(offset = 0): EnemyBehaviorState {
  return { phase: "approach", phaseSeconds: 0, attackCooldown: Math.max(0, offset), lockedYaw: 0 };
}

export function phaseProgress(state: EnemyBehaviorState, profile: EnemyBehaviorProfile): number {
  const total = state.phase === "telegraph" ? profile.telegraphSeconds : state.phase === "attack" ? profile.attackSeconds : state.phase === "recover" ? profile.recoverSeconds : 1;
  return Math.max(0, Math.min(1, state.phaseSeconds / Math.max(0.001, total)));
}
