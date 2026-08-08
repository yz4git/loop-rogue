/**
 * Migration boundary for the existing VoxelDemo.
 *
 * New systems depend on narrow contracts under player, combat, input, camera,
 * world, game, effects, and ui. VoxelDemo remains the composition root until
 * each contract is wired and covered by regression tests.
 */
export const LEGACY_COMPOSITION_ROOT = "VoxelDemo";
