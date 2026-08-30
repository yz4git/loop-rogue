from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"{path}: missing target {old!r}")
    p.write_text(text.replace(old, new, 1))


replace("src/enemies/EnemyManager.ts", """      telegraph.rotation.x = -Math.PI / 2;
      telegraph.position.y = -0.38;""", """      telegraph.rotation.x = 0;
      telegraph.position.y = 0;""")
replace("src/core/VoxelDemo.ts", "this.player.visible = this.runtime.cameraDistance >= 1.2;", "this.player.visible = this.runtime.cameraDistance >= 2.35;")

rt = Path("tests/runtime-contracts.test.ts")
text = rt.read_text()
text = text.replace("/cameraDistance >= 1\\.2/", "/cameraDistance >= 2\\.35/")
if "enemy warning ring faces the combat camera" not in text:
    text += '''\n\ntest("enemy warning ring faces the combat camera", () => {\n  const manager = readFileSync(new URL("../src/enemies/EnemyManager.ts", import.meta.url), "utf8");\n  assert.match(manager, /telegraph\\.rotation\\.x = 0/);\n  assert.match(manager, /telegraph\\.position\\.y = 0/);\n});\n'''
rt.write_text(text)
