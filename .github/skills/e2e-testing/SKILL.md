---
name: e2e-testing
description: "Use when writing Playwright E2E tests for the Robot Factory game. Covers the mandatory Page Object Model architecture (including Page Objects for Three.js canvas-rendered game world objects), the shared testing-domain library layout, browser-based testing patterns for navigation flows, PXT editor manipulation, simulation playback timing, save/load via localStorage, localization, responsive layout, and cross-browser configuration."
---

# E2E Testing Patterns (Playwright)

## Framework: Playwright
```typescript
import { test, expect } from './fixtures'
```

Run: `npx playwright test` or `npx playwright test --ui`

### Mandatory pre/post-run guard — RUN THIS, do not skip

Prose rules in this section have repeatedly been ignored by agents. The following PowerShell guard is MANDATORY around every `playwright` / `vitest` / `tsc` / `npm` invocation that writes output. It (a) deletes any pre-existing forbidden capture folder so violations are visible, and (b) ABORTS if your command just created one.

```powershell
$forbidden = @('test-results-log','test-results-logs','test-results_log','test-logs','vitest-logs','e2e-logs','playwright-logs','ux-captures','review-captures')
# PRE-FLIGHT: clean any stale violation left by a previous run.
$forbidden | ForEach-Object { if (Test-Path $_) { Remove-Item -Recurse -Force $_; Write-Host "Removed stale forbidden capture folder: $_" } }

# === YOUR TEST COMMAND HERE — every redirect / --output-file / PLAYWRIGHT_JSON_OUTPUT_NAME MUST start with 'test-results/' ===
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='test-results/playwright-output.json'; npx playwright test --reporter=json *>&1 | Tee-Object -FilePath test-results/playwright-output.log

# POST-FLIGHT: fail loudly if the command above created a forbidden folder.
$violations = $forbidden | Where-Object { Test-Path $_ }
if ($violations) { throw "VIOLATION: this run created forbidden capture folder(s): $($violations -join ', '). Re-run with paths under test-results/ only and report this failure to the orchestrator." }
```

The pre-flight `Remove-Item` is safe: these folder names are reserved-forbidden by this skill, so nothing in the repo legitimately uses them. If the post-flight `throw` fires, you have written to a forbidden path — fix the path (it MUST start with `test-results/`) and re-run. Do NOT suppress, comment out, or weaken the guard — that defeats its purpose.

### Capturing command output — MUST go under `test-results/`

ALL artifacts produced by a Playwright run — console captures (list/line reporter via Tee-Object), structured reporter outputs (JSON / JUnit / etc.), and ad-hoc screenshots — MUST be written under the gitignored `test-results/` folder. The ONLY acceptable parent directory for any capture file is `test-results/` — exact name, no variants. NEVER to the repo root. NEVER into `src/`, `tests/`, `docs/`, `public/`, or any other tracked folder. NEVER create a sibling or look-alike folder such as `test-results-log/`, `test-results-logs/`, `test-logs/`, `e2e-logs/`, `logs/`, `captures/`, or anything else ending in `-log`, `-logs`, `-output`, or `-captures` — these all violate this rule even if they happen to be untracked. `*.log` at the repo root is also gitignored but still wrong because it pollutes the workspace view.

The two acceptable target shapes are:

```
test-results/<command>-<purpose>.log    # console capture (Tee-Object / redirection)
test-results/<command>-<purpose>.json   # reporter output (--reporter=json + --output-file / PLAYWRIGHT_JSON_OUTPUT_NAME)
```

Allowed examples:

```powershell
# Console capture (.log)
npx playwright test --project=chromium --reporter=list *>&1 | Tee-Object -FilePath test-results/playwright-output.log

# Structured JSON reporter — ALWAYS write the JSON file under test-results/
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "test-results/playwright-results.json"
npx playwright test --project=chromium --reporter=json *>&1 | Tee-Object -FilePath test-results/playwright-output.log
```

The Playwright JSON reporter writes its output to whatever path is supplied via `PLAYWRIGHT_JSON_OUTPUT_NAME` (or `--reporter=json --output-file=...` when invoked through the API); always set that path to a `test-results/<name>.json` file. NEVER use plain `> playwright-results.json` redirection — UTF-8/UTF-16 BOM mismatches between PowerShell stdout encoding and the JSON parser silently corrupt the file (a leading `0xFE 0x7B` byte sequence is the symptom).

**Forbidden patterns — do NOT do any of these:**
- `Tee-Object -FilePath playwright-output.log` (workspace root)
- `Tee-Object -FilePath playwright-output.txt` (wrong extension)
- `> playwright-results.json` or `> e2e.json` or `> full-suite.json` (workspace root AND wrong capture mechanism — use `PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/...json` instead)
- `--reporter=json --output-file=playwright-results.json` (workspace root — must be `test-results/...json`)
- Any redirect into `src/`, `tests/`, `docs/`, `public/`, or any other tracked folder.
- Any redirect into a sibling/look-alike folder: `test-results-log/`, `test-results-logs/`, `test-logs/`, `e2e-logs/`, `logs/`, `captures/`, or any path that does not begin with the exact prefix `test-results/`.
- Helper scripts (e.g. `parse-durations.cjs`, ad-hoc Node parsers) dropped into capture folders. Helper scripts belong in `scripts/`; capture folders contain captures only.

**Self-check before every redirect, `--output-file`, `--reporter`, or `PLAYWRIGHT_JSON_OUTPUT_NAME` value:** the path you are about to write MUST start with the exact prefix `test-results/` (not `test-results-log/`, not `test-results_log/`, not any other variant — exact match, trailing slash). The extension MUST be `.log` for console captures and `.json` for the JSON reporter (or the reporter's native extension for JUnit etc.). If either is false, fix the command before running it. If you find yourself reaching for a new folder name because `test-results/` "feels cluttered", that is the signal you are about to violate the rule — keep using `test-results/` and disambiguate via the `<command>-<purpose>` filename instead.

**If you discover a stray capture file you (or a previous run) wrote to the wrong location**, move it: `Move-Item -Force <bad-path> test-results/<command>-<purpose>.<ext>`. Do NOT add it to `.gitignore` — fix the path instead.

## Dev Server Integration
Tests auto-start Vite via `playwright.config.ts` `webServer` option. Base URL: `http://localhost:5173/`.

## Architecture: Page Object Model is MANDATORY

All E2E interactions — including those that target the Three.js `<canvas>` — MUST go through Page Objects. Test spec files contain ONLY test case definitions: `test(...)` blocks composed of high-level domain calls and assertions. No raw selectors, no `page.click('canvas', { position })`, no `page.evaluate()`, no `data-testid` strings in spec files.

### Layout

The shared testing-domain library lives under `tests/e2e/pom/` and is reused by every spec:

```
tests/e2e/
├── pom/
│   ├── index.ts                  — barrel export of all Page Objects + fixtures
│   ├── fixtures.ts               — Playwright fixtures wiring pages together (exports `test`, `expect`)
│   ├── BasePage.ts               — shared helpers: waitForCanvasReady, screenshot, locator helpers
│   ├── screens/                  — HTML overlay screens (one Page Object per screen)
│   │   ├── MainMenuPage.ts
│   │   ├── LevelSelectPage.ts
│   │   ├── BuildPage.ts
│   │   ├── PlayPage.ts
│   │   ├── ScoreScreenPage.ts
│   │   ├── HudPage.ts
│   │   ├── ToolbarPage.ts
│   │   ├── BeltPanelPage.ts
│   │   ├── MachinePanelPage.ts
│   │   └── TutorialOverlayPage.ts
│   ├── canvas/                   — Page Objects for game-world objects rendered on <canvas>
│   │   ├── FactoryGridPage.ts    — grid↔pixel mapping, click/hover/drag at grid coords
│   │   ├── MachineObject.ts      — query/interact with a machine at (x, z)
│   │   ├── BeltObject.ts         — draw/query a belt segment between two cells
│   │   ├── ItemObject.ts         — query items at a cell or on a belt
│   │   └── SimulationProbe.ts    — read-only runtime state via a typed `page.evaluate` bridge
│   ├── editor/
│   │   └── PxtEditorPage.ts      — open/close, add/remove/connect blocks via PXT API
│   └── data/
│       ├── saves.ts              — typed save fixtures for localStorage seeding
│       └── coords.ts             — named grid coordinates used across specs
└── *.spec.ts                     — test cases ONLY: describe + test blocks
```

### Spec file rules
- Import `test` and `expect` from `./pom` (the fixtures module), NEVER from `@playwright/test` directly.
- A spec file MUST NOT contain: CSS selectors, `data-testid` literals, `page.click/locator/evaluate`, canvas pixel math, PXT API calls, or `localStorage` access.
- Every action and query goes through a Page Object method whose name reads as a domain verb (`buildPage.placeMachine('cutter', { x: 3, z: 2 })`, `playPage.start()`, `hud.expectScore(120)`).
- Assertions belong in the spec; Page Objects expose query methods (`getScore()`, `isMachineAt(coord)`) AND/OR explicit `expect*` helpers that wrap polling assertions. Prefer `expect*` helpers for anything that depends on simulation timing.

### Page Object rules
- One class per screen/object. Constructor takes `page: Page` (and optional parent POM) and stores it `private`.
- All locators are `private readonly` fields built in the constructor — never inline in methods.
- Public methods return `Promise<void>` for actions, typed values for queries, or `this`/another POM for navigation chaining.
- Page Objects MAY use `page.evaluate()`, `data-testid`, canvas coordinates, and PXT internals — they are the ONLY place these are allowed.
- Page Objects MUST NOT import from `src/game/` or `src/editor/`. Shared types may be duplicated in `tests/e2e/pom/data/` or imported from a published type-only barrel if one exists.

## Canvas + Three.js Page Objects

The 3D scene renders on a `<canvas>`; DOM selectors cannot reach Three.js objects. Encapsulate ALL canvas access in `tests/e2e/pom/canvas/`.

`FactoryGridPage` owns the grid↔pixel projection and exposes domain actions:

```typescript
// tests/e2e/pom/canvas/FactoryGridPage.ts
export class FactoryGridPage {
  private readonly canvas = this.page.locator('canvas').first()
  constructor(private readonly page: Page) {}

  async waitReady(): Promise<void> {
    await this.canvas.waitFor()
    await this.page.waitForFunction(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement | null
      return !!c && c.width > 0 && c.height > 0
    })
  }

  async clickCell(coord: GridCoord): Promise<void> {
    await this.canvas.click({ position: this.gridToPixel(coord) })
  }

  async dragBelt(from: GridCoord, to: GridCoord): Promise<void> { /* ... */ }

  private gridToPixel(coord: GridCoord): { x: number; y: number } { /* projection via SimulationProbe */ }
}
```

Game-world objects are addressed by grid coordinate, NOT by pixel:

```typescript
// tests/e2e/pom/canvas/MachineObject.ts
export class MachineObject {
  constructor(private readonly probe: SimulationProbe, private readonly coord: GridCoord) {}
  async exists(): Promise<boolean> { return this.probe.hasMachineAt(this.coord) }
  async kind(): Promise<MachineKind> { return this.probe.machineKindAt(this.coord) }
  async expectState(state: MachineState): Promise<void> {
    await expect(async () => expect(await this.probe.machineStateAt(this.coord)).toBe(state))
      .toPass({ timeout: 10_000 })
  }
}
```

`SimulationProbe` is the ONLY place that calls `page.evaluate()` to read simulation state. It exposes a small, typed surface (`hasMachineAt`, `machineStateAt`, `itemsOnBelt`, `score`, `tick`) and never returns raw Three.js objects.

## HTML Overlay Page Objects

`data-testid` attributes are still required on every overlay element, but they only appear inside Page Objects:

```typescript
// tests/e2e/pom/screens/HudPage.ts
export class HudPage {
  private readonly speed = this.page.getByTestId('hud-speed')
  private readonly score = this.page.getByTestId('hud-score')
  constructor(private readonly page: Page) {}

  async expectSpeed(value: number): Promise<void> {
    await expect(this.speed).toHaveText(String(value))
  }
  async getScore(): Promise<number> { return Number(await this.score.innerText()) }
}
```

## PXT Editor Page Object

PXT internals (`pxt.editor.getMainEditor()`, block IDs, workspace XML) are isolated in `PxtEditorPage`:

```typescript
// tests/e2e/pom/editor/PxtEditorPage.ts
export class PxtEditorPage {
  constructor(private readonly page: Page) {}
  async open(): Promise<void> { /* clicks open button, waits for .pxtEditor */ }
  async addBlock(kind: BlockKind): Promise<void> { /* page.evaluate via PXT API */ }
  async connect(parent: BlockKind, child: BlockKind, slot: string): Promise<void> { /* ... */ }
  async getWorkspaceXml(): Promise<string> { /* ... */ }
}
```

## Simulation Timing

Simulation runs at 10 ticks/sec. Polling lives inside Page Object `expect*` helpers, not in specs:

```typescript
// inside ScoreScreenPage
async waitUntilVisible(timeoutMs = 30_000): Promise<void> {
  await expect(this.root).toBeVisible({ timeout: timeoutMs })
}
```

## Save / Load

`localStorage` is touched only by Page Objects (typically `BasePage` or a dedicated `SaveManager` in `pom/data/`):

```typescript
// inside SaveManager
async seed(save: FactorySave): Promise<void> {
  await this.page.evaluate((s) => localStorage.setItem('factory-save', JSON.stringify(s)), save)
  await this.page.reload()
}
```

## Fixtures

`tests/e2e/pom/fixtures.ts` wires Page Objects into a single `test` export so specs stay declarative:

```typescript
import { test as base, expect } from '@playwright/test'
import { MainMenuPage, LevelSelectPage, BuildPage, PlayPage, HudPage, ScoreScreenPage } from './screens'
import { FactoryGridPage, SimulationProbe } from './canvas'
import { PxtEditorPage } from './editor/PxtEditorPage'

type Pages = {
  mainMenu: MainMenuPage
  levelSelect: LevelSelectPage
  build: BuildPage
  play: PlayPage
  hud: HudPage
  scoreScreen: ScoreScreenPage
  grid: FactoryGridPage
  probe: SimulationProbe
  pxt: PxtEditorPage
}

export const test = base.extend<Pages>({
  mainMenu: async ({ page }, use) => { await use(new MainMenuPage(page)) },
  // ...one entry per Page Object; navigation helpers may auto-`page.goto('/')`
})

export { expect }
```

## Spec Example (the ONLY shape allowed in `*.spec.ts`)

```typescript
// tests/e2e/SandboxSimulation.spec.ts
import { test, expect } from './pom'
import { COORD } from './pom/data/coords'

test.describe('sandbox simulation', () => {
  test('places a cutter and produces a part', async ({ mainMenu, build, play, hud, grid }) => {
    await mainMenu.openSandbox()
    await grid.waitReady()
    await build.placeMachine('cutter', COORD.center)
    await play.start()
    await hud.expectScoreAtLeast(1)
  })
})
```

## Screenshot on Failure

Failure screenshots are produced by Playwright's built-in `screenshot: 'only-on-failure'` setting in `playwright.config.ts`. They land under `test-results/<test-name>/test-failed-1.png` automatically — no custom `afterEach` hook is needed and none should be added. Removing or weakening the built-in setting requires explicit user approval.

### Screenshot output paths — MUST be gitignored

Any `page.screenshot({ path })` or `locator.screenshot({ path })` call inside a spec, fixture, helper, or one-off diagnostic MUST write under the gitignored `test-results/` folder. Use `test-results/screenshots/<descriptive-name>.png` for ad-hoc diagnostics. Never write screenshots to the repo root, `src/`, `tests/`, `docs/`, `public/`, or any other tracked folder.

## Responsive & Cross-Browser

Viewport and `projects` configuration stay in `playwright.config.ts`. Specs only declare `test.use({ viewport })` if a scenario is viewport-specific; layout assertions still go through Page Object methods (`hud.expectVisible()`, `toolbar.expectNotOverlapping(beltPanel)`).

## Test Isolation
- Each test starts with a fresh page; navigation is performed by Page Object methods (e.g. `mainMenu.open()` calls `page.goto('/')`).
- Save/load specs clear `localStorage` via `SaveManager.clear()` in a `beforeEach`.
- Never depend on state from a previous test.

## Hard Rules (enforced by code review)

- ❌ No `page.locator`, `page.getByTestId`, `page.click`, `page.evaluate`, `localStorage`, or `'canvas'` literal in any `*.spec.ts` file.
- ❌ No raw `data-testid` strings or CSS selectors outside `tests/e2e/pom/`.
- ❌ No canvas pixel coordinates outside `tests/e2e/pom/canvas/`.
- ❌ No imports from `src/game/`, `src/editor/`, `src/rendering/`, or `three` anywhere under `tests/e2e/`.
- ✅ Every new interaction first lands as a method on the appropriate Page Object, THEN is consumed by the spec.
- ✅ When a needed Page Object or method does not exist, add it to `tests/e2e/pom/` before writing the spec.

## Spec File Naming & Grouping (enforced by code review)

Spec file sprawl is a recurring problem: a new scenario gets dropped into a fresh file like `pxt-machine-dropdown-empty.spec.ts` instead of joining the existing PXT editor suite. This fragments the suite, hides related tests from each other, and breaks discoverability.

### Naming convention
- File names use **PascalCase** matching a domain area, with the `.spec.ts` suffix: `PxtEditor.spec.ts`, `BeltRendering.spec.ts`, `MachinePanel.spec.ts`, `Navigation.spec.ts`, `LevelFlow.spec.ts`, `SandboxSimulation.spec.ts`.
- ❌ No kebab-case (`pxt-machine-dropdown-empty.spec.ts`), no snake_case, no scenario-specific names embedded in the file name (`sandbox-restart.spec.ts`, `toolbar-pause-resume.spec.ts`).
- The file name names the **domain area being exercised** (the screen, system, or feature), NOT the specific scenario or bug being reproduced. Scenario detail belongs in `test.describe`/`test` titles inside the file.

### Grouping rule — add to existing files first
Before creating a new `*.spec.ts`, you MUST:
1. List the existing specs in `tests/e2e/` and identify which domain area the new test exercises.
2. If a spec file for that domain already exists (e.g. `PxtEditor.spec.ts` for anything that primarily exercises `src/editor/PxtEditor.ts` and the PXT editor surface), **add the new test as a `test(...)` block inside an appropriate `test.describe(...)` group within that file**.
3. Only create a new spec file when the new domain area has no existing spec and is genuinely distinct (a new screen, a new top-level system).
4. When in doubt, prefer adding to the existing file. A spec file with 20 well-grouped tests is better than 5 single-test files.

### Domain ownership map
Each spec file owns a domain area; new tests in that area MUST go into that file:

| Spec file | Domain area | Examples of tests that belong here |
|---|---|---|
| `PxtEditor.spec.ts` | Everything exercising `src/editor/PxtEditor.ts`, the PXT iframe, Blockly toolbox, flyout, dropdowns, block creation, workspace XML | machine/belt dropdown population, flyout updates, block labels, event-hat blocks, toolbox order, fallback textarea |
| `MachinePanel.spec.ts` | The machine-properties HTML overlay (`src/ui/MachinePanel`) | open/close, rename, recipe selection, delete |
| `BeltRendering.spec.ts` / `BeltSelection.spec.ts` | Belt visualization and interaction in `src/rendering/` | highlights, corner meshes, drag drawing, click selection |
| `Navigation.spec.ts` | Screen transitions: MainMenu → LevelSelect → Build → Play → Score | menu buttons, back navigation, screen mounts |
| `LevelFlow.spec.ts` | Per-level end-to-end playthroughs | tutorial gating, scoring, progression unlocks |
| `SandboxSimulation.spec.ts` | Sandbox-mode simulation flow | placing machines, running the simulation, pause/resume, restart |
| `Toolbar.spec.ts` (if needed) | Toolbar HTML overlay | mode switching, pause/resume, speed controls |

If you add a test that does not fit any existing domain, propose the new spec file name (PascalCase, domain-named) in the PR description before creating it.

### Code-review enforcement
- Reviewer runs: `ls tests/e2e/*.spec.ts` and flags any file whose name is kebab-case, snake_case, or scenario-specific.
- Reviewer flags any new spec file added in the same PR as an existing same-domain file unless the PR explicitly justifies the split.
- Renames of legacy fragmented files into the canonical PascalCase domain file are encouraged.
