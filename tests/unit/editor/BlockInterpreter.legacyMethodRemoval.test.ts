import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BlockInterpreter } from '../../../src/editor/BlockInterpreter'

/**
 * E4h + E4i — RED-step pins for deletion of the legacy
 * `triggerSplitterItemArrived` wrapper AND the rename pair:
 *
 *   E4i renames:
 *     - private field `splitterHandlers` → `itemArrivalHandlers`
 *     - private field `currentSplitterItem` → `currentArrivingItem`
 *
 *   E4h deletes the legacy wrapper:
 *     - method `triggerSplitterItemArrived` (kept as a thin shim
 *       around `triggerOnItemArrives` since E3) is removed; the
 *       canonical entry-point is `triggerOnItemArrives`.
 *
 * Pattern — runtime instance probe (D) plus source-content guards
 * for the field renames (E, F).
 */

const BLOCK_INTERPRETER_TS_PATH = resolve(
  __dirname,
  '../../../src/editor/BlockInterpreter.ts',
)

function readInterpreterSource(): string {
  return readFileSync(BLOCK_INTERPRETER_TS_PATH, 'utf8')
}

describe('BlockInterpreter — legacy triggerSplitterItemArrived removal (E4h)', () => {
  it('D1: instance has NO triggerSplitterItemArrived method', () => {
    const interpreter = new BlockInterpreter()
    const method = (interpreter as unknown as Record<string, unknown>).triggerSplitterItemArrived
    expect(
      method,
      'The wrapper was retained through E3 only as a staged-removal ' +
        'shim for the wireSimulationEffects bridge. E4h deletes the ' +
        'bridge wiring AND the wrapper in one cycle. ' +
        '`triggerOnItemArrives` is the canonical entry-point.',
    ).toBeUndefined()
  })

  it('D2: source does NOT contain the identifier `triggerSplitterItemArrived`', () => {
    const src = readInterpreterSource()
    expect(
      src,
      'Catches stale JSDoc references and any leftover comment that ' +
        'cites the deleted wrapper by name.',
    ).not.toMatch(/\btriggerSplitterItemArrived\b/)
  })
})

describe('BlockInterpreter — splitterHandlers → itemArrivalHandlers rename (E4i)', () => {
  it('E1: source does NOT contain the OLD field name `splitterHandlers`', () => {
    const src = readInterpreterSource()
    expect(
      src,
      'After the rename the OLD identifier must not appear anywhere — ' +
        'not in the field declaration, not in `eventsNs.onItemArrives`, ' +
        'not in `triggerOnItemArrives`, not in `reset()`.',
    ).not.toMatch(/\bsplitterHandlers\b/)
  })

  it('E2: source contains the NEW field name `itemArrivalHandlers` (declaration)', () => {
    const src = readInterpreterSource()
    expect(
      src,
      'A `private itemArrivalHandlers = new Map<...>()` declaration ' +
        'must replace the `private splitterHandlers = ...` line.',
    ).toMatch(/\bprivate\s+itemArrivalHandlers\b/)
  })

  it('E3: source uses `itemArrivalHandlers.set` inside eventsNs.onItemArrives', () => {
    const src = readInterpreterSource()
    expect(
      src,
      '`events.onItemArrives` is the only writer to the handler map.',
    ).toMatch(/itemArrivalHandlers\.set\b/)
  })

  it('E4: source uses `itemArrivalHandlers.get` inside triggerOnItemArrives', () => {
    const src = readInterpreterSource()
    expect(
      src,
      '`triggerOnItemArrives` is the only reader of the handler map.',
    ).toMatch(/itemArrivalHandlers\.get\b/)
  })

  it('E5: source clears `itemArrivalHandlers` inside reset()', () => {
    const src = readInterpreterSource()
    expect(
      src,
      '`reset()` must clear the renamed map (mirroring the existing ' +
        '`eventHandlers.clear()` line).',
    ).toMatch(/itemArrivalHandlers\.clear\b/)
  })
})

describe('BlockInterpreter — currentSplitterItem → currentArrivingItem rename (E4i)', () => {
  it('F1: source does NOT contain the OLD field name `currentSplitterItem`', () => {
    const src = readInterpreterSource()
    expect(
      src,
      'After the rename the OLD identifier must not appear in the ' +
        'field declaration, in the predicate readers (`logicNs.currentItemIs*`), ' +
        'in the save/restore inside `triggerOnItemArrives`, or in `reset()`.',
    ).not.toMatch(/\bcurrentSplitterItem\b/)
  })

  it('F2: source contains the NEW field name `currentArrivingItem` (declaration)', () => {
    const src = readInterpreterSource()
    expect(
      src,
      'The `private currentArrivingItem: Item | null = null` declaration ' +
        'replaces the `currentSplitterItem` line.',
    ).toMatch(/\bprivate\s+currentArrivingItem\b/)
  })

  it('F3: predicate `logicNs.currentItemIsDefective` reads `currentArrivingItem`', () => {
    const src = readInterpreterSource()
    expect(
      src,
      'The two `logic.currentItemIs*` predicates that read the per-trigger ' +
        'ambient context must be updated to the new field name.',
    ).toMatch(/this\.currentArrivingItem/)
  })

  it('F4: source contains at least 3 occurrences of `currentArrivingItem`', () => {
    // Field declaration + save/restore (prev + assignment + finally restore)
    // + 2 predicate reads ⇒ at least 5 textual occurrences. Lower bound 3
    // is conservative against minor stylistic variation.
    const src = readInterpreterSource()
    const matches = src.match(/\bcurrentArrivingItem\b/g) ?? []
    expect(
      matches.length,
      'Declaration + save/restore inside triggerOnItemArrives + predicate ' +
        'readers should give at least 3 textual occurrences.',
    ).toBeGreaterThanOrEqual(3)
  })

  it('F5: `currentSplitterRouteDecision` was already deleted (Cycle B regression pin)', () => {
    const src = readInterpreterSource()
    expect(
      src,
      'Per the E3 wrap-up the per-item routing decision context was ' +
        'deleted in Cycle B. Pin here so an accidental revive lights up ' +
        'in the same cycle as the related renames.',
    ).not.toMatch(/\bcurrentSplitterRouteDecision\b/)
  })
})
