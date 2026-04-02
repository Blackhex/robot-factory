---
name: unit-testing
description: "Use when writing Vitest unit or integration tests for simulation, interpreter, scoring, factory grid, machines, recipes, or belts. Covers testing patterns, deterministic test setup, architecture guard tests, and test helpers for the Robot Factory game."
---

# Testing Patterns

## Framework: Vitest
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
```

Run: `npx vitest` or `npx vitest --watch`

### Capturing command output — MUST go under `test-results/`

ALL artifacts produced by a test/lint/compile run — console captures, structured reporter outputs (JSON / JUnit / etc.), screenshots — MUST be written under the gitignored `test-results/` folder. The ONLY acceptable parent directory for any capture file is `test-results/` — exact name, no variants. NEVER to the repo root. NEVER into `src/`, `tests/`, `docs/`, `public/`, or any other tracked folder. NEVER create a sibling or look-alike folder such as `test-results-log/`, `test-results-logs/`, `test-logs/`, `vitest-logs/`, `logs/`, `captures/`, or anything else ending in `-log`, `-logs`, `-output`, or `-captures` — these all violate this rule even if they happen to be untracked. The two acceptable target shapes are:

```
test-results/<command>-<purpose>.log    # console capture (Tee-Object / redirection)
test-results/<command>-<purpose>.json   # reporter output (--outputFile / --reporter=json)
```

Allowed examples:

```powershell
# Console capture (.log)
npx vitest run *>&1 | Tee-Object -FilePath test-results/vitest-output.log
npx vitest run tests/unit/ui/Foo.test.ts *>&1 | Tee-Object -FilePath test-results/vitest-foo.log
npx tsc --noEmit *>&1 | Tee-Object -FilePath test-results/tsc-output.log

# Structured reporter output (.json) — ALWAYS prefix with test-results/
npx vitest run --reporter=json --outputFile=test-results/vitest-output.json
```

**Forbidden patterns — do NOT do any of these:**
- `Tee-Object -FilePath vitest-output.log` (workspace root)
- `Tee-Object -FilePath vitest-output.txt` (wrong extension)
- `Tee-Object -FilePath vitest-rename.txt` (workspace root AND wrong extension)
- `> vitest-output.txt` (non-`.log` extension for a console capture)
- `--outputFile=vitest-results.json` or `> tsc-output.json` (workspace root — must be `test-results/...json`)
- Any redirect into `src/`, `tests/`, `docs/`, `public/`, or any other tracked folder.
- Any redirect into a sibling/look-alike folder: `test-results-log/`, `test-results-logs/`, `test-logs/`, `vitest-logs/`, `logs/`, `captures/`, or any path that does not begin with the exact prefix `test-results/`.
- Helper scripts (ad-hoc Node parsers, `.cjs` analyzers) dropped into capture folders. Helper scripts belong in `scripts/`; capture folders contain captures only.

**Self-check before every redirect or `--outputFile` / `--reporter` flag:** the path you are about to write MUST start with the exact prefix `test-results/` (not `test-results-log/`, not `test-results_log/`, not any other variant — exact match, trailing slash). The extension MUST be `.log` for console captures and `.json` for reporter outputs (or the reporter's native extension for JUnit etc.). If either is false, fix the command before running it. If you find yourself reaching for a new folder name because `test-results/` "feels cluttered", that is the signal you are about to violate the rule — keep using `test-results/` and disambiguate via the `<command>-<purpose>` filename instead.

**If you discover a stray capture file you (or a previous run) wrote to the wrong location**, move it: `Move-Item -Force <bad-path> test-results/<command>-<purpose>.<ext>`. Do NOT add it to `.gitignore` — fix the path instead.

### Mandatory pre/post-run guard — RUN THIS, do not skip

Prose rules above have repeatedly been ignored by agents. The following PowerShell guard is MANDATORY around every test/lint/compile invocation that writes output. It (a) deletes any pre-existing forbidden capture folder so violations are visible, and (b) ABORTS if your command just created one.

```powershell
$forbidden = @('test-results-log','test-results-logs','test-results_log','test-logs','vitest-logs','e2e-logs','playwright-logs','ux-captures','review-captures')
# PRE-FLIGHT: clean any stale violation left by a previous run.
$forbidden | ForEach-Object { if (Test-Path $_) { Remove-Item -Recurse -Force $_; Write-Host "Removed stale forbidden capture folder: $_" } }

# === YOUR TEST COMMAND HERE — redirect MUST start with 'test-results/' ===
npx vitest run *>&1 | Tee-Object -FilePath test-results/vitest-output.log

# POST-FLIGHT: fail loudly if the command above created a forbidden folder.
$violations = $forbidden | Where-Object { Test-Path $_ }
if ($violations) { throw "VIOLATION: this run created forbidden capture folder(s): $($violations -join ', '). Re-run with paths under test-results/ only and report this failure to the orchestrator." }
```

The pre-flight `Remove-Item` is safe: these folder names are reserved-forbidden by this skill, so nothing in the repo legitimately uses them. If the post-flight `throw` fires, you have written to a forbidden path in the command you just ran — fix the path (it MUST start with `test-results/`) and re-run. Do NOT suppress, comment out, or weaken the guard — that defeats its purpose.

## Test Only Pure Logic
- Test sources from from `src/game/`, `src/editor/`, and `src/utils` directories only.
- No Three.js, no PXT UI, no DOM in tests.

## Deterministic Tests
- Use tick counts, not real time.
- No `Math.random()` in tests — seed any randomness in production code.
- Same inputs → same outputs, always.

## Common Test Setup
```typescript
function createTestFactory(width = 5, height = 5): Factory {
  const factory = new Factory(width, height)
  return factory
}

function createTestSimulation(factory: Factory): Simulation {
  return new Simulation(factory)
}

function tickN(sim: Simulation, n: number, commands: SimulationCommand[] = []): void {
  for (let i = 0; i < n; i++) {
    sim.tick(commands)
  }
}
```

## Architecture Guard Test
```typescript
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

describe('Architecture', () => {
  it('src/game/ must not import from three or pxt-core', () => {
    // GIVEN
    const gameDir = join(__dirname, '../src/game')

    // WHEN
    const files = readdirSync(gameDir).filter(f => f.endsWith('.ts'))
    for (const file of files) {
      const content = readFileSync(join(gameDir, file), 'utf-8')

      // THEN
      expect(content).not.toMatch(/from\s+['"]three['"]/)
      expect(content).not.toMatch(/from\s+['"]pxt-core['"]/) 
    }
  })
})
```

## Machine Placement Test Example
```typescript
describe('placeMachine()', () => {
  it('should place a machine on an empty cell', () => {
    // ASSERT
    expect(renderGrid(factory, 0, 0, 2, 2)).toBe([
      '| | | |',
      '| | | |',
      '| | | |',
    ].join('\n'))

    // WHEN
    const result = factory.placeMachine(1, 1, 'assembler')

    // THEN
    expect(renderGrid(factory, 0, 0, 2, 2)).toBe([
      '| | | |',
      '| |A| |',
      '| | | |',
    ].join('\n'))
    expect(result).toBeTruthy()
    expect(factory.getMachineAt(1, 1)).not.toBeNull()
    expect(factory.getMachineAt(1, 1)!.type).toBe('assembler')
  })

  it('should fail to place on an occupied cell', () => {
    // GIVEN
    factory.placeMachine(1, 1, 'assembler')

    // ASSERT
    expect(renderGrid(factory, 0, 0, 2, 2)).toBe([
      '| | | |',
      '| |A| |',
      '| | | |',
    ].join('\n'))

    // WHEN
    const result = factory.placeMachine(1, 1, 'painter')

    // THEN
    expect(renderGrid(factory, 0, 0, 2, 2)).toBe([
      '| | | |',
      '| |A| |',
      '| | | |',
    ].join('\n'))
    expect(result).toBeNull()
  })
})
```

## Machine Rotation Test Example
```typescript
describe('rotateMachine()', () => {
  it('should maintain valid belt after rotation', () => {
    // GIVEN: Two machines connected by a belt.
    const assembler = factory.placeMachine(2, 2, 'assembler')
    const painter = factory.placeMachine(3, 3, 'painter')
    factory.placeBeltChain(assembler!, painter!)

    // ASSERT: Initial belt connection is valid between (2,2) and (3,3)
    expect(renderGrid(factory, 1, 1, 3, 3)).toBe([
      '| | | |',
      '| |A|┐|',
      '| | |P|',
    ].join('\n'))

    // WHEN: Rotate source machine — chains are removed and reconnected.
    factory.rotateMachine(assembler!, 'north')

    // THEN: Belt should be reconnected between (2,2) and (3,3) with valid path.
    expect(renderGrid(factory, 1, 1, 3, 3)).toBe([
      '| |┌|┐|',
      '| |A|│|',
      '| | |P|',
    ].join('\n'))
    const belts = factory.getBelts()
    expect(belts).toHaveLength(1)
    expect(belts[0].sourceMachine.x).toBe(2)
    expect(belts[0].sourceMachine.z).toBe(2)
    expect(belts[0].destinationMachine.x).toBe(3)
    expect(belts[0].destinationMachine.z).toBe(3)
    expect(belts[0].path).toEqual([
      { "x": 2, "z": 2, },
      { "x": 2, "z": 1, },
      { "x": 3, "z": 1, },
      { "x": 3, "z": 2, },
      { "x": 3, "z": 3, }
    ])
  })
})
```

## Test Quality Rules

### Every test must:
1. **Test behavior, not implementation** — assert on public API results, not private fields.
2. **Test organization** — create one test file per source file (e.g., `Factory.test.ts` for `Factory.ts`). Inside each test file, wrap related tests in a `describe` block named after the function or method being tested. Keep individual test functions short and focused — split large tests into smaller ones that each verify a single behavior.
3. **Test count limit** - if one test file exceeds 200 tests, use it as a signal to split the source file into smaller modules, each with its own test file.
4. **Fail when the feature breaks** — no tautologies (`expect(result).toBeDefined()`).
5. **Use realistic scenarios** — set up machines, belts, simulation state as a real user would.
6. **Be independent** — each test sets up its own state, no inter-test dependencies.
7. **Factory-situation tests — required assertions** — any test that places machines, belts, moves machines, rotates machines, or tests pathfinding (collectively: factory-situation tests) MUST include ALL of the following:
   - **(a) Grid snapshot**: `expect(renderGrid(factory, x1, z1, x2, z2)).toBe(...)` to visualize the grid state at every relevant step (initial state, after each operation).
   - **(b) Final orientation of every machine on the grid**: `expect(factory.getMachineAt(x, z)!.rotation).toBe('east')` (or equivalent) for every placed machine, even when the test author "knows" the rotation is locked or unchanged. The assertion documents intent and catches accidental rotation regressions.
   - **(c) Final placement and orientation of every belt on the grid**: assert the complete belt set and each belt's geometry — total count via `expect(factory.getBelts()).toHaveLength(n)`, exact path cells via `expect(belt.path).toEqual([...])` (or `expectBeltSegments(...)`), and the source/destination machine endpoints (`belt.sourceMachine.{x,z}`, `belt.destinationMachine.{x,z}`). The path order encodes the belt's flow direction, so asserting it pins both placement and orientation. This applies even when the test author "knows" the belt did not change.

### Coverage requirements per change:
- New public method → at least 4 happy-path + 4 error/rejection test.
- New code branch (if/else, switch case) → test both branches.
- Bug fix → regression test that reproduces the original bug.
- Edge cases → boundary values (0, max, grid edges, empty collections).

### Constraint preservation (CRITICAL):
- **NEVER remove, weaken, or replace an existing test assertions** to make new code pass. If a test fails after a code change, the CODE is wrong — fix the code, not the test.
- **NEVER change expected values** in an existing test unless the user explicitly requested a behavior change for that specific scenario.
- **New constraints are ADDITIVE** — add new tests/assertions alongside existing ones. Old assertions stay.
- **If a new constraint contradicts an old one**, STOP and ask the user which behavior is correct before proceeding.
- **Treat test assertions as specifications** — they define what the system MUST do. Changing them changes the spec.
- **When delegating to subagents**: explicitly instruct them "DO NOT modify any existing test assertions. Only ADD new tests."

### Multi-step interaction tests (event sequences):
When testing code that spans multiple events (e.g., pointerdown → pointermove → pointerup):
- **Vary mock state between events** — if a mock returns fixed data (e.g., cursor position), change it between events to simulate real user behavior (e.g., cursor moves between pointerdown and pointerup).
- **Test the actual scenario, not just the events in isolation** — a drag test must simulate the cursor being on a DIFFERENT cell at pointerup than at pointerdown.
- **Cover all outcome branches of each event** — for pointerup after drag: same cell (click), different empty cell (move), different occupied cell (blocked), off-grid (cancelled).
- **Assert side effects that should NOT happen** — if dragging should not select, explicitly `expect(spy).not.toHaveBeenCalled()` in the drag-to-different-cell test.
