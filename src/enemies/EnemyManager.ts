import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import type { StagePoint } from "../stages/StageSource";
import type { VoxelWorld } from "../world/VoxelWorld";

export interface EnemyState {
  mesh: THREE.Mesh;
  hp: number;
  hitCooldown: number;
  phase: number;
  type: "chaser" | "zigzag";
}

export interface EnemyDamageResult {
  enemy: EnemyState;
  hitPoint: THREE.Vector3;
  position: THREE.Vector3;
  defeated: boolean;
}

export interface EnemyManagerCallbacks {
  onPlayerContact: (source: THREE.Vector3) => void;
  onEnemyDamaged: (result: EnemyDamageResult) => void;
}

export class EnemyManager {
  readonly enemies: EnemyState[] = [];
  private readonly geometry = new THREE.IcosahedronGeometry(0.42, 1);
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xc95d72 });
  private readonly direction = new THREE.Vector3();
  private readonly alternate = new THREE.Vector3();
  private world: VoxelWorld;

  constructor(
    private readonly scene: THREE.Scene,
    world: VoxelWorld,
    private readonly callbacks: EnemyManagerCallbacks,
  ) {
    this.world = world;
    for (let index = 0; index < GAME_CONFIG.enemies.maxActive; index += 1) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.visible = false;
      mesh.name = `enemy-${index}`;
      this.scene.add(mesh);
      this.enemies.push({
        mesh,
        hp: GAME_CONFIG.enemies.hp,
        hitCooldown: 0,
        phase: index * 1.7,
        type: index % 2 === 0 ? "chaser" : "zigzag",
      });
    }
  }

  setWorld(world: VoxelWorld): void {
    this.world = world;
  }

  get activeCount(): number {
    let count = 0;
    for (const enemy of this.enemies) if (enemy.mesh.visible) count += 1;
    return count;
  }

  reset(): void {
    const spawnPoints = this.getSpawnPoints();
    const activeCount = this.getActiveCount();
    for (let index = 0; index < this.enemies.length; index += 1) {
      const enemy = this.enemies[index];
      enemy.mesh.position.copy(spawnPoints[index] ?? spawnPoints[0]);
      enemy.mesh.visible = index < activeCount;
      enemy.hp = GAME_CONFIG.enemies.hp;
      enemy.hitCooldown = 0;
    }
  }

  update(delta: number, player: THREE.Group): void {
    for (const enemy of this.enemies) {
      if (!enemy.mesh.visible) continue;
      enemy.hitCooldown = Math.max(0, enemy.hitCooldown - delta);
      const toPlayer = this.direction.copy(player.position).sub(enemy.mesh.position);
      toPlayer.y = 0;
      const distance = toPlayer.length();
      if (distance <= GAME_CONFIG.enemies.contactRange) {
        if (enemy.hitCooldown <= 0) {
          enemy.hitCooldown = GAME_CONFIG.enemies.contactCooldown;
          this.callbacks.onPlayerContact(enemy.mesh.position);
        }
        continue;
      }
      if (distance < 0.01) continue;
      toPlayer.normalize();
      const amount = GAME_CONFIG.enemies.moveSpeed * delta;
      const next = this.alternate.copy(enemy.mesh.position);
      if (enemy.type === "zigzag") {
        const weave = Math.sin(performance.now() * 0.003 + enemy.phase) * amount * 2.2;
        next.x += -toPlayer.z * weave;
        next.z += toPlayer.x * weave;
      }
      next.addScaledVector(toPlayer, amount);
      if (!this.world.collidesAabb(next, 0.32, 0.8)) {
        enemy.mesh.position.copy(next);
      } else {
        const fallback = this.direction.copy(enemy.mesh.position);
        fallback.x -= toPlayer.z * amount;
        fallback.z += toPlayer.x * amount;
        if (!this.world.collidesAabb(fallback, 0.32, 0.8)) enemy.mesh.position.copy(fallback);
      }
      enemy.mesh.rotation.y += delta * 2.2;
    }
  }

  damage(
    target: { mesh: THREE.Mesh; hp: number },
    playerPosition: THREE.Vector3,
    hitPoint: THREE.Vector3,
    amount = 1,
  ): EnemyDamageResult | null {
    const enemy = this.enemies.find((candidate) => candidate.mesh === target.mesh);
    if (!enemy || !enemy.mesh.visible) return null;
    enemy.hp -= amount;
    const knockback = this.direction.copy(enemy.mesh.position).sub(playerPosition);
    knockback.y = 0;
    if (knockback.lengthSq() > 0.001) {
      const pushed = this.alternate.copy(enemy.mesh.position)
        .addScaledVector(knockback.normalize(), GAME_CONFIG.enemies.knockback);
      if (!this.world.collidesAabb(pushed, 0.32, 0.8)) enemy.mesh.position.copy(pushed);
    }
    const result: EnemyDamageResult = {
      enemy,
      hitPoint: hitPoint.clone(),
      position: enemy.mesh.position.clone(),
      defeated: enemy.hp <= 0,
    };
    if (result.defeated) enemy.mesh.visible = false;
    this.callbacks.onEnemyDamaged(result);
    return result;
  }

  damageNearby(
    center: THREE.Vector3,
    radius: number,
    playerPosition: THREE.Vector3,
  ): EnemyDamageResult[] {
    const results: EnemyDamageResult[] = [];
    const radiusSq = radius * radius;
    for (const enemy of this.enemies) {
      if (!enemy.mesh.visible || enemy.mesh.position.distanceToSquared(center) > radiusSq) continue;
      const result = this.damage(enemy, playerPosition, center);
      if (result) results.push(result);
    }
    return results;
  }

  private getSpawnPoints(): THREE.Vector3[] {
    const generated = this.world.metadata?.enemySpawns;
    if (generated && generated.length > 0) {
      return generated.map((point: StagePoint) => new THREE.Vector3(point.x, point.y, point.z));
    }
    const spawn = this.world.spawnPoint;
    const maxZ = this.world.depth - 3.5;
    return [
      new THREE.Vector3(spawn.x - 1, spawn.y, Math.min(maxZ, spawn.z + 7)),
      new THREE.Vector3(spawn.x + 1, spawn.y, Math.min(maxZ, spawn.z + 12)),
      new THREE.Vector3(spawn.x - 1, spawn.y, Math.min(maxZ, spawn.z + 18)),
      new THREE.Vector3(spawn.x + 1, spawn.y, Math.min(maxZ, spawn.z + 24)),
    ];
  }

  private getActiveCount(): number {
    if (this.world.metadata?.difficulty === "easy") return Math.min(2, GAME_CONFIG.enemies.maxActive);
    return GAME_CONFIG.enemies.maxActive;
  }

  dispose(): void {
    for (const enemy of this.enemies) this.scene.remove(enemy.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
