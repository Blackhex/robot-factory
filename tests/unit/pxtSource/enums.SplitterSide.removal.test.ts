import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E4i — RED-step pins for deletion of the player-facing `SplitterSide`
 * enum from PXT (`pxt-target/libs/core/enums.d.ts`) and the matching
 * locale entries (`pxt-target/libs/core/_locales/core-strings.json`).
 *
 * Rationale:
 *
 *   After E4h the only consumers of `SplitterSide` were the legacy
 *   bridge code paths in `BlockInterpreter.ts`, `MachineBehaviors.ts`,
 *   and `wireSimulationEffects.ts`. Once those are deleted, the enum
 *   has no remaining player-callable surface — `routeItemsTo` uses
 *   the `SplitterOutputs` bitfield enum and per-item routing is gone.
 *
 *   `SPLITTER_SIDE_BY_INDEX` in `src/game/types.ts` was the canonical
 *   mirror of the PXT enum (used to derive `SplitterSideEnum` in the
 *   interpreter). After E4h that derivation is removed, so the
 *   constant has no consumers and is deleted in E4i too.
 *
 *   `SPLITTER_SIDES_IN_BIT_ORDER` is a SEPARATE constant used by
 *   `MachineBehaviors.tickSplitter` round-robin — it stays.
 *
 *   `SplitterSide` (the runtime type alias) is referenced by
 *   `SPLITTER_SIDE_TO_PORT`, `SPLITTER_SIDE_BIT`, and
 *   `SPLITTER_SIDES_IN_BIT_ORDER` — it stays as a structural label.
 *
 *   The 3 PXT locale entries (`SplitterSide.{Forward,Left,Right}|block`)
 *   only label enum members, so they go away with the enum.
 */

const ENUMS_DTS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/enums.d.ts',
)
const CORE_STRINGS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/_locales/core-strings.json',
)
const TYPES_TS_PATH = resolve(
  __dirname,
  '../../../src/game/types.ts',
)

function readEnumsSource(): string {
  return readFileSync(ENUMS_DTS_PATH, 'utf8')
}
function readCoreStrings(): Record<string, string> {
  return JSON.parse(readFileSync(CORE_STRINGS_PATH, 'utf8'))
}
function readTypesSource(): string {
  return readFileSync(TYPES_TS_PATH, 'utf8')
}

describe('PXT enums.d.ts — SplitterSide enum removal (E4i)', () => {
  it('K1: enums.d.ts does NOT declare `enum SplitterSide`', () => {
    const src = readEnumsSource()
    expect(
      src,
      'The enum was the player-callable name for per-item routing. ' +
        'Per-item routing is gone (`routeItemsTo` uses `SplitterOutputs`); ' +
        'no remaining player-facing block accepts a `SplitterSide` arg.',
    ).not.toMatch(/declare\s+const\s+enum\s+SplitterSide\b/)
  })

  it('K2: enums.d.ts contains NO occurrence of the identifier `SplitterSide`', () => {
    const src = readEnumsSource()
    expect(
      src,
      'Catches the trailing comment block ("Splitter routing ...") and ' +
        'the "Manual mirror of SPLITTER_SIDE_BY_INDEX" docstring that the ' +
        'enum carried.',
    ).not.toMatch(/\bSplitterSide\b/)
  })
})

describe('PXT core-strings.json — SplitterSide locale entries removed (E4i / L)', () => {
  it('L1: key "SplitterSide.Forward|block" is REMOVED', () => {
    const strings = readCoreStrings()
    expect(strings).not.toHaveProperty('SplitterSide.Forward|block')
  })

  it('L2: key "SplitterSide.Left|block" is REMOVED', () => {
    const strings = readCoreStrings()
    expect(strings).not.toHaveProperty('SplitterSide.Left|block')
  })

  it('L3: key "SplitterSide.Right|block" is REMOVED', () => {
    const strings = readCoreStrings()
    expect(strings).not.toHaveProperty('SplitterSide.Right|block')
  })

  it('L4: NO key starting with "SplitterSide." remains', () => {
    const strings = readCoreStrings()
    const residuals = Object.keys(strings).filter(k => k.startsWith('SplitterSide.'))
    expect(
      residuals,
      'A future contributor adding a new SplitterSide.* member would ' +
        'create a stale key. Pin the whole namespace.',
    ).toEqual([])
  })
})

describe('src/game/types.ts — SPLITTER_SIDE_BY_INDEX deletion (E4i / M)', () => {
  it('M1: `SPLITTER_SIDE_BY_INDEX` is no longer exported from types.ts', () => {
    const src = readTypesSource()
    expect(
      src,
      'After E4h removes the BlockInterpreter SplitterSideEnum derivation, ' +
        'this constant has zero consumers. Per the spec it is deleted in ' +
        'E4i. `SPLITTER_SIDES_IN_BIT_ORDER` is a SEPARATE constant used by ' +
        '`MachineBehaviors.tickSplitter` and remains untouched.',
    ).not.toMatch(/\bSPLITTER_SIDE_BY_INDEX\b/)
  })

  it('M2: `SPLITTER_SIDES_IN_BIT_ORDER` IS still exported (positive guard — used by tickSplitter)', () => {
    const src = readTypesSource()
    expect(
      src,
      'Sanity check — only the unused `SPLITTER_SIDE_BY_INDEX` mirror is ' +
        'deleted. The bit-order constant is the round-robin iteration ' +
        'driver and must survive.',
    ).toMatch(/export\s+const\s+SPLITTER_SIDES_IN_BIT_ORDER\b/)
  })

  it('M3: `SplitterSide` runtime type alias IS still declared (positive guard — used by SPLITTER_SIDE_TO_PORT etc.)', () => {
    const src = readTypesSource()
    expect(
      src,
      'The structural type label is still referenced by ' +
        '`SPLITTER_SIDE_TO_PORT`, `SPLITTER_SIDE_BIT`, and ' +
        '`SPLITTER_SIDES_IN_BIT_ORDER`. Only the PXT-facing enum and the ' +
        'unused index mirror go away.',
    ).toMatch(/export\s+type\s+SplitterSide\b/)
  })
})
