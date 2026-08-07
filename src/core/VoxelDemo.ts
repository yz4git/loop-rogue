import * as THREE from "three";
import { GAME_CONFIG } from "./Settings";
import { VoxelWorld } from "../world/VoxelWorld";
import type { StageSource } from "../stages/StageSource";

export interface DemoStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  chunks: number;
  pendingChunks: number;
  destroyed: number;
  player: string;
  grounded: boolean;
  hp: number;
  maxHp: number;
  enemies: number;
  coins: number;
  status: "playing" | "cleared" | "gameover";
  lastMessage: string;
  stageMode: "handcrafted" | "procedural";
  seed: string;
  generatorVersion: number;
  generationMs: number;
  caves: number;
  structures: number;
  jigsawPieces: number;
  reachabilityCost: number;
  biomeCounts: string;
}

interface EffectParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: THREE.Vector3;
}

interface EnemyState {
  mesh: THREE.Mesh;
  hp: number;
  hitCooldown: number;
  phase: number;
  type: "chaser" | "zigzag";
}

interface CoinState {
  mesh: THREE.Mesh;
  active: boolean;
}

export class VoxelDemo {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  readonly renderer: THREE.WebGLRenderer;
  world: VoxelWorld;
  private readonly mount: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly onStats: (stats: DemoStats) => void;
  private readonly clock = new THREE.Clock();
  private readonly player = new THREE.Group();
  private readonly playerBody: THREE.Mesh;
  private readonly leftHand: THREE.Mesh;
  private readonly rightHand: THREE.Mesh;
  private readonly leftArm: THREE.Mesh;
  private readonly rightArm: THREE.Mesh;
  private readonly handGeometry = new THREE.SphereGeometry(0.15, 8, 6);
  private readonly armGeometry = new THREE.CapsuleGeometry(0.085, 0.34, 4, 6);
  private readonly handMaterial = new THREE.MeshLambertMaterial({ color: 0x68e2d1 });
  private readonly moveInput = new THREE.Vector2();
  private readonly velocity = new THREE.Vector3();
  private readonly desiredMove = new THREE.Vector3();
  private readonly nextPosition = new THREE.Vector3();
  private readonly steppedPosition = new THREE.Vector3();
  private readonly enemyDirection = new THREE.Vector3();
  private readonly enemyAlternate = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly desiredCamera = new THREE.Vector3();
  private readonly cameraDirection = new THREE.Vector3();
  private readonly cameraRay = new THREE.Raycaster();
  private readonly keys = new Set<string>();
  private readonly impactRing: THREE.Mesh;
  private readonly enemyPool: EnemyState[] = [];
  private readonly coinPool: CoinState[] = [];
  private readonly rewardCoinPoints = [new THREE.Vector3(14.5, 9.7, 21.5), new THREE.Vector3(17.5, 9.7, 23.5)];
  private readonly enemyGeometry = new THREE.IcosahedronGeometry(0.42, 1);
  private readonly enemyMaterial = new THREE.MeshLambertMaterial({ color: 0xc95d72 });
  private readonly coinGeometry = new THREE.TorusGeometry(0.2, 0.07, 6, 12);
  private readonly coinMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  private readonly goalMesh: THREE.Mesh;
  private readonly debrisPool: EffectParticle[] = [];
  private readonly dustPool: EffectParticle[] = [];
  private readonly debrisGeometry = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  private readonly dustGeometry = new THREE.SphereGeometry(0.13, 6, 4);
  private readonly debrisMaterial = new THREE.MeshBasicMaterial({ color: 0xc77b4e });
  private readonly debrisRockMaterial = new THREE.MeshBasicMaterial({ color: 0x9fa9b5 });
  private readonly dustMaterial = new THREE.MeshBasicMaterial({ color: 0xd7a06c, transparent: true, opacity: 0.42, depthWrite: false });
  private audioContext: AudioContext | null = null;
  private animationFrame = 0;
  private destroyedTotal = 0;
  private enemiesDefeatedTotal = 0;
  private combo = 0;
  private comboExpiresAt = 0;
  private lastMessage = "深部へ掘り、敵2体を倒してゴールへ";
  private lastTapAt = 0;
  private hitStopUntil = 0;
  private statsTimer = 0;
  // 初期カメラは進行方向の後ろ。入口側を向くため、開始直後に岩壁を映さない。
  private cameraYaw = Math.PI;
  private cameraPitch = 0.25;
  private cameraPointerId: number | null = null;
  private cameraPointerX = 0;
  private cameraPointerY = 0;
  private grounded = false;
  private punchReadyAt = 0;
  private punchUntil = 0;
  private groundPoundReadyAt = 0;
  private groundPoundActive = false;
  private jumpBufferedUntil = 0;
  private coyoteUntil = 0;
  private shakeUntil = 0;
  private shakeStrength = 0;
  private impactStartedAt = 0;
  private hp = GAME_CONFIG.player.maxHp;
  private coins = 0;
  private gameState: "playing" | "cleared" | "gameover" = "playing";
  private cameraManuallyControlled = false;
  private movementInputActive = false;
  private behindCameraTransition = 0;

  constructor(mount: HTMLElement, onStats: (stats: DemoStats) => void, source?: StageSource) {
    this.mount = mount;
    this.onStats = onStats;
    this.scene.background = new THREE.Color(0x091321);
    this.scene.fog = new THREE.Fog(0x091321, GAME_CONFIG.rendering.fogNear, GAME_CONFIG.rendering.fogFar);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GAME_CONFIG.rendering.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "voxel-canvas";
    this.renderer.domElement.setAttribute("aria-label", "地形を破壊しながら歩く3Dボクセル技術デモ");
    this.mount.appendChild(this.renderer.domElement);
    // 開始地点が地下でも入口の形状とプレイヤーを見失わない明るさを確保する。
    this.scene.add(new THREE.HemisphereLight(0xb9dcff, 0x3a2b2a, 2.15));
    const sun = new THREE.DirectionalLight(0xffe0a5, 2.3);
    sun.position.set(-12, 25, 24);
    this.scene.add(sun);
    this.world = new VoxelWorld(source);
    this.scene.add(this.world.group);
    this.updateWorldRenderingDistance();

    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xf0a35b });
    this.playerBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 4, 8), bodyMaterial);
    this.playerBody.position.y = 0.7;
    this.playerBody.castShadow = false;
    this.player.add(this.playerBody);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0x68e2d1 }));
    visor.position.set(0, 0.82, -0.25);
    this.player.add(visor);
    this.leftArm = new THREE.Mesh(this.armGeometry, bodyMaterial);
    this.rightArm = new THREE.Mesh(this.armGeometry, bodyMaterial);
    this.leftHand = new THREE.Mesh(this.handGeometry, this.handMaterial);
    this.rightHand = new THREE.Mesh(this.handGeometry, this.handMaterial);
    this.leftArm.position.set(-0.27, 0.72, 0.18);
    this.rightArm.position.set(0.27, 0.72, 0.18);
    this.leftHand.position.set(-0.3, 0.68, 0.42);
    this.rightHand.position.set(0.3, 0.68, 0.42);
    this.leftHand.scale.setScalar(1);
    this.rightHand.scale.setScalar(1);
    this.player.add(this.leftArm, this.rightArm, this.leftHand, this.rightHand);
    this.player.position.set(this.world.spawnPoint.x, this.world.spawnPoint.y, this.world.spawnPoint.z);
    this.scene.add(this.player);
    this.impactRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.2, 18),
      new THREE.MeshBasicMaterial({ color: 0xffc36b, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    this.impactRing.visible = false;
    this.scene.add(this.impactRing);
    this.createEffectPools();
    this.goalMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.12, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x75e3d6, transparent: true, opacity: 0.9 }),
    );
    this.goalMesh.position.set(this.world.goalPoint.x, this.world.goalPoint.y, this.world.goalPoint.z);
    this.goalMesh.rotation.x = Math.PI / 2;
    this.scene.add(this.goalMesh);
    this.createGameplayPools();

    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown, { passive: false });
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove, { passive: false });
    this.renderer.domElement.addEventListener("pointerup", this.handlePointerUp, { passive: false });
    this.renderer.domElement.addEventListener("pointercancel", this.handlePointerUp, { passive: false });
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost, { passive: false });
    this.renderer.domElement.addEventListener("webglcontextrestored", this.handleContextRestored);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("resize", this.resize);
    window.addEventListener("orientationchange", this.resize);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.resize();
    this.animate();
  }

  private readonly resize = () => {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private updateWorldRenderingDistance(): void {
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = Math.max(GAME_CONFIG.rendering.fogNear, this.world.depth * 0.38);
      this.scene.fog.far = Math.max(GAME_CONFIG.rendering.fogFar, this.world.depth * 1.18);
    }
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.lastMessage = "描画を一時停止 · 復帰を待っています";
  };

  private readonly handleContextRestored = () => {
    this.resize();
    this.lastMessage = "描画復帰 · そのまま続けられます";
  };

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      this.clock.start();
      this.resize();
    }
  };

  private createEffectPools(): void {
    for (let index = 0; index < GAME_CONFIG.effects.maxDebris; index += 1) {
      const mesh = new THREE.Mesh(this.debrisGeometry, index % 3 === 0 ? this.debrisRockMaterial : this.debrisMaterial);
      mesh.visible = false;
      this.scene.add(mesh);
      this.debrisPool.push({ mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 0, spin: new THREE.Vector3() });
    }
    for (let index = 0; index < GAME_CONFIG.effects.maxDust; index += 1) {
      const mesh = new THREE.Mesh(this.dustGeometry, this.dustMaterial);
      mesh.visible = false;
      this.scene.add(mesh);
      this.dustPool.push({ mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 0, spin: new THREE.Vector3() });
    }
  }

  private createGameplayPools(): void {
    const spawnPoints = this.getEnemySpawnPoints();
    const activeCount = this.getEnemyActiveCount();
    for (let index = 0; index < GAME_CONFIG.enemies.maxActive; index += 1) {
      const mesh = new THREE.Mesh(this.enemyGeometry, this.enemyMaterial);
      mesh.position.copy(spawnPoints[index] ?? spawnPoints[0]);
      mesh.visible = index < activeCount;
      this.scene.add(mesh);
      this.enemyPool.push({ mesh, hp: GAME_CONFIG.enemies.hp, hitCooldown: 0, phase: index * 1.7, type: index % 2 === 0 ? "chaser" : "zigzag" });
    }
    for (let index = 0; index < GAME_CONFIG.items.maxCoins; index += 1) {
      const mesh = new THREE.Mesh(this.coinGeometry, this.coinMaterial);
      mesh.visible = false;
      this.scene.add(mesh);
      this.coinPool.push({ mesh, active: false });
    }
    this.getRewardCoinPoints().forEach((point, index) => {
      const coin = this.coinPool[index];
      if (!coin) return;
      coin.active = true;
      coin.mesh.visible = true;
      coin.mesh.position.copy(point);
    });
  }

  private getEnemySpawnPoints(): THREE.Vector3[] {
    const generated = this.world.metadata?.enemySpawns;
    if (generated && generated.length > 0) return generated.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    const spawn = this.world.spawnPoint;
    const maxZ = this.world.depth - 3.5;
    return [
      new THREE.Vector3(spawn.x - 1, spawn.y, Math.min(maxZ, spawn.z + 7)),
      new THREE.Vector3(spawn.x + 1, spawn.y, Math.min(maxZ, spawn.z + 12)),
      new THREE.Vector3(spawn.x - 1, spawn.y, Math.min(maxZ, spawn.z + 18)),
      new THREE.Vector3(spawn.x + 1, spawn.y, Math.min(maxZ, spawn.z + 24)),
    ];
  }

  private getEnemyActiveCount(): number {
    if (this.world.metadata?.difficulty === "easy") return Math.min(2, GAME_CONFIG.enemies.maxActive);
    return GAME_CONFIG.enemies.maxActive;
  }

  private getRewardCoinPoints(): THREE.Vector3[] {
    const generated = this.world.metadata?.coinSpawns;
    return generated && generated.length > 0
      ? generated.map((point) => new THREE.Vector3(point.x, point.y, point.z))
      : this.rewardCoinPoints.map((point) => point.clone());
  }

  setMoveInput(x: number, y: number): void {
    this.moveInput.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
  }

  jump(): void {
    if (this.gameState !== "playing") return;
    const now = performance.now();
    // 接地フラグの更新とボタン入力が同じフレームになる場合に備える。
    if (!this.grounded) this.grounded = this.hasGroundSupport();
    if (!this.grounded && now > this.coyoteUntil) {
      this.jumpBufferedUntil = now + 180;
      return;
    }
    this.velocity.y = GAME_CONFIG.player.jumpVelocity;
    this.grounded = false;
    this.jumpBufferedUntil = 0;
    this.lastMessage = "ジャンプ";
  }

  private hasGroundSupport(): boolean {
    const footY = this.player.position.y - GAME_CONFIG.player.height * 0.5;
    const baseY = Math.floor(footY) - 1;
    const centerX = Math.floor(this.player.position.x);
    const centerZ = Math.floor(this.player.position.z);
    for (let y = baseY; y >= Math.max(1, baseY - 2); y -= 1) {
      for (let z = centerZ - 1; z <= centerZ + 1; z += 1) for (let x = centerX - 1; x <= centerX + 1; x += 1) {
        if (!this.world.isSolidAt(x, y, z)) continue;
        const above = this.world.isSolidAt(x, y + 1, z);
        if (!above && footY - (y + 1) <= 0.24) return true;
      }
    }
    return false;
  }

  punch(): void {
    if (!this.grounded) {
      this.startGroundPound();
      return;
    }
    const now = performance.now();
    if (now < this.punchReadyAt) return;
    this.punchReadyAt = now + GAME_CONFIG.destruction.punchCooldown * 1000;
    this.punchUntil = now + 240;
    const direction = new THREE.Vector3(Math.sin(this.player.rotation.y), 0, Math.cos(this.player.rotation.y));
    const origin = this.player.position.clone().add(new THREE.Vector3(0, 0.7, 0)).addScaledVector(direction, 0.38);
    this.raycaster.set(origin, direction);
    const wallHit = this.world.raycast(this.raycaster).find((intersection) => intersection.distance <= GAME_CONFIG.destruction.punchRange);
    const enemy = this.findEnemyInFront(direction);
    if (enemy && !wallHit) {
      this.damageEnemy(enemy, origin);
      return;
    }
    const first = this.world.raycast(this.raycaster).find((intersection) => intersection.distance <= GAME_CONFIG.destruction.punchRange);
    if (!first?.point) {
      this.lastMessage = "パンチ空振り · 岩へ近づいてください";
      this.playPunchSound(false);
      return;
    }
    const result = this.world.destroySphere(first.point, GAME_CONFIG.destruction.punchRadius);
    this.destroyedTotal += result.destroyed;
    const blast = this.processOreExplosions(result.orePoints, now);
    const comboText = this.registerCombo(result.destroyed, result.oreDestroyed, now);
    this.hitStopUntil = now + GAME_CONFIG.destruction.hitStop * 1000;
    this.shakeUntil = now + (result.destroyed > 0 ? 180 : 90);
    this.shakeStrength = result.destroyed > 0 ? 0.12 : 0.045;
    this.showImpact(first.point, result.destroyed > 0);
    this.spawnDestructionEffects(first.point, result.destroyed);
    this.playPunchSound(result.destroyed > 0);
    this.lastMessage = result.destroyed > 0
      ? `パンチ命中 · ${result.destroyed + blast.destroyed}ブロック破壊${blast.enemies > 0 ? ` · 敵${blast.enemies}体に爆発命中` : ""}${result.oreDestroyed > 0 ? ` · 鉱石+${result.oreDestroyed * 25}G` : ""}${comboText}`
      : result.bedrockHit ? "硬い岩盤だ。パンチが弾かれた" : "パンチ命中 · もう一度叩こう";
  }

  private startGroundPound(): void {
    const now = performance.now();
    if (this.gameState !== "playing" || this.groundPoundActive || now < this.groundPoundReadyAt) return;
    this.groundPoundActive = true;
    this.velocity.y = GAME_CONFIG.destruction.groundPoundVelocity;
    this.punchUntil = now + 260;
    this.lastMessage = "地面叩き · 着地で広範囲破壊";
    this.playGroundPoundSound();
  }

  private findEnemyInFront(direction: THREE.Vector3): EnemyState | null {
    let targetEnemy: EnemyState | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemyPool) {
      if (!enemy.mesh.visible) continue;
      const toEnemy = enemy.mesh.position.clone().sub(this.player.position);
      const distance = toEnemy.length();
      const along = direction.dot(toEnemy);
      const lateralSq = Math.max(0, distance * distance - along * along);
      // 見た目の拳幅を含めた判定。中心を正確に狙わなくても当たる。
      if (along < 0 || along > GAME_CONFIG.destruction.punchRange + 0.6 || lateralSq > 1.25 * 1.25 || distance >= nearest) continue;
      nearest = distance;
      targetEnemy = enemy;
    }
    return targetEnemy;
  }

  private damageEnemy(enemy: EnemyState, hitPoint: THREE.Vector3): void {
    const now = performance.now();
    enemy.hp -= 1;
    this.hitStopUntil = now + GAME_CONFIG.destruction.hitStop * 1000;
    this.shakeUntil = now + 150;
    this.shakeStrength = 0.1;
    this.showImpact(hitPoint, true);
    const knockback = enemy.mesh.position.clone().sub(this.player.position);
    knockback.y = 0;
    if (knockback.lengthSq() > 0.001) {
      const pushed = this.nextPosition.copy(enemy.mesh.position).addScaledVector(knockback.normalize(), GAME_CONFIG.enemies.knockback);
      if (!this.world.collidesAabb(pushed, 0.32, 0.8)) enemy.mesh.position.copy(pushed);
    }
    this.spawnDestructionEffects(enemy.mesh.position, enemy.hp <= 0 ? 4 : 2);
    this.playPunchSound(true);
    if (enemy.hp <= 0) {
      enemy.mesh.visible = false;
      this.spawnCoin(enemy.mesh.position);
      this.enemiesDefeatedTotal += 1;
      const comboText = this.registerCombo(1, 0, now);
      this.lastMessage = `敵を撃破 · コインを落とした${comboText}`;
    } else {
      this.lastMessage = `敵に命中 · 残りHP ${enemy.hp}`;
    }
  }

  private spawnCoin(position: THREE.Vector3): void {
    const coin = this.coinPool.find((candidate) => !candidate.active);
    if (!coin) return;
    coin.active = true;
    coin.mesh.visible = true;
    coin.mesh.position.copy(position);
    coin.mesh.position.y += 0.25;
  }

  private registerCombo(destroyed: number, oreDestroyed: number, now: number): string {
    if (destroyed <= 0 && oreDestroyed <= 0) return "";
    this.combo = now <= this.comboExpiresAt ? this.combo + 1 : 1;
    this.comboExpiresAt = now + 1600;
    const bonus = Math.max(0, this.combo - 1) * 5;
    this.coins += oreDestroyed * 25 + bonus;
    return this.combo >= 2 ? ` · COMBO x${this.combo}${bonus > 0 ? ` +${bonus}G` : ""}` : "";
  }

  private processOreExplosions(points: THREE.Vector3[], now: number): { destroyed: number; enemies: number } {
    let destroyed = 0;
    let enemies = 0;
    for (const point of points) {
      const result = this.world.destroySphere(point, GAME_CONFIG.destruction.blastRadius, GAME_CONFIG.destruction.maxBlastVoxels);
      destroyed += result.destroyed;
      this.destroyedTotal += result.destroyed;
      const comboText = this.registerCombo(result.destroyed, result.oreDestroyed, now);
      for (const enemy of this.enemyPool) {
        if (!enemy.mesh.visible || enemy.mesh.position.distanceTo(point) > GAME_CONFIG.destruction.blastRadius + 0.7) continue;
        this.damageEnemy(enemy, point);
        enemies += 1;
      }
      this.showImpact(point, true);
      this.spawnDestructionEffects(point, result.destroyed + 4, 2.4);
      this.playExplosionSound();
      if (comboText) this.lastMessage = `爆発連鎖${comboText}`;
    }
    return { destroyed, enemies };
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
    if (event.code === "Space") this.jump();
    if (event.code === "KeyF" || event.code === "KeyJ") this.punch();
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private readKeyboardInput(): void {
    if (this.keys.size === 0) return;
    this.moveInput.set(
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0),
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) - (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0),
    ).clampLength(0, 1);
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    event.preventDefault();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    if (localX > rect.width * 0.52) {
      this.cameraManuallyControlled = true;
      this.behindCameraTransition = 0;
      this.cameraPointerId = event.pointerId;
      this.cameraPointerX = event.clientX;
      this.cameraPointerY = event.clientY;
      this.renderer.domElement.setPointerCapture(event.pointerId);
      return;
    }
    const now = performance.now();
    if (now - this.lastTapAt < 280) return;
    this.lastTapAt = now;
    this.punch();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.cameraPointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - this.cameraPointerX;
    const dy = event.clientY - this.cameraPointerY;
    this.cameraYaw -= dx * GAME_CONFIG.camera.sensitivity;
    this.cameraPitch = Math.max(GAME_CONFIG.camera.minPitch, Math.min(GAME_CONFIG.camera.maxPitch, this.cameraPitch + dy * GAME_CONFIG.camera.sensitivity));
    this.cameraPointerX = event.clientX;
    this.cameraPointerY = event.clientY;
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.cameraPointerId === event.pointerId) {
      this.cameraPointerId = null;
      // カメラ操作を終えた次の移動で、必ず背後追従へ復帰する。
      this.cameraManuallyControlled = false;
      this.movementInputActive = false;
    }
  };

  private collides(position: THREE.Vector3): boolean {
    return this.world.collidesAabb(position, GAME_CONFIG.player.radius, GAME_CONFIG.player.height);
  }

  private movePlayer(delta: number): void {
    this.readKeyboardInput();
    const inputLength = this.moveInput.length();
    // 背後カメラは移動中ずっと向きを書き換えない。毎フレーム更新すると、
    // 移動方向→プレイヤー回転→カメラ回転→移動方向の循環で画面が回転する。
    if (!this.cameraManuallyControlled) {
      if (inputLength > 0.1 && !this.movementInputActive) {
        this.cameraYaw = this.player.rotation.y + Math.PI;
        this.behindCameraTransition = 1;
      }
      this.movementInputActive = inputLength > 0.1;
    }
    const desired = this.desiredMove.set(
      Math.cos(this.cameraYaw) * this.moveInput.x + Math.sin(this.cameraYaw) * this.moveInput.y,
      0,
      -Math.sin(this.cameraYaw) * this.moveInput.x + Math.cos(this.cameraYaw) * this.moveInput.y,
    );
    if (inputLength > 0.01) desired.normalize().multiplyScalar(GAME_CONFIG.player.moveSpeed * Math.min(1, inputLength));
    else desired.set(0, 0, 0);
    const control = this.grounded ? 1 : GAME_CONFIG.player.airControl;
    const blend = Math.min(1, GAME_CONFIG.player.acceleration * control * delta);
    this.velocity.x += (desired.x - this.velocity.x) * blend;
    this.velocity.z += (desired.z - this.velocity.z) * blend;
    if (inputLength < 0.01 && this.grounded) {
      this.velocity.x *= Math.max(0, 1 - 12 * delta);
      this.velocity.z *= Math.max(0, 1 - 12 * delta);
    }
    this.velocity.y -= GAME_CONFIG.player.gravity * delta;
    const subSteps = Math.max(1, Math.ceil(Math.max(Math.abs(this.velocity.x), Math.abs(this.velocity.y), Math.abs(this.velocity.z)) * delta / 0.18));
    const stepDelta = delta / subSteps;
    this.grounded = false;
    for (let step = 0; step < subSteps; step += 1) {
      this.moveHorizontal(this.velocity.x * stepDelta, this.velocity.z * stepDelta);
      this.moveVertical(this.velocity.y * stepDelta);
    }
    this.snapToGround();
    if (this.grounded) this.coyoteUntil = performance.now() + 100;
    if (this.jumpBufferedUntil > performance.now() && this.grounded) {
      this.velocity.y = GAME_CONFIG.player.jumpVelocity;
      this.grounded = false;
      this.jumpBufferedUntil = 0;
      this.lastMessage = "ジャンプ";
    }
    if (inputLength > 0.1) {
      this.player.rotation.y = Math.atan2(desired.x, desired.z);
    }
    if (this.player.position.y < -4 || this.player.position.x < 1 || this.player.position.z < 1 || this.player.position.x > this.world.width - 1 || this.player.position.z > this.world.depth - 1) {
      this.respawn();
    }
  }

  private moveHorizontal(dx: number, dz: number): void {
    const tryAxis = (axis: "x" | "z", amount: number) => {
      if (Math.abs(amount) < 0.0001) return;
      const next = this.nextPosition.copy(this.player.position);
      next[axis] += amount;
      if (!this.collides(next)) {
        this.player.position.copy(next);
        return;
      }
      if (!this.grounded) return;
      const stepped = this.steppedPosition.copy(next);
      stepped.y += GAME_CONFIG.player.stepHeight;
      if (!this.collides(stepped)) this.player.position.copy(stepped);
    };
    tryAxis("x", dx);
    tryAxis("z", dz);
  }

  private moveVertical(amount: number): void {
    if (Math.abs(amount) < 0.0001) return;
    const next = this.nextPosition.copy(this.player.position);
    next.y += amount;
    if (!this.collides(next)) {
      this.player.position.copy(next);
      return;
    }
    if (amount < 0) {
      const landing = this.nextPosition.copy(this.player.position);
      for (let i = 0; i < 48; i += 1) {
        landing.y -= 0.025;
        if (this.collides(landing)) {
          this.player.position.y = landing.y + 0.03;
          break;
        }
      }
      this.grounded = true;
      this.coyoteUntil = performance.now() + 100;
      this.velocity.y = 0;
      if (this.groundPoundActive) this.finishGroundPound();
    } else {
      this.velocity.y = 0;
    }
  }

  private snapToGround(): void {
    if (this.groundPoundActive) return;
    const probe = this.nextPosition.copy(this.player.position);
    for (let i = 0; i < 48; i += 1) {
      probe.y -= 0.025;
      if (this.collides(probe)) {
        this.player.position.y = probe.y + 0.03;
        this.velocity.y = 0;
        this.grounded = true;
        this.coyoteUntil = performance.now() + 100;
        return;
      }
    }
  }

  private finishGroundPound(): void {
    this.groundPoundActive = false;
    this.groundPoundReadyAt = performance.now() + GAME_CONFIG.destruction.groundPoundCooldown * 1000;
    const point = new THREE.Vector3(this.player.position.x, this.player.position.y - 0.72, this.player.position.z);
    const result = this.world.destroySphere(point, GAME_CONFIG.destruction.groundPoundRadius, GAME_CONFIG.destruction.maxGroundPoundVoxels);
    this.destroyedTotal += result.destroyed;
    const blast = this.processOreExplosions(result.orePoints, performance.now());
    let enemiesHit = 0;
    for (const enemy of this.enemyPool) {
      if (!enemy.mesh.visible || enemy.mesh.position.distanceTo(point) > GAME_CONFIG.destruction.groundPoundRadius + 0.35) continue;
      enemiesHit += 1;
      enemy.hp -= 1;
      this.spawnDestructionEffects(enemy.mesh.position, enemy.hp <= 0 ? 4 : 2, 1.2);
      if (enemy.hp <= 0) {
        enemy.mesh.visible = false;
        this.spawnCoin(enemy.mesh.position);
      }
    }
    const now = performance.now();
    this.hitStopUntil = now + 80;
    this.shakeUntil = now + 300;
    this.shakeStrength = result.destroyed > 0 ? 0.28 : 0.12;
    this.showImpact(point, true);
    this.spawnDestructionEffects(point, result.destroyed, 2.2);
    this.playGroundPoundSound();
    this.lastMessage = result.destroyed > 0 || enemiesHit > 0 || blast.destroyed > 0
      ? `地面叩き · ${result.destroyed + blast.destroyed}ブロック破壊${enemiesHit + blast.enemies > 0 ? ` · 敵${enemiesHit + blast.enemies}体に命中` : ""}`
      : result.bedrockHit ? "地面叩き · 岩盤に阻まれた" : "地面叩き · 着地の衝撃だけが響いた";
  }

  private respawn(): void {
    this.player.position.set(GAME_CONFIG.player.spawn.x, GAME_CONFIG.player.spawn.y, GAME_CONFIG.player.spawn.z);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.lastMessage = "落下したため入口へ戻りました";
  }

  private updateEnemies(delta: number): void {
    if (this.gameState !== "playing") return;
    for (const enemy of this.enemyPool) {
      if (!enemy.mesh.visible) continue;
      enemy.hitCooldown = Math.max(0, enemy.hitCooldown - delta);
      const toPlayer = this.enemyDirection.copy(this.player.position).sub(enemy.mesh.position);
      toPlayer.y = 0;
      const distance = toPlayer.length();
      if (distance <= GAME_CONFIG.enemies.contactRange) {
        if (enemy.hitCooldown <= 0) {
          enemy.hitCooldown = GAME_CONFIG.enemies.contactCooldown;
          this.damagePlayer(enemy.mesh.position);
        }
        continue;
      }
      if (distance < 0.01) continue;
      toPlayer.normalize();
      const amount = GAME_CONFIG.enemies.moveSpeed * delta;
      const next = this.nextPosition.copy(enemy.mesh.position);
      if (enemy.type === "zigzag") {
        const weave = Math.sin(performance.now() * 0.003 + enemy.phase) * amount * 2.2;
        next.x += -toPlayer.z * weave;
        next.z += toPlayer.x * weave;
      }
      next.addScaledVector(toPlayer, amount);
      if (!this.world.collidesAabb(next, 0.32, 0.8)) {
        enemy.mesh.position.copy(next);
      } else {
        const alternate = this.enemyAlternate.copy(enemy.mesh.position);
        alternate.x -= toPlayer.z * amount;
        alternate.z += toPlayer.x * amount;
        if (!this.world.collidesAabb(alternate, 0.32, 0.8)) enemy.mesh.position.copy(alternate);
      }
      enemy.mesh.rotation.y += delta * 2.2;
      enemy.mesh.position.y = this.player.position.y + Math.sin(performance.now() * 0.004 + enemy.phase) * 0.08;
    }
  }

  private damagePlayer(source: THREE.Vector3): void {
    if (this.gameState !== "playing") return;
    this.hp = Math.max(0, this.hp - GAME_CONFIG.enemies.contactDamage);
    this.shakeUntil = performance.now() + 240;
    this.shakeStrength = 0.18;
    const knockback = this.player.position.clone().sub(source);
    knockback.y = 0;
    if (knockback.lengthSq() > 0.001) this.player.position.addScaledVector(knockback.normalize(), 0.35);
    this.snapToGround();
    this.lastMessage = this.hp > 0 ? `被敵人にぶつかった · HP ${this.hp}/${GAME_CONFIG.player.maxHp}` : "力尽きた · リセットで再挑戦";
    if (this.hp <= 0) this.gameState = "gameover";
  }

  private updateCoins(delta: number): void {
    for (const coin of this.coinPool) {
      if (!coin.active) continue;
      coin.mesh.rotation.y += delta * 4.5;
      coin.mesh.position.y += Math.sin(performance.now() * 0.005 + coin.mesh.position.x) * delta * 0.12;
      if (coin.mesh.position.distanceTo(this.player.position) <= GAME_CONFIG.items.pickupRange) {
        coin.active = false;
        coin.mesh.visible = false;
        this.coins += GAME_CONFIG.items.coinValue;
        this.lastMessage = `コイン取得 · ${this.coins}G`;
      }
    }
  }

  private updateGoal(delta: number): void {
    this.goalMesh.rotation.z += delta * 1.4;
    this.goalMesh.position.y = this.world.goalPoint.y + Math.sin(performance.now() * 0.003) * 0.12;
    const depthProgress = Math.max(0, this.player.position.z - this.world.spawnPoint.z);
    const goalReady = depthProgress >= GAME_CONFIG.goal.requiredDepth
      && this.destroyedTotal >= GAME_CONFIG.goal.requiredDestroyed
      && this.enemiesDefeatedTotal >= GAME_CONFIG.goal.requiredEnemiesDefeated;
    const goalMaterial = this.goalMesh.material as THREE.MeshBasicMaterial;
    goalMaterial.color.setHex(goalReady ? 0x75e3d6 : 0x718096);
    goalMaterial.opacity = goalReady ? 0.9 : 0.38;
    if (this.gameState === "playing" && this.player.position.distanceTo(this.goalMesh.position) <= GAME_CONFIG.goal.pickupRange) {
      if (goalReady) {
        this.gameState = "cleared";
        this.lastMessage = `地下ゴール到達 · ${this.coins}G獲得`;
      } else {
        this.lastMessage = `ゴール封鎖 · 深度 ${Math.floor(depthProgress)}/${GAME_CONFIG.goal.requiredDepth} · 破壊 ${this.destroyedTotal}/${GAME_CONFIG.goal.requiredDestroyed} · 撃破 ${this.enemiesDefeatedTotal}/${GAME_CONFIG.goal.requiredEnemiesDefeated}`;
      }
    }
  }

  private updateCamera(delta: number): void {
    this.target.copy(this.player.position).y += GAME_CONFIG.camera.height;
    const horizontal = Math.cos(this.cameraPitch) * GAME_CONFIG.camera.distance;
    this.desiredCamera.set(
      this.target.x + Math.sin(this.cameraYaw) * horizontal,
      this.target.y + Math.sin(this.cameraPitch) * GAME_CONFIG.camera.distance,
      this.target.z + Math.cos(this.cameraYaw) * horizontal,
    );
    this.cameraDirection.copy(this.desiredCamera).sub(this.target);
    const distance = this.cameraDirection.length();
    this.cameraDirection.normalize();
    this.cameraRay.set(this.target, this.cameraDirection);
    const obstacle = this.world.raycast(this.cameraRay)[0];
    if (obstacle && obstacle.distance < distance) this.desiredCamera.copy(this.target).addScaledVector(this.cameraDirection, Math.max(1.2, obstacle.distance - 0.35));
    const cameraFollowRate = this.behindCameraTransition > 0 ? 28 : 12;
    this.camera.position.lerp(this.desiredCamera, Math.min(1, delta * cameraFollowRate));
    this.behindCameraTransition = Math.max(0, this.behindCameraTransition - delta * 4);
    const now = performance.now();
    if (now < this.shakeUntil) {
      const falloff = (this.shakeUntil - now) / 180;
      this.camera.position.x += Math.sin(now * 0.11) * this.shakeStrength * falloff;
      this.camera.position.y += Math.cos(now * 0.14) * this.shakeStrength * falloff;
    }
    this.camera.lookAt(this.target);
  }

  private showImpact(point: THREE.Vector3, strong: boolean): void {
    const material = this.impactRing.material as THREE.MeshBasicMaterial;
    this.impactRing.position.copy(point);
    this.impactRing.scale.setScalar(strong ? 1.2 : 0.8);
    this.impactStartedAt = performance.now();
    this.impactRing.visible = true;
    material.opacity = 0.9;
    this.impactRing.lookAt(this.camera.position);
  }

  private spawnDestructionEffects(point: THREE.Vector3, destroyed: number, intensity = 1): void {
    const debrisCount = Math.min(GAME_CONFIG.effects.maxDebris, Math.max(5, Math.round(destroyed * 2 * intensity)));
    let spawned = 0;
    for (const particle of this.debrisPool) {
      if (particle.mesh.visible) continue;
      particle.mesh.visible = true;
      particle.mesh.position.copy(point);
      particle.mesh.position.x += (Math.random() - 0.5) * 0.45;
      particle.mesh.position.y += (Math.random() - 0.5) * 0.45;
      particle.mesh.position.z += (Math.random() - 0.5) * 0.45;
      particle.velocity.set((Math.random() - 0.5) * 3.2, 1.2 + Math.random() * 2.6, (Math.random() - 0.5) * 3.2);
      particle.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      particle.maxLife = GAME_CONFIG.effects.debrisLifetime * (0.65 + Math.random() * 0.55);
      particle.life = particle.maxLife;
      spawned += 1;
      if (spawned >= debrisCount) break;
    }
    let dustSpawned = 0;
    for (const particle of this.dustPool) {
      if (particle.mesh.visible) continue;
      particle.mesh.visible = true;
      particle.mesh.position.copy(point);
      particle.velocity.set((Math.random() - 0.5) * 0.8, 0.35 + Math.random() * 0.7, (Math.random() - 0.5) * 0.8);
      particle.maxLife = 0.35 + Math.random() * 0.25;
      particle.life = particle.maxLife;
      particle.mesh.scale.setScalar(0.6 + Math.random() * 0.45);
      dustSpawned += 1;
      if (dustSpawned >= Math.min(GAME_CONFIG.effects.maxDust, Math.round(8 * intensity))) break;
    }
  }

  private updateEffects(delta: number): void {
    for (const particle of this.debrisPool) {
      if (!particle.mesh.visible) continue;
      particle.life -= delta;
      particle.velocity.y -= 8.5 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += particle.spin.x * delta;
      particle.mesh.rotation.y += particle.spin.y * delta;
      particle.mesh.rotation.z += particle.spin.z * delta;
      if (particle.life <= 0) particle.mesh.visible = false;
    }
    for (const particle of this.dustPool) {
      if (!particle.mesh.visible) continue;
      particle.life -= delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.scale.multiplyScalar(1 + delta * 1.8);
      this.dustMaterial.opacity = Math.max(0.04, 0.42 * (particle.life / particle.maxLife));
      if (particle.life <= 0) particle.mesh.visible = false;
    }
  }

  private updatePlayerAnimation(now: number): void {
    this.playerBody.scale.set(1, 1, 1);
    this.leftArm.position.set(-0.27, 0.72, 0.18);
    this.rightArm.position.set(0.27, 0.72, 0.18);
    this.leftHand.position.set(-0.3, 0.68, 0.42);
    this.rightHand.position.set(0.3, 0.68, 0.42);
    if (this.groundPoundActive) {
      const progress = Math.min(1, Math.max(0, (now - (this.punchUntil - 260)) / 260));
      this.playerBody.scale.set(1.15 - progress * 0.15, 0.88 + progress * 0.12, 1.15 - progress * 0.15);
      this.playerBody.rotation.x = progress * 0.4;
      this.leftHand.position.y = 0.55;
      this.rightHand.position.y = 0.55;
      return;
    }
    const remaining = this.punchUntil - now;
    if (remaining > 0) {
      const progress = 1 - remaining / 240;
      const leftSwing = Math.sin(Math.min(1, progress * 2) * Math.PI);
      const rightSwing = Math.sin(Math.max(0, progress * 2 - 1) * Math.PI);
      const swing = Math.max(leftSwing, rightSwing);
      this.playerBody.rotation.x = -swing * 0.72;
      this.playerBody.position.z = swing * 0.08;
      this.leftArm.position.z += leftSwing * 0.34;
      this.rightArm.position.z += rightSwing * 0.34;
      this.leftHand.position.z += leftSwing * 0.56;
      this.rightHand.position.z += rightSwing * 0.56;
      this.leftHand.position.x -= leftSwing * 0.12;
      this.rightHand.position.x += rightSwing * 0.12;
      this.leftHand.scale.setScalar(1 + leftSwing * 0.18);
      this.rightHand.scale.setScalar(1 + rightSwing * 0.18);
      return;
    }
    this.playerBody.rotation.x = 0;
    this.playerBody.position.z = 0;
  }

  private playPunchSound(hit: boolean): void {
    if (typeof window === "undefined") return;
    const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = this.audioContext ?? new AudioCtor();
    this.audioContext = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = hit ? "square" : "triangle";
    oscillator.frequency.setValueAtTime(hit ? 150 : 90, start);
    oscillator.frequency.exponentialRampToValueAtTime(hit ? 70 : 55, start + 0.09);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(hit ? 0.08 : 0.035, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.14);
  }

  private playGroundPoundSound(): void {
    if (typeof window === "undefined") return;
    const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = this.audioContext ?? new AudioCtor();
    this.audioContext = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(105, start);
    oscillator.frequency.exponentialRampToValueAtTime(34, start + 0.24);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.13, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.3);
  }

  private playExplosionSound(): void {
    if (typeof window === "undefined") return;
    const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = this.audioContext ?? new AudioCtor();
    this.audioContext = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(180, start);
    oscillator.frequency.exponentialRampToValueAtTime(38, start + 0.22);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(start); oscillator.stop(start + 0.25);
  }

  reset(): void {
    this.world.reset();
    this.player.position.set(this.world.spawnPoint.x, this.world.spawnPoint.y, this.world.spawnPoint.z);
    this.goalMesh.position.set(this.world.goalPoint.x, this.world.goalPoint.y, this.world.goalPoint.z);
    this.velocity.set(0, 0, 0);
    this.moveInput.set(0, 0);
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.25;
    this.cameraManuallyControlled = false;
    this.movementInputActive = false;
    this.behindCameraTransition = 0;
    this.groundPoundReadyAt = 0;
    this.groundPoundActive = false;
    this.jumpBufferedUntil = 0;
    this.coyoteUntil = performance.now() + 180;
    this.destroyedTotal = 0;
    this.enemiesDefeatedTotal = 0;
    this.combo = 0;
    this.comboExpiresAt = 0;
    this.hp = GAME_CONFIG.player.maxHp;
    this.coins = 0;
    this.gameState = "playing";
    this.snapToGround();
    const spawnPoints = this.getEnemySpawnPoints();
    this.enemyPool.forEach((enemy, index) => {
      enemy.mesh.position.copy(spawnPoints[index] ?? spawnPoints[0]);
      enemy.mesh.visible = index < this.getEnemyActiveCount();
      enemy.hp = GAME_CONFIG.enemies.hp;
      enemy.hitCooldown = 0;
    });
    this.coinPool.forEach((coin) => { coin.active = false; coin.mesh.visible = false; });
    this.getRewardCoinPoints().forEach((point, index) => {
      const coin = this.coinPool[index];
      if (!coin) return;
      coin.active = true;
      coin.mesh.visible = true;
      coin.mesh.position.copy(point);
    });
    this.lastMessage = "深部へ掘り、敵2体を倒してゴールへ";
  }

  switchStage(source: StageSource): void {
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.world = new VoxelWorld(source);
    this.scene.add(this.world.group);
    this.updateWorldRenderingDistance();
    this.reset();
    if (source.id === "procedural") {
      const metadata = this.world.metadata;
      const seed = metadata?.seed ?? "unknown";
      const caveCount = metadata?.caves ?? 0;
      const structureCount = metadata?.structures ?? 0;
      this.lastMessage = `生成完了 · ${seed} · 洞窟${caveCount} · 構造物${structureCount} · 深部のゴールを目指そう`;
    } else this.lastMessage = "通常ステージを開始";
  }

  private animate = () => {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();
    this.world.processRebuildQueue();
    this.movePlayer(delta);
    this.updateEnemies(delta);
    this.updateCoins(delta);
    this.updateGoal(delta);
    this.player.visible = true;
    this.updatePlayerAnimation(now);
    this.updateCamera(delta);
    this.updateEffects(delta);
    if (this.impactRing.visible) {
      const age = (performance.now() - this.impactStartedAt) / 260;
      const material = this.impactRing.material as THREE.MeshBasicMaterial;
      this.impactRing.scale.setScalar(this.impactRing.scale.x + delta * 4);
      material.opacity = Math.max(0, 0.9 - age * 1.2);
      if (material.opacity <= 0) this.impactRing.visible = false;
    }
    if (now >= this.hitStopUntil) this.renderer.render(this.scene, this.camera);
    this.statsTimer += delta;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      const info = this.renderer.info;
      this.onStats({
        fps: delta > 0 ? Math.round(1 / delta) : 0,
        frameMs: Math.round(delta * 1000 * 10) / 10,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        chunks: this.world.chunkCount,
        pendingChunks: this.world.pendingRebuilds,
        destroyed: this.destroyedTotal,
        player: `${this.player.position.x.toFixed(1)}, ${this.player.position.y.toFixed(1)}, ${this.player.position.z.toFixed(1)}`,
        grounded: this.grounded,
        hp: this.hp,
        maxHp: GAME_CONFIG.player.maxHp,
        enemies: this.enemyPool.filter((enemy) => enemy.mesh.visible).length,
        coins: this.coins,
        status: this.gameState,
        lastMessage: this.lastMessage,
        stageMode: this.world.metadata?.seed ? "procedural" : "handcrafted",
        seed: this.world.metadata?.seed ?? "—",
        generatorVersion: this.world.metadata?.generatorVersion ?? 0,
        generationMs: this.world.metadata?.generationMs ?? 0,
        caves: this.world.metadata?.caves ?? 0,
        structures: this.world.metadata?.structures ?? 0,
        jigsawPieces: this.world.metadata?.jigsawPieces ?? 0,
        reachabilityCost: this.world.metadata?.reachability?.cost ?? 0,
        biomeCounts: Object.entries(this.world.metadata?.biomeCounts ?? {}).map(([key, value]) => `${key}:${value}`).join(" · "),
      });
    }
    this.animationFrame = window.requestAnimationFrame(this.animate);
  };

  dispose(): void {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("orientationchange", this.resize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.handlePointerUp);
    this.renderer.domElement.removeEventListener("pointercancel", this.handlePointerUp);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.world.dispose();
    this.playerBody.geometry.dispose();
    (this.playerBody.material as THREE.Material).dispose();
    this.impactRing.geometry.dispose();
    (this.impactRing.material as THREE.Material).dispose();
    this.debrisGeometry.dispose();
    this.dustGeometry.dispose();
    this.handGeometry.dispose();
    this.armGeometry.dispose();
    this.handMaterial.dispose();
    this.debrisMaterial.dispose();
    this.debrisRockMaterial.dispose();
    this.dustMaterial.dispose();
    this.enemyGeometry.dispose();
    this.enemyMaterial.dispose();
    this.coinGeometry.dispose();
    this.coinMaterial.dispose();
    this.goalMesh.geometry.dispose();
    (this.goalMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
