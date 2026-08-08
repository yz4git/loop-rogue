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
  velocityY: number;
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

export class VoxelDemo {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  readonly renderer: THREE.WebGLRenderer;
  world: VoxelWorld;
  private readonly mount: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
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

  private readonly goalMesh: THREE.Mesh;

  private animationFrame = 0;
  private destroyedTotal = 0;
  private enemiesDefeatedTotal = 0;

  private lastMessage = "深部へ掘り、敵2体を倒してゴールへ";

  private statsTimer = 0;
  // 初期カメラは進行方向の後ろ。入口側を向くため、開始直後に岩壁を映さない。

  private hp = GAME_CONFIG.player.maxHp;

  private gameState: "playing" | "cleared" | "gameover" = "playing";
  private movementInputActive = false;
  private playerCollision: VoxelPlayerCollision;
  private readonly cameraController: CameraController;
  private readonly enemyManager: EnemyManager;
  private readonly itemManager: ItemManager;
  private readonly rewardSystem: RewardSystem;
  private readonly effectManager: EffectManager;
  private readonly audioManager: AudioManager;
  private readonly playerController: PlayerController;
  private readonly playerCombat: PlayerCombat;
  private readonly destructionSystem: DestructionSystem;
  private readonly inputManager: InputManager;

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
    this.cameraController = new CameraController(this.camera, this.world);
    this.effectManager = new EffectManager(this.scene, this.camera);
    this.audioManager = new AudioManager();
    this.destructionSystem = new DestructionSystem(this.world);
    this.rewardSystem = new RewardSystem();
    this.itemManager = new ItemManager(this.scene, this.world, {
      onCoinCollected: (value) => {
        this.lastMessage = this.rewardSystem.collectCoin(value);
      },
    });
    this.enemyManager = new EnemyManager(this.scene, this.world, {
      onPlayerContact: (source) => this.damagePlayer(source),
      onEnemyDamaged: (result) => this.handleEnemyDamage(result),
    });
    this.playerCollision = this.createPlayerCollision();
    this.playerController = new PlayerController(this.player, this.world, this.playerCollision, {
      onMessage: (message) => { this.lastMessage = message; },
      onGroundPoundLanded: () => this.finishGroundPound(),
    });
    this.playerCombat = new PlayerCombat(this.player, this.world, this.raycaster, this.enemyManager.enemies, {
      onEnemyHit: (enemy, hitPoint) => {
        this.enemyManager.damage(enemy, this.player.position, hitPoint);
      },
      onTerrainHit: (point, now) => this.handleTerrainPunch(point, now),
      onGroundPoundStart: () => this.playerController.beginGroundPound(),
      onMessage: (message) => { this.lastMessage = message; },
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
    this.playerController.snapToGround(true);
    this.goalMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.12, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x75e3d6, transparent: true, opacity: 0.9 }),
    );
    this.goalMesh.position.set(this.world.goalPoint.x, this.world.goalPoint.y, this.world.goalPoint.z);
    this.goalMesh.rotation.x = Math.PI / 2;
    this.scene.add(this.goalMesh);

    this.inputManager.attach(window, this.renderer.domElement);
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost, { passive: false });
    this.renderer.domElement.addEventListener("webglcontextrestored", this.handleContextRestored);
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

  setMoveInput(x: number, y: number): void {
    this.inputManager.setMoveInput(x, y);
  }

  jump(): void {
    if (this.gameState !== "playing") return;
    this.audioManager.unlock();
    this.playerController.requestJump();
  }

  punch(): void {
    if (this.gameState !== "playing") return;
    this.audioManager.unlock();
    this.playerCombat.punch(this.playerController.grounded);
  }

  private handleTerrainPunch(point: THREE.Vector3, now: number): void {
    const result = this.destructionSystem.damageArea({
      center: point,
      radius: GAME_CONFIG.destruction.punchRadius,
      maxVoxels: GAME_CONFIG.destruction.maxPunchVoxels,
      source: "punch",
    });
    this.destroyedTotal += result.destroyedCount;
    const blast = this.processOreExplosions(result.explosionPoints, now);
    const comboText = this.rewardSystem.recordDestruction(result.destroyedCount, result.oreDestroyed, now);
    this.effectManager.hitStop(GAME_CONFIG.destruction.hitStop);
    this.cameraController.addShake(
      result.destroyedCount > 0 ? 180 : 90,
      result.destroyedCount > 0 ? 0.12 : 0.045,
    );
    this.effectManager.showImpact(point, result.destroyedCount > 0);
    this.effectManager.spawnDestruction(point, result.destroyedCount);
    this.audioManager.playPunch(result.destroyedCount > 0);
    this.lastMessage = result.destroyedCount > 0
      ? `パンチ命中 · ${result.destroyedCount + blast.destroyed}ブロック破壊${blast.enemies > 0 ? ` · 敵${blast.enemies}体に爆発命中` : ""}${result.oreDestroyed > 0 ? ` · 鉱石+${result.oreDestroyed * 25}G` : ""}${comboText}`
      : result.bedrockHit ? "硬い岩盤だ。パンチが弾かれた" : "パンチ命中 · もう一度叩こう";
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
      this.enemiesDefeatedTotal += 1;
      const comboText = this.rewardSystem.recordEnemyDefeat(now);
      this.lastMessage = `敵を撃破 · コインを落とした${comboText}`;
    } else {
      this.lastMessage = `敵に命中 · 残りHP ${result.enemy.hp}`;
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
      this.destroyedTotal += result.destroyedCount;
      const comboText = this.rewardSystem.recordDestruction(result.destroyedCount, result.oreDestroyed, now);
      enemies += this.enemyManager.damageNearby(
        point,
        GAME_CONFIG.destruction.blastRadius + 0.7,
        this.player.position,
      ).length;
      this.effectManager.showImpact(point, true);
      this.effectManager.spawnDestruction(point, result.destroyedCount + 4, 2.4);
      this.audioManager.playExplosion();
      if (comboText) this.lastMessage = `爆発連鎖${comboText}`;
    }
    return { destroyed, enemies };
  }

  private movePlayer(delta: number): void {
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
    this.destroyedTotal += result.destroyedCount;
    const blast = this.processOreExplosions(result.explosionPoints, performance.now());
    const enemiesHit = this.enemyManager.damageNearby(
      point,
      GAME_CONFIG.destruction.groundPoundRadius + 0.35,
      this.player.position,
    ).length;
    const now = performance.now();
    this.effectManager.hitStop(0.08);
    this.cameraController.addShake(300, result.destroyedCount > 0 ? 0.28 : 0.12);
    this.effectManager.showImpact(point, true);
    this.effectManager.spawnDestruction(point, result.destroyedCount, 2.2);
    this.audioManager.playGroundPound();
    this.lastMessage = result.destroyedCount > 0 || enemiesHit > 0 || blast.destroyed > 0
      ? `地面叩き · ${result.destroyedCount + blast.destroyed}ブロック破壊${enemiesHit + blast.enemies > 0 ? ` · 敵${enemiesHit + blast.enemies}体に命中` : ""}`
      : result.bedrockHit ? "地面叩き · 岩盤に阻まれた" : "地面叩き · 着地の衝撃だけが響いた";
  }

  private damagePlayer(source: THREE.Vector3): void {
    if (this.gameState !== "playing") return;
    this.hp = Math.max(0, this.hp - GAME_CONFIG.enemies.contactDamage);
    this.cameraController.addShake(240, 0.18);
    const knockback = this.player.position.clone().sub(source);
    knockback.y = 0;
    if (knockback.lengthSq() > 0.001) this.player.position.addScaledVector(knockback.normalize(), 0.35);
    // Contact damage may push the player horizontally, but must never teleport
    // an airborne player down to the floor or lift them onto a nearby ledge.
    this.playerController.snapToGround();
    this.lastMessage = this.hp > 0 ? `被敵人にぶつかった · HP ${this.hp}/${GAME_CONFIG.player.maxHp}` : "力尽きた · リセットで再挑戦";
    if (this.hp <= 0) this.gameState = "gameover";
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
        this.lastMessage = `地下ゴール到達 · ${this.rewardSystem.coins}G獲得`;
      } else {
        this.lastMessage = `ゴール封鎖 · 深度 ${Math.floor(depthProgress)}/${GAME_CONFIG.goal.requiredDepth} · 破壊 ${this.destroyedTotal}/${GAME_CONFIG.goal.requiredDestroyed} · 撃破 ${this.enemiesDefeatedTotal}/${GAME_CONFIG.goal.requiredEnemiesDefeated}`;
      }
    }
  }

  private updateCamera(delta: number): void {
    this.cameraController.update(delta, this.player.position);
  }

  private updatePlayerAnimation(now: number): void {
    this.playerBody.scale.set(1, 1, 1);
    this.leftArm.position.set(-0.27, 0.72, 0.18);
    this.rightArm.position.set(0.27, 0.72, 0.18);
    this.leftHand.position.set(-0.3, 0.68, 0.42);
    this.rightHand.position.set(0.3, 0.68, 0.42);
    if (this.playerCombat.isGroundPoundActive) {
      const progress = Math.min(1, Math.max(0, (now - (this.playerCombat.animationUntil - 260)) / 260));
      this.playerBody.scale.set(1.15 - progress * 0.15, 0.88 + progress * 0.12, 1.15 - progress * 0.15);
      this.playerBody.rotation.x = progress * 0.4;
      this.leftHand.position.y = 0.55;
      this.rightHand.position.y = 0.55;
      return;
    }
    const remaining = this.playerCombat.animationUntil - now;
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

  reset(): void {
    this.world.reset();
    this.player.position.set(this.world.spawnPoint.x, this.world.spawnPoint.y, this.world.spawnPoint.z);
    this.goalMesh.position.set(this.world.goalPoint.x, this.world.goalPoint.y, this.world.goalPoint.z);
    this.playerController.reset();
    this.playerCombat.reset();
    this.inputManager.setMoveInput(0, 0);
    this.cameraController.reset();
    this.movementInputActive = false;
    this.destroyedTotal = 0;
    this.enemiesDefeatedTotal = 0;

    this.hp = GAME_CONFIG.player.maxHp;

    this.gameState = "playing";
    this.playerController.snapToGround(true);
    this.enemyManager.reset();
    this.rewardSystem.reset();
    this.itemManager.reset();
    this.lastMessage = "深部へ掘り、敵2体を倒してゴールへ";
  }

  switchStage(source: StageSource): void {
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.world = new VoxelWorld(source);
    this.playerCollision = this.createPlayerCollision();
    this.playerController.setWorld(this.world, this.playerCollision);
    this.playerCombat.setWorld(this.world);
    this.destructionSystem.setWorld(this.world);
    this.cameraController.setWorld(this.world);
    this.enemyManager.setWorld(this.world);
    this.itemManager.setWorld(this.world);
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
    if (this.gameState === "playing") this.enemyManager.update(delta, this.player);
    this.itemManager.update(delta, this.player);
    this.updateGoal(delta);
    this.player.visible = true;
    this.updatePlayerAnimation(now);
    this.updateCamera(delta);
    this.effectManager.update(delta, now);
    if (!this.effectManager.isHitStopped(now)) this.renderer.render(this.scene, this.camera);
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
        grounded: this.playerController.grounded,
        velocityY: Math.round(this.playerController.velocityY * 100) / 100,
        hp: this.hp,
        maxHp: GAME_CONFIG.player.maxHp,
        enemies: this.enemyManager.activeCount,
        coins: this.rewardSystem.coins,
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
    this.inputManager.detach();
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.world.dispose();
    this.playerBody.geometry.dispose();
    (this.playerBody.material as THREE.Material).dispose();
    this.effectManager.dispose();
    this.audioManager.dispose();
    this.handGeometry.dispose();
    this.armGeometry.dispose();
    this.handMaterial.dispose();
    this.enemyManager.dispose();
    this.itemManager.dispose();

    this.goalMesh.geometry.dispose();
    (this.goalMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
