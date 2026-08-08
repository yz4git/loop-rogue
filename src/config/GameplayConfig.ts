export const GAMEPLAY_CONFIG = Object.freeze({
  player: Object.freeze({
    moveSpeed: 4.5,
    jumpVelocity: 7,
    gravity: 20,
    coyoteTimeMs: 120,
    jumpBufferMs: 140,
  }),
  combat: Object.freeze({
    punchRange: 2.4,
    punchCooldownMs: 400,
    groundPoundRadius: 2.8,
  }),
  destruction: Object.freeze({
    punchRadius: 1.7,
    maxPunchVoxels: 50,
    maxGroundPoundVoxels: 80,
  }),
  performance: Object.freeze({
    maxPixelRatio: 1.5,
    maxChunkRebuildsPerFrame: 1,
  }),
} as const);
