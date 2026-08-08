# Loop Rogue Architecture

## Runtime flow

Input adapters produce `InputState`. The composition root forwards the
normalized state to `PlayerController` and `CombatContracts`. Destruction
requests are handled by the existing `VoxelWorld`, while visual feedback is
sent to `EffectManager`.

## World generation

`ProceduralStageSource` remains the source of generated snapshots. The
`WorldGenerationPass` contract is the seam for terrain, cave, feature,
structure, gameplay placement, and validation passes.

## Compatibility rule

The existing `VoxelDemo` remains the composition root during migration.
The refactor adds narrow contracts first, then wires one runtime boundary at a
time. This keeps the handcrafted stage, procedural stage, voxel collision,
jumping, punching, enemies, touch controls, PWA, and Safari recovery paths
available throughout the migration.

## Performance rule

Typed arrays, chunk-local rebuilds, bounded effects, and capped pixel ratio
remain mandatory. No new contract may introduce per-frame event allocation or
one-mesh-per-voxel rendering.
