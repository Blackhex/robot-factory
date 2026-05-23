/**
 * Task C (RED) — Removal of the legacy `SplitterCondition` mechanism.
 *
 * Static-source guards that pin the deletion of the `by_quality` /
 * `by_item_type` / `alternating` static-routing surface and the
 * presence of the new event-handler routing surface.
 *
 * These tests are written BEFORE the implementation lands and MUST
 * fail against the current codebase. They will turn green once:
 *   - `src/game/types.ts` no longer exports `SplitterCondition`,
 *     `SplitterConditionType`, or `SetSplitterConditionCommand`;
 *   - `src/game/Machine.ts` no longer carries `splitterCondition`
 *     or `splitterCounter` fields;
 *   - `src/game/MachineBehaviors.ts` no longer contains
 *     `evaluateSplitterCondition`;
 *   - `src/game/SimulationCommandDispatcher.ts` no longer dispatches
 *     `SET_SPLITTER_CONDITION` and instead handles `ROUTE_CURRENT_ITEM`;
 *   - `pxt-target/libs/core/factory.ts` no longer exposes the
 *     `setSplitterCondition` PXT block and instead exposes the new
 *     event hat / action / reporters described in Task C.
 *
 * The file-scan strategy mirrors the one used by
 * `tests/unit/game/CheckerRemoval.test.ts` (Task A's RED file).
 */
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('node:fs') as typeof import('node:fs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('node:path') as typeof import('node:path')

const ROOT = join(__dirname, '..', '..', '..')

function read(p: string): string {
  return readFileSync(join(ROOT, p), 'utf-8')
}

// ---------------------------------------------------------------------------
// D1 — `src/game/types.ts` must not export the legacy splitter types.
// ---------------------------------------------------------------------------

describe('SplitterCondition removal — src/game/types.ts', () => {
  const src = (): string => read('src/game/types.ts')

  it('does not declare or export `SplitterCondition`', () => {
    // The interface is what carries the by_quality / by_item_type /
    // alternating routing modes. Removing it is the entry-point for
    // the entire static-routing teardown.
    expect(src()).not.toMatch(/\bSplitterCondition\b/)
  })

  it('does not declare or export `SplitterConditionType` (the mode union)', () => {
    expect(src()).not.toMatch(/\bSplitterConditionType\b/)
  })

  it('does not declare or export `SetSplitterConditionCommand`', () => {
    expect(src()).not.toMatch(/\bSetSplitterConditionCommand\b/)
  })

  it('does not contain the legacy mode literals (`by_quality`, `by_item_type`, `alternating`)', () => {
    const text = src()
    expect(text).not.toMatch(/'by_quality'/)
    expect(text).not.toMatch(/'by_item_type'/)
    expect(text).not.toMatch(/'alternating'/)
  })

  it('declares a `SplitterSide` type/enum exposing `left`, `forward`, and `right`', () => {
    const text = src()
    expect(text).toMatch(/\bSplitterSide\b/)
    expect(text).toMatch(/'left'/)
    expect(text).toMatch(/'forward'/)
    expect(text).toMatch(/'right'/)
  })
})

// ---------------------------------------------------------------------------
// D2 — `src/game/Machine.ts` must not carry the legacy splitter fields.
// ---------------------------------------------------------------------------

describe('SplitterCondition removal — src/game/Machine.ts', () => {
  const src = (): string => read('src/game/Machine.ts')

  it('does not declare a `splitterCondition` field', () => {
    expect(src()).not.toMatch(/splitterCondition/)
  })

  it('does not declare a `splitterCounter` field', () => {
    expect(src()).not.toMatch(/splitterCounter/)
  })
})

// ---------------------------------------------------------------------------
// D3 — `src/game/MachineBehaviors.ts` must not contain the static evaluator.
// ---------------------------------------------------------------------------

describe('SplitterCondition removal — src/game/MachineBehaviors.ts', () => {
  const src = (): string => read('src/game/MachineBehaviors.ts')

  it('does not contain `evaluateSplitterCondition`', () => {
    expect(src()).not.toMatch(/evaluateSplitterCondition/)
  })

  it('does not import `SplitterCondition`', () => {
    expect(src()).not.toMatch(/SplitterCondition/)
  })

  it('does not reference `splitterCondition` or `splitterCounter`', () => {
    const text = src()
    expect(text).not.toMatch(/splitterCondition/)
    expect(text).not.toMatch(/splitterCounter/)
  })
})

// ---------------------------------------------------------------------------
// D4 — `src/game/SimulationCommandDispatcher.ts` swaps cases.
// ---------------------------------------------------------------------------

describe('SplitterCondition removal — src/game/SimulationCommandDispatcher.ts', () => {
  const src = (): string => read('src/game/SimulationCommandDispatcher.ts')

  it('does not contain a `SET_SPLITTER_CONDITION` case', () => {
    expect(src()).not.toMatch(/SET_SPLITTER_CONDITION/)
  })

  it('does not reference `splitterCondition`', () => {
    expect(src()).not.toMatch(/splitterCondition/)
  })
})

// ---------------------------------------------------------------------------
// D7 — `src/editor/BlockInterpreter.ts` exposes the player-facing event
// hat / action surface that the new routing flow depends on.
// ---------------------------------------------------------------------------

describe('SplitterCondition removal — src/editor/BlockInterpreter.ts', () => {
  const src = (): string => read('src/editor/BlockInterpreter.ts')

  it('exposes the player-facing `onItemArrives` handler registration', () => {
    expect(src()).toMatch(/\bonItemArrives\b/)
  })
})

// ---------------------------------------------------------------------------
// D5 — `pxt-target/libs/core/factory.ts` swaps blocks.
// ---------------------------------------------------------------------------

describe('SplitterCondition removal — pxt-target/libs/core/factory.ts', () => {
  const src = (): string => read('pxt-target/libs/core/factory.ts')

  it('does not contain the legacy `setSplitterCondition` block', () => {
    expect(src()).not.toMatch(/setSplitterCondition/)
    expect(src()).not.toMatch(/factory_set_splitter_condition/)
  })

  it('contains the new `factory_on_item_arrives` event hat block', () => {
    expect(src()).toMatch(/factory_on_item_arrives/)
  })

  it('contains the new `factory_current_item_defective` reporter block', () => {
    expect(src()).toMatch(/factory_current_item_defective/)
  })

  it('contains the new `factory_current_item_is` reporter block', () => {
    expect(src()).toMatch(/factory_current_item_is/)
  })
})
