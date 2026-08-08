export interface WorldGenerationContext {
  seed: string;
  width: number;
  height: number;
  depth: number;
  types: Uint8Array;
  spawn: { x: number; y: number; z: number };
  goal: { x: number; y: number; z: number };
  metrics: Record<string, number>;
}

export interface WorldGenerationPass {
  readonly id: string;
  run(context: WorldGenerationContext): void;
}
