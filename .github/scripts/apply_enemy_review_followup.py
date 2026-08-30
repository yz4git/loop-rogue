from pathlib import Path

p = Path('src/enemies/EnemyManager.ts')
text = p.read_text()
old = '''      const distance = toPlayer.length();
      const direction = distance > 0.01 ? toPlayer.normalize() : this.direction.set(0, 0, 1);

      this.updateTelegraphVisual(enemy, profile);'''
new = '''      const distance = toPlayer.length();
      const direction = distance > 0.01 ? toPlayer.normalize() : this.direction.set(0, 0, 1);

      if (!enemy.boss && enemy.behavior.phase === "approach" && enemy.behavior.phaseSeconds >= 4.2 && distance > 7.5) {
        if (this.relocateThreatNearPlayer(enemy, player)) continue;
      }

      this.updateTelegraphVisual(enemy, profile);'''
if new not in text:
    if old not in text:
        raise SystemExit('missing pursuit insertion target')
    text = text.replace(old, new, 1)

old = '''  private beginAttack(enemy: EnemyState, playerPosition: THREE.Vector3): void {'''
new = '''  private relocateThreatNearPlayer(enemy: EnemyState, player: THREE.Group): boolean {
    const index = Math.max(0, this.enemies.indexOf(enemy));
    const offsets = [-0.72, 0.72, -0.38, 0.38, 0];
    for (let attempt = 0; attempt < offsets.length; attempt += 1) {
      const angle = player.rotation.y + offsets[(index + attempt) % offsets.length];
      const radius = 4.4 + ((index + attempt) % 3) * 0.7;
      const candidate = player.position.clone();
      candidate.x += Math.sin(angle) * radius;
      candidate.z += Math.cos(angle) * radius;
      for (let rise = 0; rise < 4 && this.world.collidesAabb(candidate, 0.32, 0.8); rise += 1) candidate.y += 1;
      if (this.world.collidesAabb(candidate, 0.32, 0.8)) continue;
      enemy.mesh.position.copy(candidate);
      enemy.behavior.phase = "telegraph";
      enemy.behavior.phaseSeconds = 0;
      enemy.behavior.attackCooldown = 0;
      const toPlayer = this.direction.copy(player.position).sub(candidate);
      toPlayer.y = 0;
      enemy.behavior.lockedYaw = toPlayer.lengthSq() > 0.001 ? Math.atan2(toPlayer.x, toPlayer.z) : player.rotation.y + Math.PI;
      enemy.mesh.rotation.y = enemy.behavior.lockedYaw;
      this.restoreEnemyScale(enemy);
      return true;
    }
    enemy.behavior.phaseSeconds = 2.4;
    return false;
  }

  private beginAttack(enemy: EnemyState, playerPosition: THREE.Vector3): void {'''
if new not in text:
    if old not in text:
        raise SystemExit('missing relocate method target')
    text = text.replace(old, new, 1)
p.write_text(text)

rt = Path('tests/runtime-contracts.test.ts')
t = rt.read_text()
if 'enemy pursuit re-enters combat with a telegraphed relocation' not in t:
    t += '''\n\ntest("enemy pursuit re-enters combat with a telegraphed relocation", () => {\n  const manager = readFileSync(new URL("../src/enemies/EnemyManager.ts", import.meta.url), "utf8");\n  assert.match(manager, /phaseSeconds >= 4\\.2/);\n  assert.match(manager, /distance > 7\\.5/);\n  assert.match(manager, /relocateThreatNearPlayer/);\n  assert.match(manager, /behavior\\.phase = "telegraph"/);\n});\n'''
    rt.write_text(t)
