# Robot Factory — Project Guidelines

## Overview

A 3D browser-based educational game (ages 10–14) where players build robot factories using visual programming blocks. Built with TypeScript + Vite + Three.js + Microsoft PXT + i18next.

Reference [DESIGN.md](../docs/DESIGN.md) for game design.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Build**: Vite 6
- **3D**: Three.js r170+
- **Visual Programming**: Microsoft PXT ([github.com/Microsoft/pxt](https://github.com/Microsoft/pxt))
- **Localization**: i18next (EN + CS)
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **UI**: Plain HTML/CSS overlays (no React/Vue)

## Architecture

The codebase separates into four independent layers:

1. **`src/game/`** — Pure simulation logic. NO Three.js imports. Tick-based discrete simulation at 10 ticks/sec. Key modules: Factory, Machine, Item, ConveyorBelt, BeltRouter, Simulation, Recipe, Scoring, Level, GameManager, PlacementPlanner, SlotUtils.
2. **`src/editor/`** — PXT integration. PxtEditor manages the workspace. BlockInterpreter walks the AST and produces command queues for the simulation. FactoryToolbox manages level-based block unlocking.
3. **`src/rendering/`** — Three.js rendering. Observes simulation state and renders at 60fps with interpolation. SceneManager bootstraps Three.js. FactoryRenderer renders the grid/machines/belts. ItemRenderer uses InstancedMesh for items on belts.
4. **`src/ui/`** — HTML overlay screens. HUD, LevelSelect, ScoreScreen, TutorialOverlay, MainMenu. All rendered as DOM overlays on top of the Three.js canvas.

**Critical rule**: `src/game/` must NEVER import from `src/rendering/` or Three.js. The simulation is pure logic that the renderer observes.

## Code Conventions

- Use ES modules (`import`/`export`), no CommonJS.
- Use `interface` for data shapes, `class` for stateful objects with behavior.
- Name files in PascalCase matching the primary export: `Machine.ts` exports `class Machine`.
- Block definition files in `src/editor/blocks/` use camelCase: `loops.ts`, `conditionals.ts`.
- All user-visible strings must go through i18next: `i18next.t('key')`, never hardcoded text.
- Translation keys in `src/locales/{en,cs}.json`.

## Grid System

The factory uses a 2D grid (default 20×20). Each cell is 1 unit. Machines occupy grid cells. Belts connect adjacent cells. All placement snaps to grid coordinates `(x: number, z: number)`.

## Simulation

- Tick-based: 10 ticks/second (configurable).
- Machines have states: `idle`, `processing`, `blocked`.
- Items flow on belts at `belt.speed * dt`.
- BlockInterpreter produces command queues consumed by the simulation each tick.
- **Infinite loop protection**: Max 10,000 operations per tick in the interpreter.

## Performance

- Use `InstancedMesh` for items on belts (one per item type).
- Use object pooling for frequently created/destroyed items.
- Target: 60fps with 500+ items on screen.
- Rendering interpolates between simulation ticks for smooth visuals.

## Build & Test

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # Production build
npx vitest           # Run unit tests
npx vitest --watch   # Watch mode
npx playwright test  # Run E2E tests
npx playwright test --ui  # Playwright UI mode
```

## File Organization

```
src/game/         — Simulation logic (no rendering)
src/editor/       — PXT editor + block definitions + interpreter
src/rendering/    — Three.js scene, renderers, camera, effects
src/ui/           — HTML overlay screens
src/i18n/         — i18next setup
src/audio/        — Sound management
src/utils/        — Shared utilities (save/load, grid math)
tests/unit/       — Vitest unit/integration test files
tests/e2e/        — Playwright E2E test specs
src/locales/      — Translation JSON files (en.json, cs.json)
public/models/    — GLTF 3D models
public/textures/  — Texture assets
public/audio/     — Sound files
```
