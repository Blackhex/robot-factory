---
name: code-review
description: "Use when reviewing code for SOLID principles, Clean Architecture, and code quality in the Robot Factory game. Covers Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion, layer separation, dependency rules, and common anti-patterns. Use for: code review, architecture review, refactoring assessment."
---

# Code Review — SOLID & Clean Architecture

## Robot Factory Architecture Layers

The codebase has four independent layers with a strict dependency rule:

```
┌─────────────────────────────────────────────┐
│  src/ui/        — HTML overlays (DOM only)  │
│  src/rendering/ — Three.js (observes game)  │
│  src/editor/    — PXT integration   │
├─────────────────────────────────────────────┤
│  src/game/      — Pure simulation logic     │  ← innermost, no external deps
└─────────────────────────────────────────────┘
```

**Dependency Rule**: Dependencies point inward. `src/game/` imports NOTHING from outer layers. Outer layers import types/interfaces from inner layers.

### Layer Contracts

| Layer | May import from | Must NOT import from |
|-------|----------------|---------------------|
| `src/game/` | Standard lib only | `three`, `src/rendering/`, `src/editor/`, `src/ui/`, DOM APIs |
| `src/rendering/` | `src/game/` (types + pure functions) | `src/editor/`, `src/ui/` |
| `src/editor/` | `src/game/` (types) | `src/rendering/`, `src/ui/` |
| `src/ui/` | `src/game/` (types), `src/i18n/` | `src/rendering/` (except shared types) |

### Checking Layer Violations

```bash
# Game layer must have zero hits
grep -r "from.*three\|from.*rendering\|from.*editor\|from.*ui/" src/game/
# Rendering must not import editor or UI
grep -r "from.*editor\|from.*ui/" src/rendering/
```

## SOLID Principles — Applied to Robot Factory

### S — Single Responsibility

Each class/module should have **one reason to change**.

**Check for**:
- Classes mixing concerns from different layers (e.g., Factory.ts doing both grid logic AND rendering-related computations)
- Machine.ts handling simulation ticking AND serialization AND type-specific behavior all in one class
- UI components doing both DOM manipulation AND business logic
- Files exceeding ~200 lines (warning) or ~400 lines (flag)

**Common Robot Factory violations**:
```typescript
// BAD: Factory.ts handles grid, belt routing, machine rotation, AND belt chain tracing
// Each is a distinct responsibility that changes for different reasons

// GOOD: Separate into focused modules
// Factory.ts — grid state + machine/belt CRUD
// BeltRouter.ts — pathfinding (L-shape, Z-first, BFS)
// BeltChainTracer.ts — chain traversal + reconnection
```

**Heuristic**: If a class has more than 3 `describe` blocks in its test file, it likely has too many responsibilities.

### O — Open/Closed

Open for extension, closed for modification.

**Check for**:
- Machine type-specific behavior handled via `switch` on `machineType` that must be modified for every new type
- Block interpreter using long `if/else` chains for each block type
- Renderer using hardcoded material/color maps that need updating for new types

**Robot Factory pattern**:
```typescript
// BAD: switch on machineType in 5 different files
switch (machine.type) {
  case 'part_fabricator': ...
  case 'assembler': ...
  case 'painter': ...  // Must add here for every new type
}

// BETTER: Strategy/registry pattern
const machineStrategies = new Map<MachineType, MachineStrategy>()
machineStrategies.set('part_fabricator', new FabricatorStrategy())
// Adding a new type = adding a new registration, not modifying existing code
```

**Exception**: Simple data-driven maps (like `MACHINE_COLORS`) are acceptable — they're configuration, not logic branching.

### L — Liskov Substitution

Subtypes must be substitutable for their base types without breaking behavior.

**Check for**:
- Machine subtypes that throw errors or no-op for methods expected by the base interface
- `tickSplitter` breaking the general `tick()` contract (e.g., not updating state correctly)
- Factory methods that silently ignore certain machine types

**Robot Factory pattern**:
```typescript
// BAD: Quality checker's tick() produces side outputs that callers don't expect
// when treating it as a regular Machine

// GOOD: All machines consistently follow the state machine contract:
// idle → processing → output (or blocked) — regardless of subtype
```

### I — Interface Segregation

No client should depend on methods it doesn't use.

**Check for**:
- Fat interfaces that force implementors to stub unused methods
- `MachineInfo` exposing rendering-specific fields to the game layer
- Event handlers requiring all event types when a subscriber only cares about one

**Robot Factory pattern**:
```typescript
// BAD: Renderer imports full Machine class just to read position
import { Machine } from '../game/Machine'

// GOOD: Renderer depends on a minimal read-only interface
import type { MachineInfo } from '../game/Factory'
// MachineInfo: { id, type, x, z, rotation } — just what rendering needs
```

### D — Dependency Inversion

High-level modules should not depend on low-level details. Both should depend on abstractions.

**Check for**:
- `src/game/` directly creating or depending on concrete rendering/editor classes
- Simulation directly calling DOM APIs or Three.js
- Tight coupling between main.ts wiring and component internals

**Robot Factory pattern**:
```typescript
// BAD: Game layer directly emits DOM events
document.dispatchEvent(new CustomEvent('machineProcessed'))

// GOOD: Game layer has its own event system; UI layer subscribes
simulation.on('machine_state_changed', handler) // Game-internal events
// main.ts wires: simulation events → UI updates (dependency injection)
```

**Key architectural DI points**:
- `main.ts` is the composition root — it wires all layers together.
- `GridInteraction` receives `Factory` and `FactoryRenderer` via constructor (injected).
- `Simulation` receives `Machine` and `ConveyorBelt` instances (injected, not created internally).

## Clean Architecture Smells

### Smell: Cross-Layer Data Leakage

Data structures from one layer leak details into another.

```typescript
// BAD: BeltInfo carries Three.js mesh reference
interface BeltInfo { id: string; from: GridPosition; to: GridPosition; mesh: THREE.Mesh }

// GOOD: Game layer has pure data; rendering maps it to meshes
interface BeltInfo { id: string; from: GridPosition; to: GridPosition }
// FactoryRenderer maintains its own beltMeshes Map<string, THREE.Mesh>
```

### Smell: Logic in the Composition Root

`main.ts` should wire components together, not contain business logic.

```typescript
// BAD: main.ts contains belt routing logic or score calculations
if (factory.getMachines().length > 3 && score > threshold) { ... }

// GOOD: main.ts delegates to domain objects
gameManager.startSimulation()
scoreScreen.setScore(gameManager.lastScore)
```

### Smell: God File

A single file (often `Factory.ts` or `main.ts`) grows beyond 500 lines with multiple unrelated responsibilities.

**Threshold guidance**:
- < 200 lines: Fine
- 200–400 lines: Review for SRP, may be acceptable if cohesive
- 400–800 lines: Likely has multiple responsibilities, should split
- \> 800 lines: Definitely needs refactoring

### Smell: Shared Mutable State

Multiple layers reading/writing the same object without clear ownership.

```typescript
// BAD: Renderer mutates machine positions that simulation also reads
factoryRenderer.updateMachinePosition(machine, newPos) // mutates machine.x, .z

// GOOD: Only Factory owns machine positions; renderer reads them
factory.moveMachine(fromX, fromZ, toX, toZ) // Factory is the single source of truth
factoryRenderer.update() // Re-reads from Factory
```

## Code Duplication — DRY Violations

**Code duplication is ALWAYS a major (🟡) finding** — at minimum. Treat any of the following as a major issue, with severity escalating to blocker (🔴) when noted:

### What counts as duplication

- **Verbatim or near-verbatim copy** of ≥ 5 consecutive non-trivial lines across two or more locations (different functions, files, or layers).
- **Structural duplication**: same algorithm or control flow repeated with only identifiers/types differing (e.g., three `for` loops over different collections doing the same accumulation).
- **Parallel switch/if-else chains** on the same discriminator in multiple files (e.g., `switch (machineType)` repeated in renderer, simulation, and UI). Also flagged under OCP — count once at the higher severity.
- **Copy-pasted IIFE / `page.evaluate` bodies** in test infrastructure (e.g., the same in-page closure pasted into three POM methods because in-page code can't import shared helpers — extract a string-builder or shared evaluator helper).
- **Duplicated configuration / magic numbers** repeated across files (grid size, tick rate, color constants, timeouts) — must live in a single named constant.
- **Duplicated test setup**: same `beforeEach` body, same mock factory, same fixture builder repeated across spec files. Extract into a shared helper, fixture, or Page Object method.

### What is NOT duplication

- **Coincidental similarity**: two short functions that happen to look alike but model unrelated concepts and would diverge under different requirements. Premature de-duplication is its own smell ("wrong abstraction is more expensive than duplication"). Note these in the report but do not flag.
- **Boilerplate that the language requires**: import lists, getter/setter pairs, simple delegating wrappers.
- **Test bodies that intentionally repeat the same sequence** to make a test self-contained and readable. Prefer extracting into a Page Object method when the sequence appears 3+ times.

### Severity rules

- 🟡 **Major (default for any genuine duplication)**: 5–30 duplicated non-trivial lines, or a structural duplicate repeated in 2 places. Suggested fix MUST name the target abstraction (helper function, shared module, base class, Page Object method, named constant).
- 🔴 **Blocker** when ANY of:
  - Duplicated logic crosses a layer boundary (e.g., the same recipe-validation logic exists in both `src/game/` and `src/editor/`) — risk of divergent behavior.
  - Duplicated logic implements a security or correctness invariant (auth check, bounds check, scoring rule) — divergence becomes a bug.
  - The same block is duplicated **3+ times**.
  - The duplicate has already drifted (the copies are slightly different, so the "DRY violation" has produced concrete bugs).
- 🟢 **Minor** is RESERVED for trivial, low-risk repetition (≤ 3 lines, single occurrence) and must be justified in the finding ("acceptable until a third copy appears").

### Required output for every duplication finding

Every duplication finding MUST include:
1. All locations (file:line for each copy).
2. The size of the duplicate (lines, or "structural — N occurrences").
3. The proposed extraction target (specific helper name, file, and abstraction kind — pure function, class, constant, fixture, Page Object method).
4. Whether the duplicates have already drifted (if yes → escalate to blocker).

### Example finding

```
| 🟡 Major | DRY | tests/e2e/pom/canvas/SimulationProbe.ts:187, :245, :290 |
The collect(mesh) IIFE body is duplicated verbatim across three page.evaluate calls
(~20 lines each). Although in-page closures can't share runtime code across calls,
the source-side IIFE body can be defined once as a JavaScript template string and
injected into each page.evaluate. Extract to a shared `cornerCollectorSource`
constant within SimulationProbe and inject via `${cornerCollectorSource}`.
```



When reviewing code, check each item:

- [ ] **Layer rule**: No inward-pointing imports violated.
- [ ] **SRP**: Each file < 400 lines, each class has 1 reason to change.
- [ ] **OCP**: New types/behaviors don't require modifying existing switch/if chains in 3+ places.
- [ ] **LSP**: Machine/belt subtypes honor base type contracts.
- [ ] **ISP**: Imports use `import type` where only types are needed; no fat interfaces.
- [ ] **DIP**: Game layer has zero framework dependencies; outer layers inject deps.
- [ ] **No cross-layer data leakage**: Pure data shapes in game layer.
- [ ] **No logic in composition root**: `main.ts` only wires, doesn't compute.
- [ ] **No god files**: Flag files > 400 lines for review.
- [ ] **No shared mutable state**: Single owner per data structure.
- [ ] **Event-based communication**: Layers communicate via events/callbacks, not direct method calls across boundaries.
- [ ] **DRY**: No duplicated logic, structural duplication, parallel switch chains, copy-pasted IIFE/`page.evaluate` bodies, repeated magic numbers, or duplicated test setup. Every duplicate is a major finding by default (see "Code Duplication" section).

## Severity Guide

| Severity | When to use |
|----------|------------|
| 🔴 Blocker | Layer violation (`src/game/` imports `three`), broken LSP contract, security issue, duplicated logic crossing a layer boundary, duplicated correctness/security invariant, the same block duplicated 3+ times, or duplicates that have already drifted |
| 🟡 Major | SRP violation (class has 3+ responsibilities), OCP violation (switch in 3+ files), god file > 600 lines, logic in composition root, **any genuine code duplication** (verbatim ≥5 lines, structural duplication, parallel switch chains, copy-pasted IIFE/`page.evaluate` bodies, repeated magic numbers, duplicated test setup) — see "Code Duplication" section for required output format |
| 🟢 Minor | Naming nit, slight OCP concern in 1-2 files, file approaching 400 lines, minor interface could be slimmer, trivial low-risk repetition (≤ 3 lines, single occurrence with documented justification) |
