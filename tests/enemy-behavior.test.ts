import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { EnemyManager } from "../src/enemies/EnemyManager";
import { ENEMY_BEHAVIOR_PROFILES } from "../src/enemies/EnemyBehaviorModel";
import { VoxelWorld } from "../src/world/VoxelWorld";

test("enemy archetypes expose readable telegraph attack and recovery windows", () => {
  assert.ok(ENEMY_BEHAVIOR_PROFILES.chaser.telegraphSeconds >= 0.3);
  assert.ok(ENEMY_BEHAVIOR_PROFILES.brute.telegraphSeconds > ENEMY_BEHAVIOR_PROFILES.chaser.telegraphSeconds);
  assert.ok(ENEMY_BEHAVIOR_PROFILES.bomber.attackRange > ENEMY_BEHAVIOR_PROFILES.chaser.attackRange);
  assert.ok(ENEMY_BEHAVIOR_PROFILES.brute.attackDamage > ENEMY_BEHAVIOR_PROFILES.chaser.attackDamage);
});

test("EnemyManager enters telegraph before an enemy can damage the player", () => {
  const world = new VoxelWorld();
  const scene = new THREE.Scene();
  const player = new THREE.Group();
  let hits = 0;
  const manager = new EnemyManager(scene, world, {
    onPlayerContact: () => { hits += 1; },
    onEnemyDamaged: () => undefined,
  });
  manager.reset();
  const enemy = manager.enemies.find((candidate) => candidate.mesh.visible);
  assert.ok(enemy);
  if (!enemy) throw new Error("expected an active enemy");
  player.position.copy(enemy.mesh.position);
  player.position.z += 0.7;
  enemy.behavior.attackCooldown = 0;
  manager.update(1 / 60, player);
  assert.equal(enemy.behavior.phase, "telegraph");
  assert.equal(enemy.telegraph.visible, false);
  assert.equal(hits, 0);
  manager.update(1 / 60, player);
  assert.equal(enemy.telegraph.visible, true);
  assert.equal(hits, 0);
  manager.dispose();
  world.dispose();
});

test("interruptible enemies are staggered out of telegraph when punched", () => {
  const world = new VoxelWorld();
  const scene = new THREE.Scene();
  const player = new THREE.Group();
  const manager = new EnemyManager(scene, world, {
    onPlayerContact: () => undefined,
    onEnemyDamaged: () => undefined,
  });
  manager.reset();
  const enemy = manager.enemies.find((candidate) => candidate.mesh.visible && candidate.type !== "brute");
  assert.ok(enemy);
  if (!enemy) throw new Error("expected interruptible enemy");
  player.position.copy(enemy.mesh.position);
  player.position.z += 0.7;
  enemy.behavior.attackCooldown = 0;
  manager.update(1 / 60, player);
  const hpBefore = enemy.hp;
  manager.damage(enemy, player.position, enemy.mesh.position.clone(), 1, 1);
  assert.equal(enemy.behavior.phase, "recover");
  assert.equal(enemy.hp, hpBefore - 2);
  manager.dispose();
  world.dispose();
});
