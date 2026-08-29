import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import type { StagePoint } from "../stages/StageSource";
import type { VoxelWorld } from "../world/VoxelWorld";

export type EnemyType = "chaser" | "zigzag" | "burrower" | "bomber" | "brute" | "boss";

export interface EnemyState {
  mesh: THREE.Mesh;
  hp: number;
  maxHp: number;
  hitCooldown: number;
  terrainCooldown: number;
  phase: number;
  type: EnemyType;
  boss: boolean;
}

export interface EnemyDamageResult {
  enemy: EnemyState;
  hitPoint: THREE.Vector3;
  position: THREE.Vector3;
  defeated: boolean;
  wallSlam: boolean;
  boss: boolean;
  maxHp: number;
}

export interface EnemyManagerCallbacks {
  onPlayerContact: (source: THREE.Vector3, damage?: number) => void;
  onEnemyDamaged: (result: EnemyDamageResult) => void;
  onEnemyTerrainImpact?: (position: THREE.Vector3, radius: number, strength: number) => void;
}

const TYPE_ORDER: readonly EnemyType[] = ["chaser", "zigzag", "burrower", "bomber", "brute"];

export class EnemyManager {
  readonly enemies: EnemyState[] = [];
  private readonly geometry = new THREE.IcosahedronGeometry(0.42, 1);
  private readonly materials: Record<EnemyType, THREE.MeshLambertMaterial> = {
    chaser: new THREE.MeshLambertMaterial({ color: 0xc95d72 }),
    zigzag: new THREE.MeshLambertMaterial({ color: 0xe79b57 }),
    burrower: new THREE.MeshLambertMaterial({ color: 0x7d8fb9 }),
    bomber: new THREE.MeshLambertMaterial({ color: 0xd7ca56 }),
    brute: new THREE.MeshLambertMaterial({ color: 0x9b6bc6 }),
    boss: new THREE.MeshLambertMaterial({ color: 0xff4f66, emissive: 0x4b0710, emissiveIntensity: 0.75 }),
  };
  private readonly direction = new THREE.Vector3();
  private readonly alternate = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();
  private world: VoxelWorld;
  private danger = 1;
  private depthTier = 1;

  constructor(
    private readonly scene: THREE.Scene,
    world: VoxelWorld,
    private readonly callbacks: EnemyManagerCallbacks,
  ) {
    this.world = world;
    for (let index = 0; index < GAME_CONFIG.enemies.maxActive; index += 1) {
      const type = TYPE_ORDER[index % TYPE_ORDER.length];
      const mesh = new THREE.Mesh(this.geometry, this.materials[type]);
      mesh.visible = false;
      mesh.name = `enemy-${index}`;
      this.scene.add(mesh);
      this.enemies.push({
        mesh,
        hp: GAME_CONFIG.enemies.hp,
        maxHp: GAME_CONFIG.enemies.hp,
        hitCooldown: 0,
        terrainCooldown: 0,
        phase: index * 1.7,
        type,
        boss: false,
      });
    }
  }

  setWorld(world: VoxelWorld): void {
    this.world = world;
  }

  setDanger(danger: number, depthTier: number): void {
    this.danger = Math.max(0.7, danger);
    this.depthTier = Math.max(1, Math.floor(depthTier));
  }

  get activeCount(): number {
    let count = 0;
    for (const enemy of this.enemies) if (enemy.mesh.visible) count += 1;
    return count;
  }

  get bossState(): EnemyState | null {
    return this.enemies.find((enemy) => enemy.mesh.visible && enemy.boss) ?? null;
  }

  reset(): void {
    const spawnPoints = this.getSpawnPoints();
    const activeCount = this.getActiveCount();
    for (let index = 0; index < this.enemies.length; index += 1) {
      const enemy = this.enemies[index];
      const type = TYPE_ORDER[index % TYPE_ORDER.length];
      enemy.type = type;
      enemy.boss = false;
      enemy.mesh.material = this.materials[type];
      enemy.mesh.scale.setScalar(type === "brute" ? 1.35 : type === "bomber" ? 0.9 : 1);
      enemy.mesh.position.copy(spawnPoints[index] ?? spawnPoints[index % Math.max(1, spawnPoints.length)] ?? this.fallbackSpawn(index));
      enemy.mesh.visible = index < activeCount;
      enemy.maxHp = this.hpForType(type);
      enemy.hp = enemy.maxHp;
      enemy.hitCooldown = 0;
      enemy.terrainCooldown = index * 0.13;
    }
  }

  spawnBoss(position: THREE.Vector3, tier: number): EnemyState | null {
    const enemy = [...this.enemies].reverse().find((candidate) => !candidate.boss);
    if (!enemy) return null;
    enemy.type = "boss";
    enemy.boss = true;
    enemy.mesh.material = this.materials.boss;
    enemy.mesh.scale.setScalar(2.25);
    enemy.mesh.position.copy(position);
    enemy.mesh.position.y += 0.2;
    enemy.mesh.visible = true;
    enemy.maxHp = 14 + Math.max(1, tier) * 4;
    enemy.hp = enemy.maxHp;
    enemy.hitCooldown = 0.5;
    enemy.terrainCooldown = 0.8;
    return enemy;
  }

  update(delta: number, player: THREE.Group): void {
    for (const enemy of this.enemies) {
      if (!enemy.mesh.visible) continue;
      enemy.hitCooldown = Math.max(0, enemy.hitCooldown - delta);
      enemy.terrainCooldown = Math.max(0, enemy.terrainCooldown - delta);
      const toPlayer = this.direction.copy(player.position).sub(enemy.mesh.position);
      toPlayer.y = 0;
      const distance = toPlayer.length();
      const contactRange = enemy.boss ? 1.45 : enemy.type === "brute" ? 1.08 : GAME_CONFIG.enemies.contactRange;
      if (distance <= contactRange) {
        if (enemy.hitCooldown <= 0) {
          enemy.hitCooldown = enemy.boss ? 0.82 : GAME_CONFIG.enemies.contactCooldown;
          const damage = enemy.boss ? 2 : enemy.type === "brute" ? 2 : 1;
          this.callbacks.onPlayerContact(enemy.mesh.position, damage);
          if ((enemy.boss || enemy.type === "bomber") && enemy.terrainCooldown <= 0) {
            enemy.terrainCooldown = enemy.boss ? 1.35 : 2.4;
            this.callbacks.onEnemyTerrainImpact?.(enemy.mesh.position.clone(), enemy.boss ? 2.25 : 1.35, enemy.boss ? 2 : 1);
          }
        }
        enemy.mesh.rotation.y += delta * (enemy.boss ? 0.8 : 2.2);
        continue;
      }
      if (distance < 0.01) continue;
      toPlayer.normalize();
      const typeSpeed = enemy.type === "brute" ? 0.66 : enemy.type === "burrower" ? 0.82 : enemy.type === "bomber" ? 1.18 : enemy.boss ? 0.74 : 1;
      const amount = GAME_CONFIG.enemies.moveSpeed * this.danger * typeSpeed * delta;
      const next = this.alternate.copy(enemy.mesh.position);
      if (enemy.type === "zigzag" || enemy.type === "bomber") {
        const weave = Math.sin(performance.now() * 0.0034 + enemy.phase) * amount * (enemy.type === "bomber" ? 3.1 : 2.2);
        next.x += -toPlayer.z * weave;
        next.z += toPlayer.x * weave;
      }
      next.addScaledVector(toPlayer, amount);
      if (!this.world.collidesAabb(next, enemy.boss ? 0.68 : 0.32, enemy.boss ? 1.45 : 0.8)) {
        enemy.mesh.position.copy(next);
      } else if ((enemy.type === "burrower" || enemy.type === "brute" || enemy.boss) && enemy.terrainCooldown <= 0) {
        enemy.terrainCooldown = enemy.boss ? 1.1 : enemy.type === "brute" ? 1.8 : 1.25;
        this.probe.copy(enemy.mesh.position).addScaledVector(toPlayer, 0.8);
        this.callbacks.onEnemyTerrainImpact?.(
          this.probe.clone(),
          enemy.boss ? 2.0 : enemy.type === "brute" ? 1.45 : 1.05,
          enemy.boss ? 2 : 1,
        );
      } else {
        const fallback = this.probe.copy(enemy.mesh.position);
        fallback.x -= toPlayer.z * amount;
        fallback.z += toPlayer.x * amount;
        if (!this.world.collidesAabb(fallback, 0.32, 0.8)) enemy.mesh.position.copy(fallback);
      }
      enemy.mesh.rotation.x += delta * (enemy.boss ? 0.65 : 1.4);
      enemy.mesh.rotation.y += delta * (enemy.boss ? 0.9 : 2.2);
    }
  }

  damage(
    target: { mesh: THREE.Mesh; hp: number },
    playerPosition: THREE.Vector3,
    hitPoint: THREE.Vector3,
    amount = 1,
    knockbackMultiplier = 1,
  ): EnemyDamageResult | null {
    const enemy = this.enemies.find((candidate) => candidate.mesh === target.mesh);
    if (!enemy || !enemy.mesh.visible) return null;
    enemy.hp -= Math.max(1, Math.round(amount));
    const knockback = this.direction.copy(enemy.mesh.position).sub(playerPosition);
    knockback.y = 0;
    let wallSlam = false;
    if (knockback.lengthSq() > 0.001) {
      const pushDistance = GAME_CONFIG.enemies.knockback * knockbackMultiplier * (enemy.boss ? 0.34 : enemy.type === "brute" ? 0.62 : 1);
      const pushed = this.alternate.copy(enemy.mesh.position)
        .addScaledVector(knockback.normalize(), pushDistance);
      if (!this.world.collidesAabb(pushed, enemy.boss ? 0.68 : 0.32, enemy.boss ? 1.45 : 0.8)) {
        enemy.mesh.position.copy(pushed);
      } else {
        wallSlam = true;
        enemy.hp -= enemy.boss ? 1 : 2;
        this.callbacks.onEnemyTerrainImpact?.(enemy.mesh.position.clone(), enemy.boss ? 1.8 : 1.25, 1);
      }
    }
    const result: EnemyDamageResult = {
      enemy,
      hitPoint: hitPoint.clone(),
      position: enemy.mesh.position.clone(),
      defeated: enemy.hp <= 0,
      wallSlam,
      boss: enemy.boss,
      maxHp: enemy.maxHp,
    };
    if (result.defeated) enemy.mesh.visible = false;
    this.callbacks.onEnemyDamaged(result);
    return result;
  }

  damageNearby(
    center: THREE.Vector3,
    radius: number,
    playerPosition: THREE.Vector3,
    amount = 1,
    knockbackMultiplier = 1,
  ): EnemyDamageResult[] {
    const results: EnemyDamageResult[] = [];
    const radiusSq = radius * radius;
    for (const enemy of this.enemies) {
      if (!enemy.mesh.visible || enemy.mesh.position.distanceToSquared(center) > radiusSq) continue;
      const result = this.damage(enemy, playerPosition, center, amount, knockbackMultiplier);
      if (result) results.push(result);
    }
    return results;
  }

  private hpForType(type: EnemyType): number {
    const tierBonus = Math.max(0, this.depthTier - 1);
    if (type === "brute") return GAME_CONFIG.enemies.hp + 2 + Math.floor(tierBonus * 0.7);
    if (type === "bomber") return Math.max(2, GAME_CONFIG.enemies.hp - 1 + Math.floor(tierBonus * 0.35));
    if (type === "burrower") return GAME_CONFIG.enemies.hp + Math.floor(tierBonus * 0.5);
    return GAME_CONFIG.enemies.hp + Math.floor(tierBonus * 0.4);
  }

  private getSpawnPoints(): THREE.Vector3[] {
    const generated = this.world.metadata?.enemySpawns;
    if (generated && generated.length > 0) {
      return generated.map((point: StagePoint) => new THREE.Vector3(point.x, point.y, point.z));
    }
    return Array.from({ length: GAME_CONFIG.enemies.maxActive }, (_, index) => this.fallbackSpawn(index));
  }

  private fallbackSpawn(index: number): THREE.Vector3 {
    const spawn = this.world.spawnPoint;
    const maxZ = this.world.depth - 3.5;
    const z = Math.min(maxZ, spawn.z + 6 + index * 4.2);
    const x = spawn.x + (index % 2 === 0 ? -1.4 : 1.4) + ((index % 3) - 1) * 0.6;
    return new THREE.Vector3(x, spawn.y, z);
  }

  private getActiveCount(): number {
    const base = this.world.metadata?.difficulty === "easy" ? 4 : this.world.metadata?.difficulty === "hard" ? 7 : 6;
    return Math.min(base, GAME_CONFIG.enemies.maxActive);
  }

  dispose(): void {
    for (const enemy of this.enemies) this.scene.remove(enemy.mesh);
    this.geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
