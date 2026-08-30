import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import type { StagePoint } from "../stages/StageSource";
import type { VoxelWorld } from "../world/VoxelWorld";
import {
  ENEMY_BEHAVIOR_PROFILES,
  createEnemyBehaviorState,
  phaseProgress,
  type EnemyBehaviorState,
} from "./EnemyBehaviorModel";

export type EnemyType = "chaser" | "zigzag" | "burrower" | "bomber" | "brute" | "boss";

export interface EnemyState {
  mesh: THREE.Mesh;
  telegraph: THREE.Mesh;
  hp: number;
  maxHp: number;
  hitCooldown: number;
  terrainCooldown: number;
  phase: number;
  type: EnemyType;
  boss: boolean;
  behavior: EnemyBehaviorState;
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
  private readonly telegraphGeometry = new THREE.RingGeometry(0.48, 0.61, 24);
  private readonly materials: Record<EnemyType, THREE.MeshLambertMaterial> = {
    chaser: new THREE.MeshLambertMaterial({ color: 0xc95d72, emissive: 0x240810, emissiveIntensity: 0.18 }),
    zigzag: new THREE.MeshLambertMaterial({ color: 0xe79b57, emissive: 0x2d1406, emissiveIntensity: 0.18 }),
    burrower: new THREE.MeshLambertMaterial({ color: 0x7d8fb9, emissive: 0x0b1528, emissiveIntensity: 0.18 }),
    bomber: new THREE.MeshLambertMaterial({ color: 0xd7ca56, emissive: 0x262005, emissiveIntensity: 0.18 }),
    brute: new THREE.MeshLambertMaterial({ color: 0x9b6bc6, emissive: 0x180c29, emissiveIntensity: 0.18 }),
    boss: new THREE.MeshLambertMaterial({ color: 0xff4f66, emissive: 0x4b0710, emissiveIntensity: 0.75 }),
  };
  private readonly direction = new THREE.Vector3();
  private readonly alternate = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();
  private world: VoxelWorld;
  private danger = 1;
  private depthTier = 1;
  private reinforcementCooldown = 0;
  private playerContactCooldown = 0;

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
      const telegraph = new THREE.Mesh(
        this.telegraphGeometry,
        new THREE.MeshBasicMaterial({ color: 0xffd77a, transparent: true, opacity: 0.78, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
      );
      telegraph.rotation.x = -Math.PI / 2;
      telegraph.position.y = -0.38;
      telegraph.renderOrder = 20;
      telegraph.visible = false;
      mesh.add(telegraph);
      this.scene.add(mesh);
      this.enemies.push({
        mesh,
        telegraph,
        hp: GAME_CONFIG.enemies.hp,
        maxHp: GAME_CONFIG.enemies.hp,
        hitCooldown: 0,
        terrainCooldown: 0,
        phase: index * 1.7,
        type,
        boss: false,
        behavior: createEnemyBehaviorState(index * 0.18),
      });
    }
  }

  setWorld(world: VoxelWorld): void { this.world = world; }

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
    const activeCount = this.getInitialActiveCount();
    for (let index = 0; index < this.enemies.length; index += 1) {
      const type = TYPE_ORDER[index % TYPE_ORDER.length];
      const position = spawnPoints[index] ?? spawnPoints[index % Math.max(1, spawnPoints.length)] ?? this.fallbackSpawn(index);
      this.configureRegularEnemy(this.enemies[index], type, position, index < activeCount, index * 0.13);
    }
    this.reinforcementCooldown = 3.5;
    this.playerContactCooldown = 0;
  }

  spawnBoss(position: THREE.Vector3, tier: number): EnemyState | null {
    const regulars = this.enemies.filter((candidate) => !candidate.boss);
    const enemy = [...regulars].reverse().find((candidate) => !candidate.mesh.visible)
      ?? [...regulars].sort((left, right) => right.mesh.position.distanceToSquared(position) - left.mesh.position.distanceToSquared(position))[0];
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
    enemy.behavior = createEnemyBehaviorState(0.9);
    return enemy;
  }

  update(delta: number, player: THREE.Group): void {
    this.reinforcementCooldown = Math.max(0, this.reinforcementCooldown - delta);
    this.playerContactCooldown = Math.max(0, this.playerContactCooldown - delta);
    if (this.reinforcementCooldown <= 0) {
      this.maintainPopulation(player.position);
      this.reinforcementCooldown = Math.max(1.8, 4.4 - this.depthTier * 0.45);
    }

    for (const enemy of this.enemies) {
      if (!enemy.mesh.visible) continue;
      enemy.hitCooldown = Math.max(0, enemy.hitCooldown - delta);
      enemy.terrainCooldown = Math.max(0, enemy.terrainCooldown - delta);
      enemy.behavior.attackCooldown = Math.max(0, enemy.behavior.attackCooldown - delta);
      enemy.behavior.phaseSeconds += delta;
      const profile = ENEMY_BEHAVIOR_PROFILES[enemy.type];
      const toPlayer = this.direction.copy(player.position).sub(enemy.mesh.position);
      toPlayer.y = 0;
      const distance = toPlayer.length();
      const direction = distance > 0.01 ? toPlayer.normalize() : this.direction.set(0, 0, 1);

      this.updateTelegraphVisual(enemy, profile);

      if (enemy.behavior.phase === "telegraph") {
        enemy.mesh.rotation.y = Math.atan2(direction.x, direction.z);
        enemy.behavior.lockedYaw = enemy.mesh.rotation.y;
        if (enemy.type === "zigzag") enemy.mesh.rotation.z = Math.sin(performance.now() * 0.018 + enemy.phase) * 0.28;
        if (enemy.type === "burrower") enemy.mesh.scale.y = this.baseScale(enemy.type) * 0.48;
        if (enemy.behavior.phaseSeconds >= profile.telegraphSeconds) this.beginAttack(enemy, player.position);
        continue;
      }

      if (enemy.behavior.phase === "attack") {
        this.updateAttack(enemy, player.position, delta);
        if (enemy.behavior.phaseSeconds >= profile.attackSeconds) this.beginRecover(enemy);
        continue;
      }

      if (enemy.behavior.phase === "recover") {
        enemy.mesh.rotation.x += delta * 0.5;
        if (enemy.behavior.phaseSeconds >= profile.recoverSeconds) {
          enemy.behavior.phase = "approach";
          enemy.behavior.phaseSeconds = 0;
          enemy.behavior.attackCooldown = 0.28 + Math.max(0, 0.7 - this.danger * 0.18);
          this.restoreEnemyScale(enemy);
        }
        continue;
      }

      if (distance <= profile.attackRange && enemy.behavior.attackCooldown <= 0) {
        enemy.behavior.phase = "telegraph";
        enemy.behavior.phaseSeconds = 0;
        enemy.behavior.lockedYaw = Math.atan2(direction.x, direction.z);
        continue;
      }

      this.updateApproach(enemy, direction, distance, delta, player.position);
    }
  }

  private updateApproach(enemy: EnemyState, direction: THREE.Vector3, distance: number, delta: number, playerPosition: THREE.Vector3): void {
    const typeSpeed = enemy.type === "brute" ? 0.62 : enemy.type === "burrower" ? 0.78 : enemy.type === "bomber" ? 0.92 : enemy.boss ? 0.72 : 1;
    const amount = GAME_CONFIG.enemies.moveSpeed * this.danger * typeSpeed * delta;
    const next = this.alternate.copy(enemy.mesh.position);

    if (enemy.type === "bomber" && distance < 1.6) next.addScaledVector(direction, -amount * 0.9);
    else {
      if (enemy.type === "zigzag" || enemy.type === "bomber") {
        const weave = Math.sin(performance.now() * 0.0034 + enemy.phase) * amount * (enemy.type === "bomber" ? 2.2 : 3.0);
        next.x += -direction.z * weave;
        next.z += direction.x * weave;
      }
      next.addScaledVector(direction, amount);
    }

    if (!this.world.collidesAabb(next, enemy.boss ? 0.68 : 0.32, enemy.boss ? 1.45 : 0.8)) {
      enemy.mesh.position.copy(next);
    } else if (enemy.terrainCooldown <= 0) {
      enemy.terrainCooldown = enemy.boss ? 1.1 : enemy.type === "brute" ? 1.8 : enemy.type === "burrower" ? 1.25 : enemy.type === "bomber" ? 2.1 : 1.65;
      this.probe.copy(enemy.mesh.position).addScaledVector(direction, 0.8);
      const radius = enemy.boss ? 2.0 : enemy.type === "brute" ? 1.45 : enemy.type === "burrower" ? 1.05 : enemy.type === "bomber" ? 0.9 : 0.72;
      this.callbacks.onEnemyTerrainImpact?.(this.probe.clone(), radius, enemy.boss || enemy.type === "brute" ? 2 : 1);
    } else {
      const fallback = this.probe.copy(enemy.mesh.position);
      fallback.x -= direction.z * amount;
      fallback.z += direction.x * amount;
      if (!this.world.collidesAabb(fallback, 0.32, 0.8)) enemy.mesh.position.copy(fallback);
    }
    enemy.mesh.rotation.x += delta * (enemy.boss ? 0.65 : 1.2);
    enemy.mesh.rotation.y = Math.atan2(playerPosition.x - enemy.mesh.position.x, playerPosition.z - enemy.mesh.position.z);
  }

  private beginAttack(enemy: EnemyState, playerPosition: THREE.Vector3): void {
    enemy.behavior.phase = "attack";
    enemy.behavior.phaseSeconds = 0;
    enemy.telegraph.visible = false;
    const direction = this.direction.copy(playerPosition).sub(enemy.mesh.position);
    direction.y = 0;
    if (direction.lengthSq() > 0.001) enemy.behavior.lockedYaw = Math.atan2(direction.x, direction.z);

    if (enemy.type === "bomber") {
      if (enemy.terrainCooldown <= 0) {
        enemy.terrainCooldown = 2.0;
        this.callbacks.onEnemyTerrainImpact?.(enemy.mesh.position.clone(), 2.25, 2);
      }
      if (enemy.mesh.position.distanceToSquared(playerPosition) <= 2.45 * 2.45) this.tryDamagePlayer(enemy, 2);
    }
  }

  private updateAttack(enemy: EnemyState, playerPosition: THREE.Vector3, delta: number): void {
    const profile = ENEMY_BEHAVIOR_PROFILES[enemy.type];
    const forward = this.direction.set(Math.sin(enemy.behavior.lockedYaw), 0, Math.cos(enemy.behavior.lockedYaw));
    const p = phaseProgress(enemy.behavior, profile);

    if (enemy.type !== "bomber") {
      const speedCurve = 0.55 + Math.sin(Math.min(1, p) * Math.PI) * 0.75;
      const amount = GAME_CONFIG.enemies.moveSpeed * this.danger * profile.attackSpeedMultiplier * speedCurve * delta;
      const next = this.alternate.copy(enemy.mesh.position).addScaledVector(forward, amount);
      if (!this.world.collidesAabb(next, enemy.boss ? 0.68 : 0.32, enemy.boss ? 1.45 : 0.8)) {
        enemy.mesh.position.copy(next);
      } else if (enemy.terrainCooldown <= 0 && (enemy.type === "brute" || enemy.type === "burrower" || enemy.boss)) {
        enemy.terrainCooldown = 1.1;
        this.callbacks.onEnemyTerrainImpact?.(enemy.mesh.position.clone(), enemy.boss ? 2.0 : 1.4, enemy.boss ? 2 : 1);
        this.beginRecover(enemy);
      }
    }

    const hitRange = enemy.boss ? 1.55 : enemy.type === "brute" ? 1.18 : 0.94;
    if (enemy.type !== "bomber" && enemy.mesh.position.distanceToSquared(playerPosition) <= hitRange * hitRange) {
      this.tryDamagePlayer(enemy, profile.attackDamage);
    }
  }

  private tryDamagePlayer(enemy: EnemyState, damage: number): void {
    if (enemy.hitCooldown > 0 || this.playerContactCooldown > 0) return;
    enemy.hitCooldown = enemy.boss ? 0.82 : GAME_CONFIG.enemies.contactCooldown;
    this.playerContactCooldown = enemy.boss ? 0.8 : 1.35;
    this.callbacks.onPlayerContact(enemy.mesh.position, damage);
  }

  private beginRecover(enemy: EnemyState): void {
    enemy.behavior.phase = "recover";
    enemy.behavior.phaseSeconds = 0;
    enemy.telegraph.visible = false;
    enemy.mesh.rotation.z = 0;
    this.restoreEnemyScale(enemy);
  }

  private updateTelegraphVisual(enemy: EnemyState, profile: (typeof ENEMY_BEHAVIOR_PROFILES)[EnemyType]): void {
    const warning = enemy.behavior.phase === "telegraph" || enemy.behavior.phase === "attack";
    enemy.telegraph.visible = warning;
    if (!warning) return;
    const p = phaseProgress(enemy.behavior, profile);
    const dangerRadius = enemy.boss ? 2.2 : enemy.type === "bomber" ? 2.45 : enemy.type === "brute" ? 1.65 : enemy.type === "burrower" ? 1.55 : enemy.type === "zigzag" ? 1.45 : 1.25;
    const radiusScale = dangerRadius / 0.61;
    const pulse = radiusScale * (0.74 + p * 0.26 + Math.sin(p * Math.PI * 6) * 0.035);
    enemy.telegraph.scale.setScalar(pulse);
    const material = enemy.telegraph.material as THREE.MeshBasicMaterial;
    const attacking = enemy.behavior.phase === "attack";
    material.opacity = attacking ? 0.96 : 0.55 + p * 0.4;
    material.color.setHex(attacking || p > 0.72 ? 0xff4d5f : enemy.type === "bomber" ? 0xffd95e : 0xffb26b);
  }

  damage(target: { mesh: THREE.Mesh; hp: number }, playerPosition: THREE.Vector3, hitPoint: THREE.Vector3, amount = 1, knockbackMultiplier = 1): EnemyDamageResult | null {
    const enemy = this.enemies.find((candidate) => candidate.mesh === target.mesh);
    if (!enemy || !enemy.mesh.visible) return null;
    const vulnerableBonus = enemy.behavior.phase === "telegraph" && enemy.type !== "brute" && !enemy.boss ? 1 : 0;
    enemy.hp -= Math.max(1, Math.round(amount)) + vulnerableBonus;
    if (vulnerableBonus > 0) this.beginRecover(enemy);

    const knockback = this.direction.copy(enemy.mesh.position).sub(playerPosition);
    knockback.y = 0;
    let wallSlam = false;
    if (knockback.lengthSq() > 0.001) {
      const pushDistance = GAME_CONFIG.enemies.knockback * knockbackMultiplier * (enemy.boss ? 0.34 : enemy.type === "brute" ? 0.62 : 1);
      const pushed = this.alternate.copy(enemy.mesh.position).addScaledVector(knockback.normalize(), pushDistance);
      if (!this.world.collidesAabb(pushed, enemy.boss ? 0.68 : 0.32, enemy.boss ? 1.45 : 0.8)) enemy.mesh.position.copy(pushed);
      else {
        wallSlam = true;
        enemy.hp -= enemy.boss ? 1 : 2;
        this.callbacks.onEnemyTerrainImpact?.(enemy.mesh.position.clone(), enemy.boss ? 1.8 : 1.25, 1);
      }
    }
    const wasBoss = enemy.boss;
    const result: EnemyDamageResult = { enemy, hitPoint: hitPoint.clone(), position: enemy.mesh.position.clone(), defeated: enemy.hp <= 0, wallSlam, boss: wasBoss, maxHp: enemy.maxHp };
    if (result.defeated) enemy.mesh.visible = false;
    this.callbacks.onEnemyDamaged(result);
    if (result.defeated && wasBoss) this.recycleBossSlot(enemy);
    return result;
  }

  damageNearby(center: THREE.Vector3, radius: number, playerPosition: THREE.Vector3, amount = 1, knockbackMultiplier = 1): EnemyDamageResult[] {
    const results: EnemyDamageResult[] = [];
    const radiusSq = radius * radius;
    for (const enemy of this.enemies) {
      if (!enemy.mesh.visible || enemy.mesh.position.distanceToSquared(center) > radiusSq) continue;
      const result = this.damage(enemy, playerPosition, center, amount, knockbackMultiplier);
      if (result) results.push(result);
    }
    return results;
  }

  triggerDepthSurge(playerPosition: THREE.Vector3, tier = this.depthTier): number {
    this.depthTier = Math.max(this.depthTier, Math.floor(tier));
    const bossActive = this.bossState !== null;
    const capacity = Math.max(1, GAME_CONFIG.enemies.maxActive - (bossActive ? 1 : 0));
    const target = Math.min(capacity, this.getRegularPopulationTarget(bossActive) + 1);
    let activeRegular = this.enemies.reduce((count, enemy) => count + (enemy.mesh.visible && !enemy.boss ? 1 : 0), 0);
    const before = activeRegular;
    if (activeRegular < target) {
      const spawnPoints = this.getSpawnPoints();
      for (let index = 0; index < this.enemies.length && activeRegular < target; index += 1) {
        const enemy = this.enemies[index];
        if (enemy.mesh.visible || enemy.boss) continue;
        const type = TYPE_ORDER[(index + this.depthTier + 1) % TYPE_ORDER.length];
        const spawn = this.selectReinforcementSpawn(spawnPoints, playerPosition, index);
        this.configureRegularEnemy(enemy, type, spawn, true, 0.18 + index * 0.03);
        activeRegular += 1;
      }
    }
    this.reinforcementCooldown = Math.min(this.reinforcementCooldown, 1.1);
    return activeRegular - before;
  }

  private maintainPopulation(playerPosition: THREE.Vector3): void {
    const regularTarget = this.getRegularPopulationTarget(this.bossState !== null);
    let activeRegular = this.enemies.reduce((count, enemy) => count + (enemy.mesh.visible && !enemy.boss ? 1 : 0), 0);
    if (activeRegular >= regularTarget) return;
    const spawnPoints = this.getSpawnPoints();
    for (let index = 0; index < this.enemies.length && activeRegular < regularTarget; index += 1) {
      const enemy = this.enemies[index];
      if (enemy.mesh.visible || enemy.boss) continue;
      const type = TYPE_ORDER[(index + this.depthTier - 1) % TYPE_ORDER.length];
      const spawn = this.selectReinforcementSpawn(spawnPoints, playerPosition, index);
      this.configureRegularEnemy(enemy, type, spawn, true, 0.45 + index * 0.05);
      activeRegular += 1;
    }
  }

  private selectReinforcementSpawn(spawnPoints: readonly THREE.Vector3[], playerPosition: THREE.Vector3, index: number): THREE.Vector3 {
    const combatBand = spawnPoints
      .filter((point) => {
        const distanceSq = point.distanceToSquared(playerPosition);
        return distanceSq >= 20.25 && distanceSq <= 110.25;
      })
      .sort((left, right) => left.distanceToSquared(playerPosition) - right.distanceToSquared(playerPosition));
    if (combatBand.length > 0) {
      const point = combatBand[index % combatBand.length].clone();
      for (let rise = 0; rise < 4 && this.world.collidesAabb(point, 0.32, 0.8); rise += 1) point.y += 1;
      if (!this.world.collidesAabb(point, 0.32, 0.8)) return point;
    }
    const angle = (index * 2.399963229728653 + this.depthTier * 0.73) % (Math.PI * 2);
    const radius = 5.2 + (index % 3) * 1.05;
    const local = playerPosition.clone();
    local.x += Math.cos(angle) * radius;
    local.z += Math.sin(angle) * radius;
    for (let rise = 0; rise < 5 && this.world.collidesAabb(local, 0.32, 0.8); rise += 1) local.y += 1;
    if (!this.world.collidesAabb(local, 0.32, 0.8)) return local;
    const ordered = [...spawnPoints].sort((left, right) => left.distanceToSquared(playerPosition) - right.distanceToSquared(playerPosition));
    const point = (ordered.find((candidate) => candidate.distanceToSquared(playerPosition) >= 16) ?? ordered[0] ?? this.fallbackSpawn(index)).clone();
    for (let rise = 0; rise < 4 && this.world.collidesAabb(point, 0.32, 0.8); rise += 1) point.y += 1;
    return point;
  }

  private recycleBossSlot(enemy: EnemyState): void {
    const index = Math.max(0, this.enemies.indexOf(enemy));
    const type = TYPE_ORDER[index % TYPE_ORDER.length];
    enemy.type = type;
    enemy.boss = false;
    enemy.mesh.material = this.materials[type];
    enemy.mesh.visible = false;
    enemy.maxHp = this.hpForType(type);
    enemy.hp = enemy.maxHp;
    enemy.hitCooldown = 0;
    enemy.terrainCooldown = 0;
    enemy.behavior = createEnemyBehaviorState(0.6);
    this.restoreEnemyScale(enemy);
    this.reinforcementCooldown = Math.min(this.reinforcementCooldown, 1.25);
  }

  private configureRegularEnemy(enemy: EnemyState, type: EnemyType, position: THREE.Vector3, visible: boolean, terrainCooldown: number): void {
    enemy.type = type;
    enemy.boss = false;
    enemy.mesh.material = this.materials[type];
    enemy.mesh.position.copy(position);
    enemy.mesh.visible = visible;
    enemy.maxHp = this.hpForType(type);
    enemy.hp = enemy.maxHp;
    enemy.hitCooldown = visible ? 0.8 : 0;
    enemy.terrainCooldown = terrainCooldown;
    enemy.behavior = createEnemyBehaviorState(visible ? 0.7 + terrainCooldown : 0);
    enemy.telegraph.visible = false;
    this.restoreEnemyScale(enemy);
  }

  private baseScale(type: EnemyType): number {
    if (type === "boss") return 2.25;
    if (type === "brute") return 1.35;
    if (type === "bomber") return 0.9;
    return 1;
  }

  private restoreEnemyScale(enemy: EnemyState): void {
    const base = this.baseScale(enemy.type);
    if (enemy.type === "zigzag") enemy.mesh.scale.set(base * 0.82, base * 1.28, base * 0.82);
    else if (enemy.type === "burrower") enemy.mesh.scale.set(base * 1.22, base * 0.78, base * 1.22);
    else if (enemy.type === "bomber") enemy.mesh.scale.set(base * 0.92, base * 1.18, base * 0.92);
    else if (enemy.type === "brute") enemy.mesh.scale.set(base * 1.08, base * 0.95, base * 1.08);
    else enemy.mesh.scale.setScalar(base);
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
    if (generated && generated.length > 0) return generated.map((point: StagePoint) => new THREE.Vector3(point.x, point.y, point.z));
    return Array.from({ length: GAME_CONFIG.enemies.maxActive }, (_, index) => this.fallbackSpawn(index));
  }

  private fallbackSpawn(index: number): THREE.Vector3 {
    const spawn = this.world.spawnPoint;
    const maxZ = this.world.depth - 3.5;
    const z = Math.min(maxZ, spawn.z + 6 + index * 4.2);
    const x = spawn.x + (index % 2 === 0 ? -1.4 : 1.4) + ((index % 3) - 1) * 0.6;
    return new THREE.Vector3(x, spawn.y, z);
  }

  private getInitialActiveCount(): number {
    if (this.world.metadata?.difficulty === "easy") return Math.min(2, GAME_CONFIG.enemies.maxActive);
    if (this.world.metadata?.difficulty === "hard") return Math.min(4, GAME_CONFIG.enemies.maxActive);
    return Math.min(3, GAME_CONFIG.enemies.maxActive);
  }

  private getRegularPopulationTarget(bossActive: boolean): number {
    const base = this.world.metadata?.difficulty === "easy" ? 2 : this.world.metadata?.difficulty === "hard" ? 4 : 3;
    const tierBonus = Math.max(0, this.depthTier - 1);
    const capacity = Math.max(1, GAME_CONFIG.enemies.maxActive - (bossActive ? 1 : 0));
    return Math.min(capacity, base + tierBonus);
  }

  dispose(): void {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.mesh);
      (enemy.telegraph.material as THREE.Material).dispose();
    }
    this.geometry.dispose();
    this.telegraphGeometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
