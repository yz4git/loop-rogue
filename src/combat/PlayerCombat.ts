import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import type { VoxelWorld } from "../world/VoxelWorld";

export interface CombatEnemyTarget {
  mesh: THREE.Mesh;
  hp: number;
}

export interface PlayerCombatCallbacks {
  onEnemyHit: (enemy: CombatEnemyTarget, origin: THREE.Vector3) => void;
  onTerrainHit: (point: THREE.Vector3, now: number) => void;
  onGroundPoundStart: () => void;
  onMessage: (message: string) => void;
  playPunchSound: (hit: boolean) => void;
  playGroundPoundSound: () => void;
}

export class PlayerCombat {
  private punchReadyAt = 0;
  private groundPoundReadyAt = 0;
  private groundPoundActive = false;
  private punchUntil = 0;

  constructor(
    private readonly player: THREE.Group,
    private world: VoxelWorld,
    private readonly raycaster: THREE.Raycaster,
    private readonly enemies: readonly CombatEnemyTarget[],
    private readonly callbacks: PlayerCombatCallbacks,
  ) {}

  get isGroundPoundActive(): boolean {
    return this.groundPoundActive;
  }

  get animationUntil(): number {
    return this.punchUntil;
  }

  setWorld(world: VoxelWorld): void {
    this.world = world;
  }

  reset(): void {
    this.punchReadyAt = 0;
    this.groundPoundReadyAt = 0;
    this.groundPoundActive = false;
    this.punchUntil = 0;
  }

  punch(grounded: boolean): void {
    if (!grounded) {
      this.beginGroundPound();
      return;
    }
    const now = performance.now();
    if (now < this.punchReadyAt) return;
    this.punchReadyAt = now + GAME_CONFIG.destruction.punchCooldown * 1000;
    this.punchUntil = now + 240;
    const direction = new THREE.Vector3(Math.sin(this.player.rotation.y), 0, Math.cos(this.player.rotation.y));
    const origin = this.player.position.clone()
      .add(new THREE.Vector3(0, 0.7, 0))
      .addScaledVector(direction, 0.38);
    this.raycaster.set(origin, direction);
    const wallHit = this.world.raycast(this.raycaster)
      .find((intersection) => intersection.distance <= GAME_CONFIG.destruction.punchRange);
    const enemy = this.findEnemyInFront(direction);
    if (enemy && !wallHit) {
      this.callbacks.onEnemyHit(enemy, origin);
      return;
    }
    const first = this.world.raycast(this.raycaster)
      .find((intersection) => intersection.distance <= GAME_CONFIG.destruction.punchRange);
    if (!first?.point) {
      this.callbacks.onMessage("パンチ空振り · 岩へ近づいてください");
      this.callbacks.playPunchSound(false);
      return;
    }
    this.callbacks.onTerrainHit(first.point, now);
  }

  beginGroundPound(): void {
    const now = performance.now();
    if (this.groundPoundActive || now < this.groundPoundReadyAt) return;
    this.groundPoundActive = true;
    this.punchUntil = now + 260;
    this.callbacks.onGroundPoundStart();
    this.callbacks.onMessage("地面叩き · 着地で広範囲破壊");
    this.callbacks.playGroundPoundSound();
  }

  finishGroundPound(): void {
    this.groundPoundActive = false;
    this.groundPoundReadyAt = performance.now() + GAME_CONFIG.destruction.groundPoundCooldown * 1000;
  }

  private findEnemyInFront(direction: THREE.Vector3): CombatEnemyTarget | null {
    let target: CombatEnemyTarget | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!enemy.mesh.visible) continue;
      const toEnemy = enemy.mesh.position.clone().sub(this.player.position);
      const distance = toEnemy.length();
      const along = direction.dot(toEnemy);
      const lateralSq = Math.max(0, distance * distance - along * along);
      if (along < 0 || along > GAME_CONFIG.destruction.punchRange + 0.6 || lateralSq > 1.25 * 1.25 || distance >= nearest) continue;
      nearest = distance;
      target = enemy;
    }
    return target;
  }
}
