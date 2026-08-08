export class VoxelStorage {
  readonly types: Uint8Array;
  readonly health: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly depth: number,
  ) {
    const size = width * height * depth;
    this.types = new Uint8Array(size);
    this.health = new Uint8Array(size);
  }

  index(x: number, y: number, z: number): number {
    return x + this.width * (y + this.height * z);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0
      && x < this.width && y < this.height && z < this.depth;
  }

  get(x: number, y: number, z: number): number {
    return this.inBounds(x, y, z) ? this.types[this.index(x, y, z)] : 0;
  }

  set(x: number, y: number, z: number, type: number, health = 0): void {
    if (!this.inBounds(x, y, z)) return;
    const index = this.index(x, y, z);
    this.types[index] = type;
    this.health[index] = health;
  }
}
