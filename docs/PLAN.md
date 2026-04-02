# Robot Factory — Development Plan

## Overview

MVP development plan for a 3D visual programming factory game. Five phases, ~10 weeks.

---

## Phase 1: Foundation (Week 1–2)

**Goal**: Render a 3D grid, place a machine, see a belt, run PXT editor.

1. Initialize project: `npm create vite@latest . -- --template vanilla-ts`, install Three.js, Vitest, i18next, `pxt-core`.
  1. NEVER delete already existing files when creating Vite project.
2. Set up `src/rendering/SceneManager.ts` — Three.js scene, perspective camera (isometric angle), OrbitControls, ambient + directional light, antialiased renderer.
3. Implement `src/game/Factory.ts` — 2D grid data structure (e.g., 20×20), methods: `placeMachine(x, z, type)`, `removeMachine(x, z)`, `placeBelt(from, to)`.
4. Implement `src/rendering/FactoryRenderer.ts` — render grid floor (GridHelper), render machines as colored boxes on grid cells, render belts as flat PlaneGeometry segments between adjacent cells.
5. Add mouse interaction — raycasting to grid → double-click to place/rotate machine, drag from I/O slot to connect belts, drag machine to move.
6. **Set up PXT target**: Create `pxt-target/` with `pxtarget.json`, define 3 starter blocks using PXT annotation syntax (`//% block`): `set_recipe`, `start_machine`, `stop_machine`. Build with `pxt staticpkg` and serve from `public/pxt-editor/`.
7. **Set up `src/editor/PxtEditor.ts`** — embed PXT editor as `<iframe>` in an HTML overlay panel. Use PXT Controller API (`postMessage`) to communicate with the editor. Wire PXT → console.log to verify code generation.
8. Set up i18next with `src/locales/en.json` and `src/locales/cs.json` stubs, language toggle button. PXT has its own i18n for block labels.

**Parallelism**: Steps 2–4 (rendering) can run in parallel with steps 6–7 (PXT setup).

**Critical constraint**: `src/editor/` must **never** import from `blockly` directly. All visual programming goes through the PXT framework.

**Verification**: Can place boxes on a 3D grid, open PXT editor, snap blocks together; switching language changes UI labels.

---

## Phase 2: Simulation Core (Week 3–4)

**Goal**: Items flow on belts, machines process items, block programs control behavior.

1. Implement `src/game/Item.ts` — item entity with type, quality, position-on-belt.
2. Implement `src/game/Machine.ts` — state machine (idle/processing/blocked), input/output slots, processing timer.
3. Implement `src/game/Recipe.ts` — recipe definitions (5 fabricators + assembler recipes).
4. Implement `src/game/ConveyorBelt.ts` — belt path, item queue, advance logic per tick.
5. Implement `src/game/Simulation.ts` — tick loop: process machines → advance belts → check completions → emit events *(depends on 1–4)*.
6. Implement `src/editor/BlockInterpreter.ts` — execute PXT-compiled TypeScript via `new Function()` with injected namespace objects (`machines`, `recipes`, `belts`, `loops`, `logic`, `variables_`, `functions_`, `events`) and enum objects (`Machine`, `PartType`, `Recipe`, `Belt`, `FactoryCondition`). Produces `SimulationCommand[]`. Supports both numeric enum values (PXT-inlined) and string enum names (fallback textarea). Enforces strict mode, 10,000 op limit, 100-level call depth. *(parallel with 1–4)*.
7. Connect interpreter → simulation: commands modify machine state each tick *(depends on 5–6)*.
8. Implement `src/rendering/ItemRenderer.ts` — InstancedMesh for each item type, update matrices from simulation positions each frame (interpolated between ticks) *(depends on 5)*.
9. Add belt animation — scrolling UV texture on belt mesh.
10. Write unit tests: `tests/unit/simulation.test.ts`, `tests/unit/interpreter.test.ts`.
11. Set up Playwright E2E test infrastructure: install `@playwright/test`, create `playwright.config.ts` with Vite `webServer` integration, create `tests/e2e/` directory.
12. Write initial E2E smoke test: `tests/e2e/navigation.spec.ts` — app loads, canvas renders, main menu visible.

**Verification**: Write a block program "produce 3 large wheels", press Play, watch items appear on belt, enter machine, get processed, output on other side. Tests pass via `npx vitest`. E2E smoke test passes via `npx playwright test`.

---

## Phase 3: Full Block Language (Week 5–6)

**Goal**: All 6 programming concepts working with factory-themed blocks.

1. Define all custom PXT blocks in `pxt-target/libs/robot-factory/factory.ts` using PXT annotation syntax (`//% block`):
   - Sequence — implicit (PXT default top-to-bottom).
   - Loops — `repeat_times` (repeat N times), `while_condition` (while belt has items).
   - Conditionals — `if_quality_check` (if quality > X), `if_item_type` (if item is wheel).
   - Variables — `set_variable`, `get_variable`, `change_variable_by`.
   - Functions — `define_procedure`, `call_procedure` (PXT built-in procedures).
   - Events — `on_order_received`, `on_belt_jam`, `on_machine_idle`.
2. Extend `src/editor/BlockInterpreter.ts` — runtime execution of PXT-compiled TypeScript for loops, conditionals, variable store, function call stack, event listener registration. **Enforces max 10,000 ops/tick** for infinite loop protection (including empty-body loops). Uses `new Function()` in strict mode with injected namespace objects. Redesigned from text parsing to runtime execution.
3. Implement `src/editor/FactoryToolbox.ts` — sends toolbox configuration to the PXT editor iframe (showing only unlocked blocks per level) via Controller API.
4. Implement Splitter machine in `src/game/Machine.ts` — routes items based on conditional block output.
5. Implement QualityChecker machine — assigns quality score, interacts with conditional blocks.
6. Implement Recycler machine — converts defects back to raw material.
7. Add PXT Czech locale strings in `pxt-target/libs/robot-factory/_locales/`.
8. Test each concept in isolation + combined scenarios.
9. Write E2E tests for PXT editor interaction: `tests/e2e/pxt-editor.spec.ts` — open editor iframe, verify toolbox blocks per level, drag blocks, run program.

**Verification**: Can write a program "repeat 5 times: produce wheel; if quality < 80 then recycle, else send to assembler". Program executes correctly in simulation. E2E editor tests pass.

---

## Phase 4: Levels & Scoring (Week 7–8)

**Goal**: Playable campaign with 8–10 levels, star scoring, tutorial.

1. Implement `src/game/Level.ts` — level definition schema: `{ id, name_key, description_key, grid_size, available_machines, unlocked_blocks, goals, par_scores }` *(parallel with 3)*.
2. Define 10 levels as JSON data following the progression table in DESIGN.md.
3. Implement `src/game/Scoring.ts` — at simulation end: calculate speed (robots/time), cost (materials + idle energy), quality (pass rate). Compare to par → 1–3 stars per metric. *(parallel with 1)*.
4. Implement `src/ui/ScoreScreen.ts` — HTML overlay with SVG radar chart, 3×3 star grid, "next level" button *(parallel with 7)*.
5. Implement `src/ui/LevelSelect.ts` — grid of levels with lock/star state, stored in localStorage.
6. Implement `src/ui/TutorialOverlay.ts` — highlight regions, tooltip text, step-through tutorial script per level *(parallel with 7)*.
7. Write tutorial scripts for levels 1–4 (most hand-holding), levels 5+ just brief objectives *(parallel with 4–6)*. Level-specific tutorial steps with accurate UI interaction descriptions (double-click to place, drag from slots for belts). Level 1 redesigned: part_fabricator only, produce 3 wheel_small.
8. Implement `src/game/GameManager.ts` — state machine: MainMenu → LevelSelect → BuildPhase → PlayPhase → ScoreScreen → LevelSelect.
9. Implement sandbox mode — all machines/blocks unlocked, no goals, free grid size.
10. ✅ Implement Shipper machine type — a terminal sink that consumes delivered items. Added to all 10 levels. Updated rendering (green color, ⬇ icon), translations, Level 1 tutorial, and unit tests (Machine, Simulation, SlotUtils, Level, FactoryRenderer).
11. ✅ Bug fix: MachinePanel dropdown now uses level's `availableMachines` dynamically via `setAvailableMachineTypes()` instead of a hardcoded list. Shipper appears in dropdown for all levels. Added Level 1 full-scenario E2E test (fabricator + shipper + type change + simulation).
12. ✅ Bug fix: PRODUCE_PART command failed to find recipe — it looked up by part type ID ('wheel_small') instead of recipe ID ('wheel_press_small'). Added `getRecipeByOutputType()` in Recipe.ts as fallback. *(Note: PRODUCE_PART was later removed entirely in item 23; `getRecipeByOutputType()` import removed from Simulation.ts.)*
14. ✅ HUD fix: Simulation info panel now displays `outputsDelivered` (items consumed by Shipper) instead of `itemsProduced`. HUD label changed to "Items Delivered" / "Dodané díly". Unit tests added.
15. ✅ ItemRenderer curve interpolation: Items on conveyor belts now follow Catmull-Rom spline paths on corner segments instead of cutting corners with linear interpolation. Belt chain topology cached in `ItemRenderer.cacheBeltTopology()` for performance (no per-frame regex/Map allocation).
13. Write E2E tests for full level flows: `tests/e2e/LevelFlow.spec.ts` — all 10 levels tested end-to-end (navigate, skip tutorial, place machine, program, run simulation, verify item production). Uses `navigateToLevel()` helper with localStorage progress pre-seeding for level unlocking. All 10 tests passing on Chromium. Remaining: `tests/e2e/simulation-play.spec.ts` — play/pause/stop, HUD updates; `tests/e2e/factory-build.spec.ts` — machine placement, belt drawing.
16. ✅ Comprehensive E2E level tests rewrite: All 10 level tests rewritten to be full-scenario tests. Each test covers: tutorial walkthrough (clicking through each step with counter verification), machine placement via double-click, machine type changes via MachinePanel dropdown, belt connections via `__test.placeBelt()` helper, editor programming in fallback textarea, simulation start with HUD verification, items delivered polling, and score screen assertion. Added `window.__test` helpers in `src/main.ts` (dev mode) for `placeBelt()`, `getMachines()`, `getBelts()`. Level 3 uses `loops.repeatTimes()` to test loops. All 10 pass on Chromium (~1.2 min total).
17. ✅ Bug fix: Belt drag-and-drop creation now falls back from `fixedRotations=true` to auto-rotation when current machine orientations don't yield a valid path. Both ghost preview and actual placement updated in GridInteraction.ts. Matches the fallback pattern already used by `moveMachine()`.
18. ✅ Bug fix: `placeBeltChain` slot type validation now enforces source slot must be an output and destination slot must be an input. Previously it checked against all slots combined, allowing input-to-input connections (e.g. Shipper-to-Shipper). `assertBeltSlotInvariant` test helper tightened to match.
19. ✅ Bug fix: Belt drag now tries reverse slot direction as fallback. When dragging from a machine's input slot toward a target with no outputs (e.g., Shipper), the system tries the reverse direction (output→input). Fallback cascades extracted into `computeBestBeltPath` and `tryPlaceBeltChain` helpers in GridInteraction.ts.
20. ✅ Bug fix: Ghost preview now correctly shows red when hovering over machines with no free slots. `computePlacementPlan` no longer falls back to `computeDirectPath` when `computeSlotPath` returns null (no free slots). Added `isSlotFreeExcluding` safety net in `placeBeltChain` to prevent overlapping belts on the same slot. Reverse slot type fallback in `computeBestBeltPath`/`tryPlaceBeltChain` now skips `fixedRotations=true` and only tries auto-rotation, so machines properly rotate when connecting via reverse direction. Fallback ghost belt preview in `handlePointerMove` now forces red when the source machine has no free slots of either original or reverse type.
21. ✅ Dynamic machine/belt dropdowns in PXT editor: Machine selection dropdowns now show actual machine names (e.g., "Part Fabricator 1") instead of static "Machine A" through "Machine H". Dropdowns update dynamically when machines/belts are placed or removed. Implementation: BlockInterpreter stores dynamic machine/belt lists with `setMachineList()`/`setBeltList()` and resolves references by slot index, enum name, or display name. PxtEditor patches Blockly shadow block `MEMBER` fields at runtime via same-origin iframe access. `syncFactoryToEditor()` in main.ts wires factory change notifications to the editor. 39 new unit tests added.
22. ✅ Slot-targeted belt pathfinding: When dragging a belt over a specific slot on the target machine, pathfinding now constrains to that exact slot instead of trying all free slots. Target machine auto-rotation is disabled in this mode (user's chosen slot is preserved). Source machine auto-rotation still works. When hovering over the machine body (not a slot), all slots are tried as before. Added `targetSlotPosition` parameter to `computeBeltFromSlotPath()`, `placeBeltChain()`, `PlacementPlanner.computePlacementPlan()`, and `computeSlotPath()`. `FactoryRenderer.raycastInteraction()` now returns `slotIndex` for specific slot identification. Extracted `resolveTargetSlotFromRaycast()` helper in `GridInteraction.ts`. 7 new unit tests added.
24. ✅ Aligned PXT editor block/menu colors with game UI palette. Block category hues remapped: Actions→217 (machine blue #4488ff), Loops→120 (success green, unchanged), Conditionals→60 (checker yellow #cccc44), Variables→199 (accent cyan #4fc3f7), Functions→300 (painter magenta #cc44cc), Events→35 (warning orange #ffa726). PXT accent color changed from #6366f1 to #4fc3f7 to match game --rf-accent. Updated factory.ts annotations, FactoryToolbox.ts category colours, and pxtarget.json. 7 new unit tests added.
25. ✅ Bug fix: Default PXT workspace layout. After PXT finishes initializing (post-`workspacesync` setup), the Blockly workspace is scrolled by (30, 30) so the default `on start` block at workspace (0, 0) renders with a small visible gap from the top-left corner instead of flush against it. Implemented as a single `scrollWorkspaceToOrigin()` method in `PxtEditor.ts` that calls `workspace.scroll(30, 30)` once — no polling, listeners, observers, or custom scrollbar handling. Blockly's native scrollbar behavior is preserved and grows naturally as the user adds blocks.

**Verification**: Playtest all 10 levels start to finish. Tutorial guides through level 1. Stars display correctly. Sandbox mode accessible from menu. All E2E level flow tests pass.

---

## Phase 5: Polish & Audio (Week 9–10)

**Goal**: Juicy, delightful experience — models, sounds, particles, save/load.

1. Replace placeholder box meshes with low-poly GLTF models (machines + robot parts) — free assets from Kenney.nl, Quaternius, or modeled in Blender.
2. Implement `src/rendering/RobotPreview.ts` — 3D preview of assembled robot (chassis + attached parts), spin animation.
3. Implement `src/rendering/ParticleEffects.ts` — sparks when machine processes, smoke from recycler, confetti on level complete.
4. Implement `src/audio/AudioManager.ts` — ambient factory hum, machine SFX (clank, whir), belt rolling, success jingle, UI click sounds.
5. Implement `src/utils/SaveLoad.ts` — serialize factory + PXT workspace to JSON, save to localStorage, load on level re-enter. Export/import `.json` for sandbox sharing.
6. Add smooth camera transitions — animate camera to focus on running machines during Play phase.
7. Responsive layout — handle resize, support tablet-sized screens (1024px+).
8. Complete CZ/EN translations in `src/locales/en.json` and `src/locales/cs.json` for all UI text, level descriptions, tutorial text, block labels.
9. Performance profiling — ensure 60fps with 500 items on screen. Optimize InstancedMesh updates if needed.
10. Cross-browser testing (Chrome, Firefox, Edge).
11. Write final E2E test suites: `tests/e2e/save-load.spec.ts` — save/reload/restore cycle; `tests/e2e/localization.spec.ts` — language switch verifies all text; `tests/e2e/responsive.spec.ts` — layout at 1024×768, 1920×1080, 2560×1440; `tests/e2e/cross-browser.spec.ts` — smoke test on Chromium, Firefox, WebKit.

**Verification**: Full playthrough feels polished. Audio plays correctly. Save/load round-trips. Czech language complete. 60fps on mid-range hardware. All Playwright E2E suites pass on Chromium; Firefox and WebKit have no blockers.

---

## End-to-End Verification Checklist

1. **Unit tests** (Vitest): Simulation tick correctness, BlockInterpreter output for each block type, Scoring formula accuracy, Recipe validation — `npx vitest`.
2. **E2E tests** (Playwright): Full user flows — navigation, factory building, PXT editor, simulation play, level completion, save/load, localization, responsive layout, cross-browser — `npx playwright test`.
3. **Integration test**: Load level 1 → programmatically place machines + set block program → run simulation → assert correct robots produced and score calculated.
4. **Manual playtest**: Play all 10 levels, verify tutorial clarity, confirm all block types work, test edge cases (empty program, infinite loop protection, belt jam).
5. **Performance**: Open sandbox, place 20 machines + 30 belts + trigger 500 items, confirm 60fps in Chrome DevTools Performance tab.
6. **Localization**: Switch to Czech, verify all text including PXT blocks, level descriptions, and tutorial.
7. **Save/Load**: Build a factory, save, refresh browser, load — verify identical state.
8. **Responsive**: Test at 1024×768, 1920×1080, 2560×1440.
9. **Cross-browser**: Playwright E2E suite passes on Chromium; Firefox and WebKit smoke tests pass with no blockers.
