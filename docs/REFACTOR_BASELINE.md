# Architecture Refactor Baseline

- Starting commit: 2832a80c36e2419d7b59a0eb4603a801e8535af0
- Default branch: main
- Runtime: TypeScript, three.js, Vite/Vinext, WebGL, Web Audio API
- Core runtime currently centers on VoxelDemo.
- VoxelPlayerCollision is already isolated and is the first stable seam for movement refactoring.
- Existing handcrafted and procedural stage paths must remain compatible.
- Existing voxel destruction, jump, punch, enemies, touch controls, PWA, and world-generation behavior are regression-sensitive.

This document records the baseline for the phase-by-phase refactor. Each phase must keep the application buildable and preserve the public game behavior.
