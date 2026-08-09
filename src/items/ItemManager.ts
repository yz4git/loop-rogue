import * as THREE from "three";
import { GAME_CONFIG } from "../core/Settings";
import type { VoxelWorld } from "../world/VoxelWorld";

export interface ItemPreviewState {
  mesh: THREE.Mesh;
  active: boolean;
  baseY: number;
}

export interface ItemManagerCallbacks {
  onCoinCollected: (value: number) => void;
}

export class ItemManager {
  private readonly coins: ItemPreviewState[] = [];
  private readonly geometry = new THREE.TorusGeometry(0.2, 0.07, 6, 12);
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  private world: VoxelWorld;

  constructor(
    private readonly scene: THREE.Scene,
    world: VoxelWorld,
    private readonly callbacks: ItemManagerCallbacks,
  ) {
    this.world = world;
    for (let index = 0; index < GAME_CONFIG.items.maxCoins; index += 1) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.visible = false;
      mesh.name = `coin-${index}`;
      this.scene.add(mesh);
      this.coins.push({ mesh, active: false, baseY: 0 });
    }
  }

  setWorld(world: VoxelWorld): void {
    this.world = world;
  }

  spawn(position: THREE.Vector3): boolean {
    const coin = this.coins.find((candidate) => !candidate.active);
    if (!coin) return false;
    coin.active = true;
    coin.mesh.visible = true;
    coin.mesh.position.copy(position);
    coin.baseY = position.y + 0.25;
    coin.mesh.position.y = coin.baseY;
    return true;
  }

  reset(): void {
    for (const coin of this.coins) {
      coin.active = false;
      coin.mesh.visible = false;
    }
    const points = this.getRewardCoinPoints();
    for (let index = 0; index < points.length; index += 1) {
      const coin = this.coins[index];
      if (!coin) break;
      coin.active = true;
      coin.mesh.visible = true;
      coin.mesh.position.copy(points[index]);
      coin.baseY = points[index].y;
    }
  }

  update(delta: number, player: THREE.Group, now = performance.now()): void {
    for (const coin of this.coins) {
      if (!coin.active) continue;
      coin.mesh.rotation.y += delta * 4.5;
      coin.mesh.position.y = coin.baseY + Math.sin(now * 0.005 + coin.mesh.position.x) * 0.12;
      if (coin.mesh.position.distanceTo(player.position) > GAME_CONFIG.items.pickupRange) continue;
      coin.active = false;
      coin.mesh.visible = false;
      this.callbacks.onCoinCollected(GAME_CONFIG.items.coinValue);
    }
  }

  get activeCount(): number {
    let count = 0;
    for (const coin of this.coins) if (coin.active) count += 1;
    return count;
  }

  get previewCoins(): readonly ItemPreviewState[] {
    return this.coins;
  }

  private getRewardCoinPoints(): THREE.Vector3[] {
    const generated = this.world.metadata?.coinSpawns;
    if (generated && generated.length > 0) {
      return generated.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    }
    return [
      new THREE.Vector3(14.5, 9.7, 21.5),
      new THREE.Vector3(17.5, 9.7, 23.5),
    ];
  }

  dispose(): void {
    for (const coin of this.coins) this.scene.remove(coin.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
