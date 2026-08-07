import { hashSeed } from "./SeededRandom";

function fade(value: number): number { return value * value * (3 - 2 * value); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

export class ValueNoise2D {
  private readonly seed: number;

  constructor(seed: number) { this.seed = seed >>> 0; }

  sample(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = fade(x - x0);
    const tz = fade(z - z0);
    const corner = (cx: number, cz: number): number => hashSeed(`${cx},${cz}`, `${this.seed}`) / 4294967295 * 2 - 1;
    return lerp(lerp(corner(x0, z0), corner(x0 + 1, z0), tx), lerp(corner(x0, z0 + 1), corner(x0 + 1, z0 + 1), tx), tz);
  }

  fbm(x: number, z: number, octaves = 4): number {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let total = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      value += this.sample(x * frequency, z * frequency) * amplitude;
      total += amplitude;
      frequency *= 2;
      amplitude *= 0.5;
    }
    return value / total;
  }
}

export class ValueNoise3D {
  private readonly seed: number;

  constructor(seed: number) { this.seed = seed >>> 0; }

  sample(x: number, y: number, z: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const tz = fade(z - z0);
    const corner = (cx: number, cy: number, cz: number): number => hashSeed(`${cx},${cy},${cz}`, `${this.seed}`) / 4294967295 * 2 - 1;
    const x00 = lerp(corner(x0, y0, z0), corner(x0 + 1, y0, z0), tx);
    const x10 = lerp(corner(x0, y0 + 1, z0), corner(x0 + 1, y0 + 1, z0), tx);
    const x01 = lerp(corner(x0, y0, z0 + 1), corner(x0 + 1, y0, z0 + 1), tx);
    const x11 = lerp(corner(x0, y0 + 1, z0 + 1), corner(x0 + 1, y0 + 1, z0 + 1), tx);
    return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
  }
}

export function ridged(noise: ValueNoise2D, x: number, z: number): number {
  return 1 - Math.abs(noise.fbm(x, z, 3));
}
