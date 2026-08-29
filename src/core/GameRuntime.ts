import * as THREE from "three";
import { GAME_CONFIG } from "./Settings";
import { VoxelWorld } from "../world/VoxelWorld";
import type { StageSource } from "../stages/StageSource";
import { VoxelPlayerCollision } from "../player/VoxelPlayerCollision";
import { PlayerController } from "../player/PlayerController";
import { PlayerCombat } from "../combat/PlayerCombat";
import { DestructionSystem, type DestructionResult, type DestructionSource } from "../destruction/DestructionSystem";
import { InputManager } from "../input/InputManager";
import { CameraController } from "../camera/CameraController";
import { EnemyManager, type EnemyDamageResult, type EnemyState } from "../enemies/EnemyManager";
import { ItemManager, type ItemPreviewState } from "../items/ItemManager";
import { RewardSystem } from "../rewards/RewardSystem";
import { EffectManager } from "../effects/EffectManager";
import { AudioManager } from "../audio/AudioManager";
import { GameSession } from "../game/GameSession";
import { RunDirector, type UpgradeId } from "../game/RunDirector";
import type { GameViewState } from "../ui/GameViewState";

export interface RuntimeFrame {
  shouldRender: boolean;
}

export class GameRuntime {
  readonly playerController: PlayerController;
  readonly playerCombat: PlayerCombat;
  private world: VoxelWorld;
  private readonly scene: THREE.Scene;
  private readonly player: THREE.Group;
  private readonly onMessage: (message: string) => void;
  private readonly cameraController: CameraController;
  private readonly enemyManager: EnemyManager;
  private readonly itemManager: ItemManager;
  private readonly session: GameSession;
  private readonly runDirector: RunDirector;
  private readonly rewardSystem: RewardSystem;
  private readonly effectManager: EffectManager;
  private readonly audioManager: AudioManager;
  private readonly destructionSystem: DestructionSystem;
  private readonly inputManager: InputManager;
  private readonly goalMesh: THREE.Mesh;
  private playerCollision: VoxelPlayerCollision;
  private movementInputActive = false;
  private lastMessage = "破壊をつないでMomentumを上げ、深部へ潜れ";
  private lastBreakMode = false;
  private runEndRecorded = false;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    player: THREE.Group,
    raycaster: THREE.Raycaster,
    world: VoxelWorld,
    onMessage: (message: string) => void,
  ) {
    this.scene = scene;
    this.player = player;
    this.world = world;
    this.onMessage = (message) => {
      this.lastMessage = message;
      onMessage(message);
    };
    this.cameraController = new CameraController(camera, world);
    this.effectManager = new EffectManager(scene, camera);
    this.audioManager = new AudioManager();
    this.session = new GameSession(GAME_CONFIG.player.maxHp);
    this.runDirector = new RunDirector();
    this.destructionSystem = new DestructionSystem(world);
    this.rewardSystem = new RewardSystem(this.session);
    this.itemManager = new ItemManager(scene, world, {
      onCoinCollected: (value) => this.setMessage(this.rewardSystem.collectCoin(value)),
    });
    this.enemyManager = new EnemyManager(scene, world, {
      onPlayerContact: (source, damage) => this.damagePlayer(source, damage),
      onEnemyDamaged: (result) => this.handleEnemyDamage(result),
      onEnemyTerrainImpact: (position, radius, strength) => this.handleEnemyTerrainImpact(position, radius, strength),
    });
    this.playerCollision = this.createPlayerCollision();
    this.playerController = new PlayerController(player, world, this.playerCollision, {
      onMessage: (message) => this.setMessage(message),
      onGroundPoundLanded: () => this.finishGroundPound(),
    });
    this.playerCombat = new PlayerCombat(player, world, raycaster, this.enemyManager.enemies, {
      onEnemyHit: (enemy, hitPoint) => {
        const modifiers = this.runDirector.getModifiers();
        this.enemyManager.damage(enemy, this.player.position, hitPoint, modifiers.enemyDamage, modifiers.enemyKnockback);
      },
      onTerrainHit: (point, now) => this.handleTerrainPunch(point, now),
      onGroundPoundStart: () => this.playerController.beginGroundPound(),
      onMessage: (message) => this.setMessage(message),
      playPunchSound: (hit) => this.audioManager.playPunch(hit),
      playGroundPoundSound: () => this.audioManager.playGroundPound(),
    });
    this.inputManager = new InputManager({
      onJump: () => this.jump(),
      onPunch: () => this.punch(),
      onCameraStart: () => this.cameraController.beginManual(),
      onCameraMove: (deltaX, deltaY) => this.cameraController.rotate(deltaX, deltaY),
      onCameraEnd: () => this.cameraController.endManual(),
    });
    this.goalMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.12, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x75e3d6, transparent: true, opacity: 0.9 }),
    );
    this.goalMesh.name = "stage-goal";
    this.goalMesh.rotation.x = Math.PI / 2;
    scene.add(this.goalMesh);
  }

  get currentWorld(): VoxelWorld { return this.world; }
  get playerObject(): THREE.Group { return this.player; }
  get cameraObject(): THREE.PerspectiveCamera { return this.cameraController.cameraObject; }
  get enemyStates(): readonly EnemyState[] { return this.enemyManager.enemies; }
  get coinStates(): readonly ItemPreviewState[] { return this.itemManager.previewCoins; }
  get goalObject(): THREE.Mesh { return this.goalMesh; }
  get attackAnimationUntil(): number { return this.playerCombat.animationUntil; }
  get isGroundPoundActive(): boolean { return this.playerCombat.isGroundPoundActive; }
  get breakVisualStrength(): number { return this.runDirector.getBreakVisualStrength(); }

  private createPlayerCollision(): VoxelPlayerCollision {
    return new VoxelPlayerCollision(
      this.world,
      GAME_CONFIG.player.radius,
      GAME_CONFIG.player.height,
      GAME_CONFIG.player.stepHeight,
      GAME_CONFIG.player.groundSnapDistance,
      GAME_CONFIG.player.groundProbeDistance,
    );
  }

  attachInput(target: Window, canvas: HTMLElement): void {
    this.inputManager.attach(target, canvas);
  }

  detachInput(): void {
    this.inputManager.detach();
  }

  setMoveInput(x: number, y: number): void {
    if (this.runDirector.isUpgradePending) return;
    this.inputManager.setMoveInput(x, y);
  }

  jump(): void {
    if (this.session.state.state !== "playing" || this.runDirector.isUpgradePending) return;
    this.audioManager.unlock();
    this.playerController.requestJump();
  }

  punch(): void {
    if (this.session.state.state !== "playing" || this.runDirector.isUpgradePending) return;
    this.audioManager.unlock();
    this.playerCombat.punch(this.playerController.grounded);
  }

  selectUpgrade(id: UpgradeId): void {
    const choice = this.runDirector.getUpgradeChoice(id);
    if (!choice || !this.runDirector.selectUpgrade(id)) return;
    if (id === "second-wind") this.session.heal(5);
    this.applyRunModifiers();
    this.setMessage(`${choice.title} 取得 · 破壊を続けろ`);
  }

  initialize(): void {
    this.reset(false);
  }

  reset(regenerateWorld = true): void {
    if (regenerateWorld) this.world.reset();
    this.player.position.set(this.world.spawnPoint.x, this.world.spawnPoint.y, this.world.spawnPoint.z);
    this.goalMesh.position.set(this.world.goalPoint.x, this.world.goalPoint.y, this.world.goalPoint.z);
    this.session.reset();
    this.runDirector.reset(this.world.metadata?.seed ?? "handcrafted", this.world.metadata?.difficulty ?? "normal");
    this.runEndRecorded = false;
    this.lastBreakMode = false;
    this.playerController.reset();
    this.playerCombat.reset();
    this.applyRunModifiers();
    this.inputManager.setMoveInput(0, 0);
    this.cameraController.reset();
    this.movementInputActive = false;
    this.playerController.snapToGround(true);
    this.enemyManager.setDanger(1, 1);
    this.enemyManager.reset();
    this.itemManager.reset();
    this.setMessage("破壊をつないでMomentumを上げ、深部へ潜れ");
  }

  switchStage(source: StageSource): VoxelWorld {
    const previousWorld = this.world;
    this.world = new VoxelWorld(source);
    this.playerCollision = this.createPlayerCollision();
    this.playerController.setWorld(this.world, this.playerCollision);
    this.playerCombat.setWorld(this.world);
    this.destructionSystem.setWorld(this.world);
    this.cameraController.setWorld(this.world);
    this.enemyManager.setWorld(this.world);
    this.itemManager.setWorld(this.world);
    this.reset();
    if (source.id === "procedural") {
      const metadata = this.world.metadata;
      this.setMessage(
        `DIVE START · ${metadata?.seed ?? "unknown"} · 洞窟${metadata?.caves ?? 0} · 破壊ルートを作れ`,
      );
    } else {
      this.setMessage("通常ステージ · Momentum RUN開始");
    }
    return previousWorld;
  }

  update(delta: number, now: number): RuntimeFrame {
    this.world.processRebuildQueue();
    const state = this.session.state;
    const depthRatio = this.depthProgressRatio();

    if (state.state === "playing") {
      if (this.runDirector.isUpgradePending) {
        this.inputManager.setMoveInput(0, 0);
        this.runDirector.update(0, depthRatio, state.elapsedSeconds);
      } else {
        this.session.update(delta);
        this.runDirector.update(delta, depthRatio, this.session.state.elapsedSeconds);
        this.applyRunModifiers();
        const run = this.runDirector.snapshot;
        this.enemyManager.setDanger(run.danger, run.depthTier);
        this.maybeSpawnBoss();
        this.updatePlayer(delta);
        this.enemyManager.update(delta, this.player);
      }
    }

    this.itemManager.update(delta, this.player);
    this.updateGoal(delta);
    this.syncRunTransitions();
    this.cameraController.update(
      delta,
      this.player.position,
      this.player.rotation.y,
      this.movementInputActive,
      this.playerController.groundPoundActive,
      now,
    );
    this.effectManager.update(delta, now);

    if (!this.runEndRecorded && this.session.state.state === "gameover") {
      this.runDirector.finishRun(false);
      this.runEndRecorded = true;
    }
    return { shouldRender: !this.effectManager.isHitStopped(now) };
  }

  getViewState(info: { calls: number; triangles: number }, fps: number, frameMs: number): GameViewState {
    const metadata = this.world.metadata;
    const state = this.session.state;
    const run = this.runDirector.snapshot;
    return {
      fps,
      frameMs,
      drawCalls: info.calls,
      triangles: info.triangles,
      chunks: this.world.chunkCount,
      pendingChunks: this.world.pendingRebuilds,
      destroyed: state.destroyed,
      enemiesDefeated: state.enemiesDefeated,
      score: state.score,
      combo: state.combo,
      elapsedSeconds: state.elapsedSeconds,
      gameState: state.state,
      player: `${this.player.position.x.toFixed(1)}, ${this.player.position.y.toFixed(1)}, ${this.player.position.z.toFixed(1)}`,
      grounded: this.playerController.grounded,
      velocityY: Math.round(this.playerController.velocityY * 100) / 100,
      hp: state.hp,
      maxHp: state.maxHp,
      enemies: this.enemyManager.activeCount,
      coins: this.rewardSystem.coins,
      status: state.state === "cleared" ? "cleared" : state.state === "gameover" ? "gameover" : "playing",
      lastMessage: this.lastMessage,
      stageMode: metadata?.seed ? "procedural" : "handcrafted",
      seed: metadata?.seed ?? "—",
      generatorVersion: metadata?.generatorVersion ?? 0,
      generationMs: metadata?.generationMs ?? 0,
      caves: metadata?.caves ?? 0,
      structures: metadata?.structures ?? 0,
      jigsawPieces: metadata?.jigsawPieces ?? 0,
      reachabilityCost: metadata?.reachability?.cost ?? 0,
      biomeCounts: Object.entries(metadata?.biomeCounts ?? {}).map(([key, value]) => `${key}:${value}`).join(" · "),
      momentum: run.momentum,
      breakMode: run.breakMode,
      breakSeconds: run.breakSeconds,
      depthTier: run.depthTier,
      danger: run.danger,
      runLevel: run.runLevel,
      runXp: run.runXp,
      nextUpgradeXp: run.nextUpgradeXp,
      pendingUpgrade: run.pendingUpgrade,
      upgradeChoices: run.upgradeChoices,
      upgrades: run.upgrades,
      bossActive: run.bossActive,
      bossDefeated: run.bossDefeated,
      bossHp: run.bossHp,
      bossMaxHp: run.bossMaxHp,
      metaCores: run.meta.cores,
      legacyRank: run.meta.legacyRank,
      bestDepth: run.meta.bestDepth,
      runPace: run.pace,
      targetSeconds: run.targetSeconds,
    };
  }

  dispose(): void {
    this.inputManager.detach();
    this.world.dispose();
    this.effectManager.dispose();
    this.audioManager.dispose();
    this.enemyManager.dispose();
    this.itemManager.dispose();
    this.goalMesh.geometry.dispose();
    (this.goalMesh.material as THREE.Material).dispose();
    this.scene.remove(this.goalMesh);
  }

  private setMessage(message: string): void {
    this.lastMessage = message;
    this.onMessage(message);
  }

  private applyRunModifiers(): void {
    const modifiers = this.runDirector.getModifiers();
    this.playerController.setRuntimeModifiers({
      moveSpeed: modifiers.moveSpeed,
      acceleration: modifiers.acceleration,
      jumpVelocity: modifiers.jumpVelocity,
    });
    this.playerCombat.setRuntimeModifiers({
      punchCooldown: modifiers.punchCooldown,
      punchRange: modifiers.punchRange,
    });
  }

  private updatePlayer(delta: number): void {
    const input = this.inputManager.update();
    this.playerController.setMoveInput(input.moveX, input.moveY);
    const inputLength = this.playerController.input.length();
    if (!this.cameraController.isManual) {
      if (inputLength > 0.1 && !this.movementInputActive) this.cameraController.alignBehind(this.player.rotation.y);
      this.movementInputActive = inputLength > 0.1;
    }
    this.playerController.update(delta, this.cameraController.yaw);
  }

  private handleTerrainPunch(point: THREE.Vector3, now: number): void {
    const modifiers = this.runDirector.getModifiers();
    const power = this.runDirector.snapshot.breakMode ? 3 : 1;
    const result = this.damageAreaPowered(
      point,
      GAME_CONFIG.destruction.punchRadius * modifiers.punchRadius,
      Math.round(GAME_CONFIG.destruction.maxPunchVoxels * Math.min(1.8, modifiers.punchRadius)),
      "punch",
      power,
    );
    const blast = this.processOreExplosions(result.explosionPoints, now);
    const comboText = this.rewardSystem.recordDestruction(result.destroyedCount, result.oreDestroyed, now);
    this.runDirector.recordDestruction(result.destroyedCount, result.oreDestroyed);
    this.effectManager.hitStop(GAME_CONFIG.destruction.hitStop);
    this.cameraController.addShake(result.destroyedCount > 0 ? 180 : 90, result.destroyedCount > 0 ? 0.12 : 0.045);
    this.effectManager.showImpact(point, result.destroyedCount > 0);
    this.effectManager.spawnDestruction(point, result.destroyedCount, this.runDirector.snapshot.breakMode ? 1.45 : 1);
    this.audioManager.playPunch(result.destroyedCount > 0);
    this.setMessage(result.destroyedCount > 0
      ? `BREAK · ${result.destroyedCount + blast.destroyed} blocks${blast.enemies > 0 ? ` · 敵${blast.enemies}` : ""}${result.oreDestroyed > 0 ? ` · ORE +${result.oreDestroyed * 25}G` : ""}${comboText}`
      : result.bedrockHit ? "岩盤 · ここは抜けない" : "空振り · 破壊ラインへ踏み込め");
  }

  private handleEnemyDamage(result: EnemyDamageResult): void {
    const now = performance.now();
    this.effectManager.hitStop(result.boss ? 0.07 : GAME_CONFIG.destruction.hitStop);
    this.cameraController.addShake(result.boss ? 220 : 150, result.wallSlam ? 0.18 : 0.1);
    this.effectManager.showImpact(result.hitPoint, true);
    this.effectManager.spawnDestruction(result.position, result.defeated ? (result.boss ? 16 : 5) : 2, result.boss ? 1.8 : 1);
    this.audioManager.playPunch(true);

    if (result.boss) this.runDirector.updateBossHp(result.enemy.hp, result.maxHp);
    if (result.defeated) {
      this.itemManager.spawn(result.position);
      if (result.boss) {
        this.itemManager.spawn(result.position.clone().add(new THREE.Vector3(0.7, 0, 0)));
        this.itemManager.spawn(result.position.clone().add(new THREE.Vector3(-0.7, 0, 0)));
      }
      const comboText = this.rewardSystem.recordEnemyDefeat(now);
      this.runDirector.recordEnemyDefeat(result.boss);
      const healed = this.session.heal(this.runDirector.healAmountForCombo(this.session.state.combo));
      this.setMessage(result.boss
        ? `DEPTH BOSS BREAK · コア獲得${comboText}`
        : `敵撃破${result.wallSlam ? " · WALL BREAK" : ""}${healed > 0 ? ` · HP+${healed}` : ""}${comboText}`);
    } else {
      this.setMessage(`${result.boss ? "BOSS" : "敵"} HIT · HP ${Math.max(0, result.enemy.hp)}/${result.maxHp}${result.wallSlam ? " · WALL SLAM" : ""}`);
    }
  }

  private processOreExplosions(points: THREE.Vector3[], now: number): { destroyed: number; enemies: number } {
    let destroyed = 0;
    let enemies = 0;
    const modifiers = this.runDirector.getModifiers();
    for (const point of points.slice(0, 10)) {
      const result = this.damageAreaPowered(
        point,
        GAME_CONFIG.destruction.blastRadius * modifiers.blastRadius,
        Math.round(GAME_CONFIG.destruction.maxBlastVoxels * Math.min(1.65, modifiers.blastRadius)),
        "explosion",
        this.runDirector.snapshot.breakMode ? 3 : 2,
      );
      destroyed += result.destroyedCount;
      const comboText = this.rewardSystem.recordDestruction(result.destroyedCount, result.oreDestroyed, now);
      this.runDirector.recordDestruction(result.destroyedCount, result.oreDestroyed);
      const hits = this.enemyManager.damageNearby(
        point,
        GAME_CONFIG.destruction.blastRadius * modifiers.blastRadius + 0.7,
        this.player.position,
        Math.max(1, Math.floor(modifiers.enemyDamage * 0.7)),
        modifiers.enemyKnockback,
      );
      enemies += hits.length;
      this.effectManager.showImpact(point, true);
      this.effectManager.spawnDestruction(point, result.destroyedCount + 4, 2.4);
      this.audioManager.playExplosion();
      if (comboText) this.setMessage(`ORE CHAIN${comboText}`);
      if (result.explosionPoints.length > 0 && result.explosionPoints.length < points.length) {
        // Newly exposed ore is handled by the next player action to keep the chain bounded on iPhone.
      }
    }
    return { destroyed, enemies };
  }

  private finishGroundPound(): void {
    this.playerCombat.finishGroundPound();
    this.playerController.endGroundPound();
    const point = new THREE.Vector3(this.player.position.x, this.player.position.y - 0.72, this.player.position.z);
    const modifiers = this.runDirector.getModifiers();
    const result = this.damageAreaPowered(
      point,
      GAME_CONFIG.destruction.groundPoundRadius * modifiers.groundPoundRadius,
      Math.round(GAME_CONFIG.destruction.maxGroundPoundVoxels * Math.min(1.8, modifiers.groundPoundRadius)),
      "ground-pound",
      this.runDirector.snapshot.breakMode ? 3 : 2,
    );
    const blast = this.processOreExplosions(result.explosionPoints, performance.now());
    const hits = this.enemyManager.damageNearby(
      point,
      GAME_CONFIG.destruction.groundPoundRadius * modifiers.groundPoundRadius + 0.35,
      this.player.position,
      Math.max(1, Math.floor(modifiers.enemyDamage * 0.8)),
      modifiers.enemyKnockback,
    );
    this.rewardSystem.recordDestruction(result.destroyedCount, result.oreDestroyed, performance.now());
    this.runDirector.recordDestruction(result.destroyedCount, result.oreDestroyed);
    this.runDirector.recordGroundPound(result.destroyedCount + blast.destroyed, hits.length + blast.enemies);
    this.effectManager.hitStop(0.075);
    this.cameraController.addShake(320, result.destroyedCount > 0 ? 0.3 : 0.12);
    this.effectManager.showImpact(point, true);
    this.effectManager.spawnDestruction(point, result.destroyedCount, 2.35);
    this.audioManager.playGroundPound();
    this.setMessage(result.destroyedCount > 0 || hits.length > 0 || blast.destroyed > 0
      ? `GROUND BREAK · ${result.destroyedCount + blast.destroyed} blocks${hits.length + blast.enemies > 0 ? ` · 敵${hits.length + blast.enemies}` : ""}`
      : result.bedrockHit ? "GROUND BREAK · 岩盤" : "GROUND BREAK · 衝撃だけが響いた");
  }

  private handleEnemyTerrainImpact(position: THREE.Vector3, radius: number, strength: number): void {
    const result = this.damageAreaPowered(position, radius, Math.round(18 + radius * 14), "explosion", Math.max(1, strength));
    this.effectManager.showImpact(position, true);
    this.effectManager.spawnDestruction(position, result.destroyedCount + 2, 1.35);
    if (result.explosionPoints.length > 0) this.processOreExplosions(result.explosionPoints, performance.now());
  }

  private damagePlayer(source: THREE.Vector3, damage = GAME_CONFIG.enemies.contactDamage): void {
    if (this.session.state.state !== "playing") return;
    const gameover = this.session.damage(Math.max(1, damage));
    this.cameraController.addShake(240, 0.18);
    const knockback = this.player.position.clone().sub(source);
    knockback.y = 0;
    if (knockback.lengthSq() > 0.001) this.player.position.addScaledVector(knockback.normalize(), 0.4);
    this.playerController.snapToGround();
    this.setMessage(gameover
      ? "RUN OVER · コア進行を保持して再挑戦"
      : `被弾 · HP ${this.session.state.hp}/${this.session.state.maxHp}`);
  }

  private maybeSpawnBoss(): void {
    const depthRatio = this.depthProgressRatio();
    const state = this.session.state;
    if (!this.runDirector.shouldSpawnBoss(depthRatio, state.elapsedSeconds)) return;
    if (this.runDirector.snapshot.bossActive || this.runDirector.snapshot.bossDefeated) return;
    const bossPosition = new THREE.Vector3(
      this.world.goalPoint.x,
      this.world.goalPoint.y + 0.4,
      Math.max(this.world.spawnPoint.z + 8, this.world.goalPoint.z - 4.2),
    );
    const boss = this.enemyManager.spawnBoss(bossPosition, this.runDirector.snapshot.depthTier);
    if (!boss) return;
    this.runDirector.beginBoss(boss.maxHp);
    this.cameraController.addShake(420, 0.22);
    this.setMessage(`DEPTH BOSS · HP ${boss.hp} · 地形ごと叩き壊せ`);
  }

  private updateGoal(delta: number): void {
    this.goalMesh.rotation.z += delta * (this.runDirector.snapshot.breakMode ? 2.4 : 1.4);
    this.goalMesh.position.y = this.world.goalPoint.y + Math.sin(performance.now() * 0.003) * 0.12;
    const depthProgress = Math.max(0, this.player.position.z - this.world.spawnPoint.z);
    const state = this.session.state;
    const run = this.runDirector.snapshot;
    const goalReady = depthProgress >= GAME_CONFIG.goal.requiredDepth
      && state.destroyed >= GAME_CONFIG.goal.requiredDestroyed
      && state.enemiesDefeated >= GAME_CONFIG.goal.requiredEnemiesDefeated
      && run.bossDefeated;
    const goalMaterial = this.goalMesh.material as THREE.MeshBasicMaterial;
    goalMaterial.color.setHex(goalReady ? 0x75e3d6 : run.bossActive ? 0xff536d : 0x718096);
    goalMaterial.opacity = goalReady ? 0.95 : 0.42;
    if (state.state === "playing" && this.player.position.distanceTo(this.goalMesh.position) <= GAME_CONFIG.goal.pickupRange) {
      if (goalReady) {
        this.session.clear();
        const meta = this.runDirector.finishRun(true);
        this.runEndRecorded = true;
        this.setMessage(`RUN CLEAR · ${state.coins}G · CORE ${meta.cores} · LEGACY ${meta.legacyRank}`);
      } else {
        this.setMessage(`GOAL LOCK · 破壊 ${state.destroyed}/${GAME_CONFIG.goal.requiredDestroyed} · 撃破 ${state.enemiesDefeated}/${GAME_CONFIG.goal.requiredEnemiesDefeated}${run.bossActive ? " · BOSS ACTIVE" : run.bossDefeated ? "" : " · BOSS LOCK · RUN LVを上げて深度72%へ"}`);
      }
    }
  }

  private depthProgressRatio(): number {
    const total = Math.max(1, this.world.goalPoint.z - this.world.spawnPoint.z);
    return Math.max(0, Math.min(1, (this.player.position.z - this.world.spawnPoint.z) / total));
  }

  private syncRunTransitions(): void {
    const run = this.runDirector.snapshot;
    if (run.breakMode !== this.lastBreakMode) {
      this.lastBreakMode = run.breakMode;
      if (run.breakMode) {
        this.cameraController.addShake(260, 0.16);
        this.setMessage(`BREAK MODE · ${run.breakSeconds.toFixed(1)}s · SPEED / POWER MAX`);
      } else if (this.session.state.state === "playing") {
        this.setMessage("BREAK MODE END · 連続破壊で再点火");
      }
    }
  }

  private damageAreaPowered(
    center: THREE.Vector3,
    radius: number,
    maxVoxels: number,
    source: DestructionSource,
    power: number,
  ): DestructionResult {
    let aggregate: DestructionResult | null = null;
    const passes = Math.max(1, Math.min(3, Math.round(power)));
    for (let pass = 0; pass < passes; pass += 1) {
      const result = this.destructionSystem.damageArea({ center, radius, maxVoxels, source });
      if (!aggregate) {
        aggregate = {
          ...result,
          orePoints: [...result.orePoints],
          explosionPoints: [...result.explosionPoints],
        };
      } else {
        aggregate.hit ??= result.hit;
        aggregate.damagedVoxels += result.damagedVoxels;
        aggregate.destroyedCount += result.destroyedCount;
        aggregate.oreDestroyed += result.oreDestroyed;
        aggregate.orePoints.push(...result.orePoints);
        aggregate.explosionPoints.push(...result.explosionPoints);
        aggregate.bedrockHit ||= result.bedrockHit;
        aggregate.dirtyChunks = result.dirtyChunks;
      }
      if (result.damagedVoxels === 0) break;
    }
    return aggregate ?? {
      source,
      hit: null,
      damagedVoxels: 0,
      destroyedCount: 0,
      oreDestroyed: 0,
      orePoints: [],
      explosionPoints: [],
      bedrockHit: false,
      dirtyChunks: this.world.pendingRebuilds,
    };
  }
}
