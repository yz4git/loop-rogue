import * as THREE from "three";
import { GAME_CONFIG } from "./Settings";
import { VoxelWorld } from "../world/VoxelWorld";
import type { StageSource } from "../stages/StageSource";
import { GameRuntime } from "./GameRuntime";
import type { GameViewState } from "../ui/GameViewState";

export type DemoStats = GameViewState;

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
  private readonly playerBody!: THREE.Mesh;
  private readonly leftHand!: THREE.Mesh;
  private readonly rightHand!: THREE.Mesh;
  private readonly leftArm!: THREE.Mesh;
  private readonly rightArm!: THREE.Mesh;
  private readonly handGeometry = new THREE.SphereGeometry(0.15, 8, 6);
  private readonly armGeometry = new THREE.CapsuleGeometry(0.085, 0.34, 4, 6);
  private readonly handMaterial = new THREE.MeshLambertMaterial({ color: 0x68e2d1 });
  private readonly runtime: GameRuntime;
  private animationFrame = 0;
  private statsTimer = 0;

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

    this.scene.add(new THREE.HemisphereLight(0xb9dcff, 0x3a2b2a, 2.15));
    const sun = new THREE.DirectionalLight(0xffe0a5, 2.3);
    sun.position.set(-12, 25, 24);
    this.scene.add(sun);

    this.world = new VoxelWorld(source);
    this.createPlayerVisual();
    this.runtime = new GameRuntime(this.scene, this.camera, this.player, this.raycaster, this.world, () => undefined);
    this.scene.add(this.world.group);
    this.scene.add(this.player);
    this.player.position.set(this.world.spawnPoint.x, this.world.spawnPoint.y, this.world.spawnPoint.z);
    this.runtime.initialize();
    this.updateWorldRenderingDistance();

    this.runtime.attachInput(window, this.renderer.domElement);
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost, { passive: false });
    this.renderer.domElement.addEventListener("webglcontextrestored", this.handleContextRestored);
    window.addEventListener("resize", this.resize);
    window.addEventListener("orientationchange", this.resize);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.resize();
    this.animate();
  }

  private createPlayerVisual(): void {
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xf0a35b });
    this.playerBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 4, 8), bodyMaterial);
    this.playerBody.position.y = 0.7;
    this.player.add(this.playerBody);

    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x68e2d1 }),
    );
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
    this.player.add(this.leftArm, this.rightArm, this.leftHand, this.rightHand);
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
  };

  private readonly handleContextRestored = () => {
    this.resize();
  };

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      this.clock.start();
      this.resize();
    }
  };

  setMoveInput(x: number, y: number): void {
    this.runtime.setMoveInput(x, y);
  }

  jump(): void {
    this.runtime.jump();
  }

  punch(): void {
    this.runtime.punch();
  }

  reset(): void {
    this.runtime.reset();
    this.statsTimer = 0;
  }

  switchStage(source: StageSource): void {
    const previousWorld = this.world;
    this.scene.remove(previousWorld.group);
    const replacedWorld = this.runtime.switchStage(source);
    replacedWorld.dispose();
    this.world = this.runtime.currentWorld;
    this.scene.add(this.world.group);
    this.updateWorldRenderingDistance();
    this.statsTimer = 0;
  }

  private updatePlayerAnimation(now: number): void {
    this.playerBody.scale.set(1, 1, 1);
    this.leftArm.position.set(-0.27, 0.72, 0.18);
    this.rightArm.position.set(0.27, 0.72, 0.18);
    this.leftHand.position.set(-0.3, 0.68, 0.42);
    this.rightHand.position.set(0.3, 0.68, 0.42);

    if (this.runtime.isGroundPoundActive) {
      const progress = Math.min(1, Math.max(0, (now - (this.runtime.attackAnimationUntil - 260)) / 260));
      this.playerBody.scale.set(1.15 - progress * 0.15, 0.88 + progress * 0.12, 1.15 - progress * 0.15);
      this.playerBody.rotation.x = progress * 0.4;
      this.leftHand.position.y = 0.55;
      this.rightHand.position.y = 0.55;
      return;
    }

    const remaining = this.runtime.attackAnimationUntil - now;
    if (remaining > 0) {
      const progress = 1 - remaining / 240;
      const leftSwing = Math.sin(Math.min(1, progress * 2) * Math.PI);
      const rightSwing = Math.sin(Math.max(0, progress * 2 - 1) * Math.PI);
      this.playerBody.rotation.x = -Math.max(leftSwing, rightSwing) * 0.72;
      this.playerBody.position.z = Math.max(leftSwing, rightSwing) * 0.08;
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

  private readonly animate = () => {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();
    const frame = this.runtime.update(delta, now);
    this.player.visible = true;
    this.updatePlayerAnimation(now);
    if (frame.shouldRender) this.renderer.render(this.scene, this.camera);

    this.statsTimer += delta;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      const info = this.renderer.info;
      this.onStats(this.runtime.getViewState(
        { calls: info.render.calls, triangles: info.render.triangles },
        delta > 0 ? Math.round(1 / delta) : 0,
        Math.round(delta * 1000 * 10) / 10,
      ));
    }
    this.animationFrame = window.requestAnimationFrame(this.animate);
  };

  dispose(): void {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("orientationchange", this.resize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.runtime.dispose();
    this.playerBody.geometry.dispose();
    (this.playerBody.material as THREE.Material).dispose();
    this.handGeometry.dispose();
    this.armGeometry.dispose();
    this.handMaterial.dispose();
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
