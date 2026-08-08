import * as THREE from "three";
import { GAME_CONFIG } from "./Settings";
import { VoxelWorld } from "../world/VoxelWorld";
import type { StageSource } from "../stages/StageSource";
import { VoxelPlayerCollision } from "../player/VoxelPlayerCollision";
import { PlayerController } from "../player/PlayerController";
import { PlayerCombat } from "../combat/PlayerCombat";
import { DestructionSystem } from "../destruction/DestructionSystem";
import { InputManager } from "../input/InputManager";
import { CameraController } from "../camera/CameraController";
import { EnemyManager, type EnemyDamageResult } from "../enemies/EnemyManager";
import { ItemManager } from "../items/ItemManager";
import { RewardSystem } from "../rewards/RewardSystem";
import { EffectManager } from "../effects/EffectManager";
import { AudioManager } from "../audio/AudioManager";
import { GameSession } from "../game/GameSession";
import type { GameViewState } from "../ui/GameViewState";

export interface RuntimeFrame {
  shouldRender: boolean;
}

export class GameRuntime {
  readonly playerController: PlayerController;
  readonly playerCombat: PlayerCombat;
  private world: VoxelWorld;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly player: THREE.Group;
  private readonly raycaster: THREE.Raycaster;
  private readonly onMessage: (message: string) => void;
  private readonly cameraController: CameraController;
  private readonly enemyManager: EnemyManager;
  private readonly itemManager: ItemManager;
  private readonly session: GameSession;
  private readonly rewardSystem: RewardSystem;
  private readonly effectManager: EffectManager;
  private readonly audioManager: AudioManager;
  private readonly destructionSystem: DestructionSystem;
  private readonly inputManager: InputManager;
  private readonly goalMesh: THREE.Mesh;
  private playerCollision: VoxelPlayerCollision;
  private movementInputActive = false;
  private lastMessage = "深部へ掘り、敵2体を倒してゴールへ";

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    player: THREE.Group,
    raycaster: THREE.Raycaster,
    world: VoxelWorld,
    onMessage: (message: string) => void,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.raycaster = raycaster;
    this.world = world;
    this.onMessage = (message) => {
      this.lastMessage = message;
      onMessage(message);
    };
    this.cameraController = new CameraController(camera, world);
    this.effectManager = new EffectManager(scene, camera);
    this.audioManager = new AudioManager();
    this.session = new GameSession(GAME_CONFIG.player.maxHp);
    this.destructionSystem = new DestructionSystem(world);
    this.rewardSystem = new RewardSystem(this.session);
    this.itemManager = new ItemManager(scene, world, {
      onCoinCollected: (value) => this.setMessage(this.rewardSystem.collectCoin(value)),
    });
    this.enemyManager = new EnemyManager(scene, world, {
      onPlayerContact: (source) => this.damagePlayer(source),
      onEnemyDamaged: (result) => this.handleEnemyDamage(result),
    });
    this.playerCollision = this.createPlayerCollision();
    this.playerController = new PlayerController(player, world, this.playerCollision, {
      onMessage: (message) => this.setMessage(message),
      onGroundPoundLanded: () => this.finishGroundPound(),
    });
    this.playerCombat = new PlayerCombat(player, world, raycaster, this.enemyManager.enemies, {
      onEnemyHit: (enemy, hitPoint) => this.enemyManager.damage(enemy, this.player.position, hitPoint),
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
      onCameraEnd: () => {
        this.cameraController.endManual();
        this.movementInputActive = false;
      },
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
  get worldDepth(): number { return this.world.depth; }
  get worldMetadata() { return this.world.metadata; }
  get isCameraManual(): boolean { return this.cameraController.isManual; }
  get cameraYaw(): number { return this.cameraController.yaw; }
  get playerInputLength(): number { return this.playerController.input.length(); }
  get attackAnimationUntil(): number { return this.playerCombat.animationUntil; }
  get isGroundPoundActive(): boolean { return this.playerCombat.isGroundPoundActive; }
  get grounded(): boolean { return this.playerController.grounded; }
  get velocityY(): number { return this.playerController.velocityY; }

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
    this.inputManager.setMoveInput(x, y);
  }

  jump(): void {
    if (this.session.state.state !== "playing") return;
    this.audioManager.unlock();
    this.playerController.requestJump();
  }

  punch(): void {
    if (this.session.state.state !== "playing") return;
    this.audioManager.unlock();
    this.playerCombat.punch(this.playerController.grounded);
  }

  initialize(): void {
    this.reset(false);
  }

  reset(regenerateWorld = true): void {
    if (regenerateWorld) this.world.reset();
    this.player.position.set(this.world.spawnPoint.x, this.world.spawnPoint.y, this.world.spawnPoint.z);
    this.goalMesh.position.set(this.world.goalPoint.x, this.world.goalPoint.y, this.world.goalPoint.z);
    this.session.reset();
    this.playerController.reset();
    this.playerCombat.reset();
    this.inputManager.setMoveInput(0, 0);
    this.cameraController.reset();
    this.movementInputActive = false;
    this.playerController.snapToGround(true);
    this.enemyManager.reset();
    this.itemManager.reset();
    this.setMessage("深部へ掘り、敵2体を倒してゴールへ");
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
        `生成完了 · ${metadata?.seed ?? "unknown"} · 洞窟${metadata?.caves ?? 0} · 構造物${metadata?.structures ?? 0} · 深部のゴールを目指そう`,
      );
    } else {
      this.setMessage("通常ステージを開始");
    }
    return previousWorld;
  }

  update(delta: number, now: number): RuntimeFrame {
    this.world.processRebuildQueue();
    this.session.update(delta);
    this.updatePlayer(delta);
    if (this.session.state.state === "playing") this.enemyManager.update(delta, this.player);
    this.itemManager.update(delta, this.player);
    this.updateGoal(delta);
    this.cameraController.update(delta, this.player.position);
    this.effectManager.update(delta, now);
    return { shouldRender: !this.effectManager.isHitStopped(now) };
  }

  getViewState(info: { calls: number; triangles: number }, fps: number, frameMs: number): GameViewState {
    const metadata = this.world.metadata;
    const state = this.session.state;
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

  private updatePlayer(delta: number): void {
    const input = this.inputManager.update();
    this.playerController.setMoveInput(input.moveX, input.moveY);
    const inputLength = this.playerController.input.length();
    if (!this.cameraController.isManual) {
      if (inputLength > 0.1 && !this.movementInputActive) {
        this.cameraController.alignBehind(this.player.rotation.y);
      }
      this.movementInputActive = inputLength > 0.1;
    }
    this.playerController.update(delta, this.cameraController.yaw);
  }

  private handleTerrainPunch(point: THREE.Vector3, now: number): void {
    const result = this.destructionSystem.damageArea({
      center: point,
      radius: GAME_CONFIG.destruction.punchRadius,
      maxVoxels: GAME_CONFIG.destruction.maxPunchVoxels,
      source: "punch",
    });
    const blast = this.processOreExplosions(result.explosionPoints, now);
    const comboText = this.rewardSystem.recordDestruction(result.destroyedCount, result.oreDestroyed, now);
    this.effectManager.hitStop(GAME_CONFIG.destruction.hitStop);
    this.cameraController.addShake(result.destroyedCount > 0 ? 180 : 90, result.destroyedCount > 0 ? 0.12 : 0.045);
    this.effectManager.showImpact(point, result.destroyedCount > 0);
    this.effectManager.spawnDestruction(point, result.destroyedCount);
    this.audioManager.playPunch(result.destroyedCount > 0);
    this.setMessage(result.destroyedCount > 0
      ? `パンチ命中 · ${result.destroyedCount + blast.destroyed}ブロック破壊${blast.enemies > 0 ? ` · 敵${blast.enemies}体に爆発命中` : ""}${result.oreDestroyed > 0 ? ` · 鉱石+${result.oreDestroyed * 25}G` : ""}${comboText}`
      : result.bedrockHit ? "硬い岩盤だ。パンチが弾かれた" : "パンチ命中 · もう一度叩こう");
  }

  private handleEnemyDamage(result: EnemyDamageResult): void {
    const now = performance.now();
    this.effectManager.hitStop(GAME_CONFIG.destruction.hitStop);
    this.cameraController.addShake(150, 0.1);
    this.effectManager.showImpact(result.hitPoint, true);
    this.effectManager.spawnDestruction(result.position, result.defeated ? 4 : 2);
    this.audioManager.playPunch(true);
    if (result.defeated) {
      this.itemManager.spawn(result.position);
      const comboText = this.rewardSystem.recordEnemyDefeat(now);
      this.setMessage(`敵を撃破 · コインを落とした${comboText}`);
    } else {
      this.setMessage(`敵に命中 · 残りHP ${result.enemy.hp}`);
    }
  }

  private processOreExplosions(points: THREE.Vector3[], now: number): { destroyed: number; enemies: number } {
    let destroyed = 0;
    let enemies = 0;
    for (const point of points) {
      const result = this.destructionSystem.damageArea({
        center: point,
        radius: GAME_CONFIG.destruction.blastRadius,
        maxVoxels: GAME_CONFIG.destruction.maxBlastVoxels,
        source: "explosion",
      });
      destroyed += result.destroyedCount;
      const comboText = this.rewardSystem.recordDestruction(result.destroyedCount, result.oreDestroyed, now);
      enemies += this.enemyManager.damageNearby(point, GAME_CONFIG.destruction.blastRadius + 0.7, this.player.position).length;
      this.effectManager.showImpact(point, true);
      this.effectManager.spawnDestruction(point, result.destroyedCount + 4, 2.4);
      this.audioManager.playExplosion();
      if (comboText) this.setMessage(`爆発連鎖${comboText}`);
    }
    return { destroyed, enemies };
  }

  private finishGroundPound(): void {
    this.playerCombat.finishGroundPound();
    this.playerController.endGroundPound();
    const point = new THREE.Vector3(this.player.position.x, this.player.position.y - 0.72, this.player.position.z);
    const result = this.destructionSystem.damageArea({
      center: point,
      radius: GAME_CONFIG.destruction.groundPoundRadius,
      maxVoxels: GAME_CONFIG.destruction.maxGroundPoundVoxels,
      source: "ground-pound",
    });
    const blast = this.processOreExplosions(result.explosionPoints, performance.now());
    const enemiesHit = this.enemyManager.damageNearby(point, GAME_CONFIG.destruction.groundPoundRadius + 0.35, this.player.position).length;
    this.effectManager.hitStop(0.08);
    this.cameraController.addShake(300, result.destroyedCount > 0 ? 0.28 : 0.12);
    this.effectManager.showImpact(point, true);
    this.effectManager.spawnDestruction(point, result.destroyedCount, 2.2);
    this.audioManager.playGroundPound();
    this.setMessage(result.destroyedCount > 0 || enemiesHit > 0 || blast.destroyed > 0
      ? `地面叩き · ${result.destroyedCount + blast.destroyed}ブロック破壊${enemiesHit + blast.enemies > 0 ? ` · 敵${enemiesHit + blast.enemies}体に命中` : ""}`
      : result.bedrockHit ? "地面叩き · 岩盤に阻まれた" : "地面叩き · 着地の衝撃だけが響いた");
  }

  private damagePlayer(source: THREE.Vector3): void {
    if (this.session.state.state !== "playing") return;
    const gameover = this.session.damage(GAME_CONFIG.enemies.contactDamage);
    this.cameraController.addShake(240, 0.18);
    const knockback = this.player.position.clone().sub(source);
    knockback.y = 0;
    if (knockback.lengthSq() > 0.001) this.player.position.addScaledVector(knockback.normalize(), 0.35);
    this.playerController.snapToGround();
    this.setMessage(gameover
      ? "力尽きた · リセットで再挑戦"
      : `被敵人にぶつかった · HP ${this.session.state.hp}/${this.session.state.maxHp}`);
  }

  private updateGoal(delta: number): void {
    this.goalMesh.rotation.z += delta * 1.4;
    this.goalMesh.position.y = this.world.goalPoint.y + Math.sin(performance.now() * 0.003) * 0.12;
    const depthProgress = Math.max(0, this.player.position.z - this.world.spawnPoint.z);
    const state = this.session.state;
    const goalReady = depthProgress >= GAME_CONFIG.goal.requiredDepth
      && state.destroyed >= GAME_CONFIG.goal.requiredDestroyed
      && state.enemiesDefeated >= GAME_CONFIG.goal.requiredEnemiesDefeated;
    const goalMaterial = this.goalMesh.material as THREE.MeshBasicMaterial;
    goalMaterial.color.setHex(goalReady ? 0x75e3d6 : 0x718096);
    goalMaterial.opacity = goalReady ? 0.9 : 0.38;
    if (state.state === "playing" && this.player.position.distanceTo(this.goalMesh.position) <= GAME_CONFIG.goal.pickupRange) {
      if (goalReady) {
        this.session.clear();
        this.setMessage(`地下ゴール到達 · ${state.coins}G獲得`);
      } else {
        this.setMessage(`ゴール封鎖 · 深度 ${Math.floor(depthProgress)}/${GAME_CONFIG.goal.requiredDepth} · 破壊 ${state.destroyed}/${GAME_CONFIG.goal.requiredDestroyed} · 撃破 ${state.enemiesDefeated}/${GAME_CONFIG.goal.requiredEnemiesDefeated}`);
      }
    }
  }
}
