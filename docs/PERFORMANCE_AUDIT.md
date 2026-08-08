# Mobile Runtime Performance Audit

This audit records the current code-level safeguards. It does not claim an iPhone FPS or memory measurement; those require a browser checkout or deployed Site on a physical device.

## Per-frame path

- `VoxelDemo.animate` performs one runtime update, one optional render, and throttled ViewState publication.
- `GameRuntime.update` does not create an event object or copy a full state tree.
- `PlayerController`, `CameraController`, and `EnemyManager` reuse their working `Vector3` instances.
- DOM input is normalized into a reusable `InputManager.state`.
- UI state is published every 0.25 seconds, not every sub-step.

## Bounded work

- Collision checks inspect only the player/enemy AABB neighborhood.
- Voxel destruction iterates only the request radius and caps candidates with `maxVoxels`.
- Chunk rebuilding is queued and capped by `GAME_CONFIG.rendering.rebuildsPerFrame`.
- Effects, enemies, and coins use fixed-size pools.
- Debris and dust have explicit simultaneous display limits and lifetimes.
- World generation is finite; Small and Medium dimensions are configured rather than unbounded.

## Allocation review

Allocations are intentionally limited to infrequent actions:

- punch/destruction candidate lists are created per attack, not per frame
- stage generation allocates its typed arrays once per stage
- ViewState formatting runs at the throttled HUD cadence
- chunk mesh arrays are allocated only when a queued chunk is rebuilt
- impact, explosion, and ground-pound effects reuse pooled meshes

No one-voxel-one-mesh path was added. No per-frame EventBus or spread-copy state path was added.

## Rendering safeguards

- `WebGLRenderer` pixel ratio is capped at 1.5.
- Chunk meshes contain visible faces only.
- Fog limits far geometry.
- WebGL context loss and orientation changes are handled by the composition root.
- The 2D fallback remains available for logic and coordinate checks when WebGL is unavailable.

## Verification boundary

The connected GitHub-only environment cannot run `npm run build`, `npm test`, or an iPhone performance session locally. The repository contains the commands and regression suites; a checkout/CI runner remains required for measured results.
