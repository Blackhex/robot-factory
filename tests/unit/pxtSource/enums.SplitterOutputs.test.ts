import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E4b — RED-step source-content tests for the new `SplitterOutputs`
 * bitfield enum in `pxt-target/libs/core/enums.d.ts`.
 *
 * Players pick from a single dropdown showing 7 non-empty
 * combinations of {Left, Forward, Right}. Bit assignments must
 * match `SPLITTER_SIDE_BIT` in `src/game/types.ts`:
 *
 *   Left              = 1   (bit 0)
 *   Forward           = 2   (bit 1)
 *   Right             = 4   (bit 2)
 *   LeftForward       = 3   (Left | Forward)
 *   LeftRight         = 5   (Left | Right)
 *   ForwardRight      = 6   (Forward | Right)
 *   LeftForwardRight  = 7   (all)
 *
 * The runtime SplitterOutputs table in BlockInterpreter is already
 * derived from SPLITTER_SIDE_BIT (E2). This file pins the player-
 * facing PXT enum to those same values.
 */

const ENUMS_DTS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/enums.d.ts',
)

function readEnumsSource(): string {
  return readFileSync(ENUMS_DTS_PATH, 'utf8')
}

/**
 * Brace-balanced extraction of `declare const enum <name> { ... }`.
 */
function extractEnumBody(source: string, enumName: string): string {
  const re = new RegExp(`declare\\s+const\\s+enum\\s+${enumName}\\s*\\{`)
  const match = source.match(re)
  expect(match, `enum ${enumName} must exist in enums.d.ts`).not.toBeNull()
  const start = match!.index!
  const openBrace = source.indexOf('{', start)
  let depth = 0
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`enum ${enumName} did not close`)
}

/**
 * Read `Member = N,` (or `Member = N`) from the body of an enum
 * declaration. Returns null if the member is missing.
 */
function readMemberValue(enumBody: string, member: string): number | null {
  const re = new RegExp(`\\b${member}\\s*=\\s*(\\d+)\\b`)
  const m = enumBody.match(re)
  if (!m) return null
  return Number(m[1])
}

const EXPECTED_MEMBERS: Array<[string, number]> = [
  ['Left', 1],
  ['Forward', 2],
  ['Right', 4],
  ['LeftForward', 3],
  ['LeftRight', 5],
  ['ForwardRight', 6],
  ['LeftForwardRight', 7],
]

describe('enums.d.ts — SplitterOutputs bitfield enum (E4b)', () => {
  it('K: declares `declare const enum SplitterOutputs { ... }`', () => {
    const source = readEnumsSource()
    expect(
      source,
      'SplitterOutputs must be declared as a `declare const enum` so PXT ' +
        'compiles it like the other player-facing enums (PartType, Machine, ' +
        'Belt, Recipe, FactoryCondition, SplitterSide).',
    ).toMatch(/declare\s+const\s+enum\s+SplitterOutputs\s*\{/)
  })

  it.each(EXPECTED_MEMBERS)('K: SplitterOutputs.%s member exists', (member) => {
    const body = extractEnumBody(readEnumsSource(), 'SplitterOutputs')
    const value = readMemberValue(body, member)
    expect(
      value,
      `SplitterOutputs.${member} must be declared with a numeric value ` +
        `so the player-facing dropdown exposes the side combination.`,
    ).not.toBeNull()
  })

  it.each(EXPECTED_MEMBERS)(
    'L: SplitterOutputs.%s = %i (matches SPLITTER_SIDE_BIT bitfield)',
    (member, expected) => {
      const body = extractEnumBody(readEnumsSource(), 'SplitterOutputs')
      const value = readMemberValue(body, member)
      expect(value).toBe(expected)
    },
  )
})
