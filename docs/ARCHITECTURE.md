# Runtime Architecture

## Composition root

`VoxelDemo` owns only the browser and renderer lifecycle:

- creates the Scene, Camera, Renderer, lights, and player visual mesh
- installs resize, orientation, visibility, and WebGL context lifecycle handlers
- starts the animation frame
- delegates input commands, reset, and stage switching to `GameRuntime`
- converts renderer counters into `GameViewState`

Game rules are not implemented in `VoxelDemo`.

## Runtime data flow

```text
Touch / keyboard
  -> InputManager
  -> GameRuntime
     -> PlayerController
     -> PlayerCombat
     -> DestructionSystem
     -> VoxelWorld / VoxelStorage
        -> chunk dirty queue
        -> chunk mesh rebuild
```

Enemy damage, rewards, effects, audio, and session state are connected by `GameRuntime`. They are not created ad hoc by the UI.

## Player and combat

`PlayerController` owns:

- horizontal acceleration/deceleration
- gravity and fall speed
- jump buffer and coyote time
- grounded state and ground snap
- stepped horizontal/vertical collision
- respawn after leaving the world

`PlayerCombat` receives abstract actions from `GameRuntime`. It owns attack cooldowns, the front hit query, air ground-pound state, and attack animation timing. DOM pointer events are handled by `InputManager`, not by combat.

## Destruction and world

`VoxelStorage` owns the typed arrays for voxel types and health. `VoxelWorld` owns bounds, collision queries, chunk meshes, and the rebuild queue.

`DestructionSystem` owns spherical voxel damage:

1. limits the candidate box to the requested radius
2. sorts nearby voxels by distance
3. applies material health and the max voxel limit
4. collects ore and explosion points
5. marks the affected chunk and neighboring boundary chunks dirty

This keeps terrain damage independent from mesh generation.

## Enemies, items, rewards, and session

- `EnemyManager` owns pooled enemy meshes, movement behaviors, contact damage, HP, knockback, and defeat.
- `ItemManager` owns pooled coins and pickup checks.
- `RewardSystem` translates destruction, ore, defeat, combo, and coin actions into `GameSession` calls.
- `GameSession` is authoritative for HP, coins, score, combo, elapsed time, defeat counts, and playing/cleared/gameover state.
- `EffectManager` and `AudioManager` consume gameplay outcomes without owning game rules.

## Stage sources and world generation

```text
StageSource
  -> HandcraftedStageSource
  -> ProceduralStageSource
       -> WorldGenerator
          -> TerrainPass
          -> LayerPass
          -> CavePass
          -> MainRoutePass
          -> FeaturePass
          -> StructurePass
          -> GameplayPlacementPass
          -> ValidationPass
          -> BiomePass
       -> StageSnapshot
  -> VoxelWorld
```

`ProceduralStageSource` normalizes user settings and delegates generation. Each pass receives the same `WorldGenerationContext`. Noise objects and random streams use stable salts, so splitting the method does not introduce `Math.random()` or shared mutable global randomness.

Validation records reachability, generation metrics, and per-pass timing in `StageMetadata`.

## UI boundary

The page owns HTML controls and renders `GameViewState`. Buttons call public commands such as `restart`, `jump`, `punch`, or `selectStage`; they do not mutate HP, enemy arrays, or voxel storage directly.

The 2D fallback implements the same view contract and reports X/Y/Z, grounded state, and vertical velocity so jump regressions can be observed without WebGL.

## Verification

- `npm test`: build, rules, architecture contracts, runtime contracts, and HTML checks
- `npm run test:worldgen`: three fixed smoke seeds
- `npm run test:worldgen:stress`: optional 100-seed batch
- `npm run lint`: ESLint

The connected GitHub-only work environment used for this migration cannot execute npm locally; successful execution must be confirmed by a checkout or CI runner.
