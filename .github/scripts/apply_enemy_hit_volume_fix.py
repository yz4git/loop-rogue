from pathlib import Path

p = Path('src/enemies/EnemyManager.ts')
text = p.read_text()
old = '''      if (enemy.mesh.position.distanceToSquared(playerPosition) <= 2.45 * 2.45) this.tryDamagePlayer(enemy, 2);'''
new = '''      if (this.isPlayerWithinAttackVolume(enemy, playerPosition, 2.45, 2.2)) this.tryDamagePlayer(enemy, 2);'''
if old not in text and new not in text:
    raise SystemExit('missing bomber hit target')
text = text.replace(old, new, 1)
old = '''    const hitRange = enemy.boss ? 1.55 : enemy.type === "brute" ? 1.18 : 0.94;
    if (enemy.type !== "bomber" && enemy.mesh.position.distanceToSquared(playerPosition) <= hitRange * hitRange) {
      this.tryDamagePlayer(enemy, profile.attackDamage);
    }
  }

  private tryDamagePlayer(enemy: EnemyState, damage: number): void {'''
new = '''    const hitRange = enemy.boss ? 1.7 : enemy.type === "brute" ? 1.35 : 1.15;
    const verticalTolerance = enemy.boss ? 2.4 : enemy.type === "brute" ? 2.0 : 1.8;
    if (enemy.type !== "bomber" && this.isPlayerWithinAttackVolume(enemy, playerPosition, hitRange, verticalTolerance)) {
      this.tryDamagePlayer(enemy, profile.attackDamage);
    }
  }

  private isPlayerWithinAttackVolume(
    enemy: EnemyState,
    playerPosition: THREE.Vector3,
    horizontalRange: number,
    verticalTolerance: number,
  ): boolean {
    const dx = enemy.mesh.position.x - playerPosition.x;
    const dz = enemy.mesh.position.z - playerPosition.z;
    if (dx * dx + dz * dz > horizontalRange * horizontalRange) return false;
    return Math.abs(enemy.mesh.position.y - playerPosition.y) <= verticalTolerance;
  }

  private tryDamagePlayer(enemy: EnemyState, damage: number): void {'''
if old not in text and new not in text:
    raise SystemExit('missing melee hit target')
text = text.replace(old, new, 1)
p.write_text(text)

rt = Path('tests/runtime-contracts.test.ts')
t = rt.read_text()
marker = 'EnemyManager attack volume tolerates voxel-step height offsets'
if marker not in t:
    t += '''\n\ntest("EnemyManager attack volume tolerates voxel-step height offsets", () => {\n  const world = new VoxelWorld();\n  world.processRebuildQueue(100);\n  const scene = new THREE.Scene();\n  const player = new THREE.Group();\n  player.position.set(world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z);\n  let damage = 0;\n  const manager = new EnemyManager(scene, world, {\n    onPlayerContact: (_source, amount) => { damage += amount ?? 1; },\n    onEnemyDamaged: () => undefined,\n  });\n  manager.reset();\n  for (const enemy of manager.enemies) enemy.mesh.visible = false;\n  const enemy = manager.enemies[0];\n  enemy.mesh.visible = true;\n  enemy.mesh.position.copy(player.position).add(new THREE.Vector3(0, 1.05, 1.05));\n  enemy.hitCooldown = 0;\n  enemy.behavior.phase = "approach";\n  enemy.behavior.phaseSeconds = 0;\n  enemy.behavior.attackCooldown = 0;\n  for (let frame = 0; frame < 180; frame += 1) manager.update(1 / 60, player);\n  assert.ok(damage > 0);\n  manager.dispose();\n  world.dispose();\n});\n'''
    rt.write_text(t)
