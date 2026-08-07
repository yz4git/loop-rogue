import * as THREE from "three";

export enum VoxelType {
  Empty = 0,
  Soil = 1,
  Rock = 2,
  Ore = 3,
  Bedrock = 4,
  Wood = 5,
  Leaves = 6,
}

export interface VoxelDefinition {
  maxHealth: number;
  destructible: boolean;
  color: THREE.Color;
}

export const VOXEL_DEFINITIONS: Record<VoxelType, VoxelDefinition> = {
  [VoxelType.Empty]: { maxHealth: 0, destructible: false, color: new THREE.Color(0x000000) },
  [VoxelType.Soil]: { maxHealth: 1, destructible: true, color: new THREE.Color(0x8f5539) },
  [VoxelType.Rock]: { maxHealth: 2, destructible: true, color: new THREE.Color(0x657083) },
  [VoxelType.Ore]: { maxHealth: 3, destructible: true, color: new THREE.Color(0x23b6b8) },
  [VoxelType.Bedrock]: { maxHealth: 255, destructible: false, color: new THREE.Color(0x20283a) },
  [VoxelType.Wood]: { maxHealth: 2, destructible: true, color: new THREE.Color(0x9a613d) },
  [VoxelType.Leaves]: { maxHealth: 1, destructible: true, color: new THREE.Color(0x4d9b68) },
};
