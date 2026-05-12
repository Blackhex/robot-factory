import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level guard for shadow-input wiring in
 * `pxt-target/libs/core/factory.ts`.
 *
 * REVERSION: the pluggable Machine/Belt slot pattern (driven by
 * `//% machine.shadow="factory_pick_machine"` /
 * `//% belt.shadow="factory_pick_belt"` directives on each consumer
 * block) exposed a structural PXT compiler bug: blocks→TS compilation
 * always emits the enum's default member (Machine.A === 0) for the
 * shadow's argument, regardless of the field value carried by the
 * shadow. Every program that referenced Machine.B/C/D/etc was
 * silently broken at compile time.
 *
 * The fix is to revert each consumer block's slot to a plain enum
 * FieldDropdown (which PXT compiles correctly), and to remove the
 * `<param>.shadow="..."` directives from factory.ts. These guards
 * assert the directives are GONE — if they ever come back, the
 * compiler bug returns with them.
 */

const FACTORY_TS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/factory.ts',
)

function readFactorySource(): string {
  return readFileSync(FACTORY_TS_PATH, 'utf8')
}

/**
 * Return the contiguous `//%` annotation block surrounding the line that
 * declares `blockId=<blockId>`. Includes adjacent `//%` lines both above
 * and below the matched line (so directives may appear on either side).
 */
function extractAnnotation(source: string, blockId: string): string {
  const lines = source.split('\n')
  let lineIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`blockId=${blockId}`)) {
      lineIdx = i
      break
    }
  }
  expect(lineIdx, `${blockId} declaration must exist in factory.ts`).toBeGreaterThan(-1)

  let start = lineIdx
  while (start > 0 && lines[start - 1].trim().startsWith('//%')) start--
  let end = lineIdx
  while (end < lines.length - 1 && lines[end + 1].trim().startsWith('//%')) end++
  return lines.slice(start, end + 1).join('\n')
}

/**
 * Return the source between `namespace <ns> {` and the matching closing
 * brace `}` anchored at the start of a line (column 0).
 */
function extractNamespaceBody(source: string, namespaceName: string): string {
  const re = new RegExp(`namespace\\s+${namespaceName}\\s*\\{[\\s\\S]*?^\\}`, 'm')
  const match = source.match(re)
  expect(match, `namespace ${namespaceName} must exist in factory.ts`).not.toBeNull()
  return match![0]
}

describe('factory.ts — pluggable Machine consumer blocks declare the shadow directive (post-rollout)', () => {
  // After LegacyPluggableMigrationRollout, all 5 Machine consumer
  // blocks take a `number`-typed slot (not the `Machine` enum), so
  // PXT honours the `//% machine.shadow="factory_pick_machine"`
  // directive and renders the slot as a value input pre-populated
  // with the reporter. The PXT enum-shadow compiler bug only fires
  // when the parameter is enum-typed, so flipping to `number` makes
  // the directive safe to declare. See
  // LegacyPluggableMigrationRollout.test.ts for the full contract.
  const MACHINE_CONSUMER_BLOCKS = [
    'factory_set_recipe',
    'factory_start_machine',
    'factory_stop_machine',
    'factory_set_machine_speed',
    'factory_on_machine_idle',
  ]

  for (const blockId of MACHINE_CONSUMER_BLOCKS) {
    it(`${blockId} declares machine.shadow="factory_pick_machine"`, () => {
      // GIVEN
      const annotation = extractAnnotation(readFactorySource(), blockId)

      // THEN — the //% machine.shadow="factory_pick_machine" directive
      // must be present so PXT generates the `_shadowOverrides` entry
      // on the API metadata and renders the slot as a value input.
      expect(annotation).toMatch(/machine\.shadow\s*=\s*"factory_pick_machine"/)
    })
  }
})

describe('factory.ts — pluggable Belt consumer block declares the shadow directive (post-rollout)', () => {
  it('factory_set_belt_speed declares belt.shadow="factory_pick_belt"', () => {
    // GIVEN
    const annotation = extractAnnotation(readFactorySource(), 'factory_set_belt_speed')

    // THEN — same post-rollout contract, applied to the Belt-typed
    // sibling. The slot param is `number`, so PXT honours the
    // directive and renders the value input pre-populated with the
    // factory_pick_belt reporter.
    expect(annotation).toMatch(/belt\.shadow\s*=\s*"factory_pick_belt"/)
  })
})

describe('factory.ts — pickBelt reporter is defined inside namespace belts', () => {
  it('namespace belts contains a pickBelt function with blockId=factory_pick_belt', () => {
    // GIVEN
    const beltsBody = extractNamespaceBody(readFactorySource(), 'belts')

    // THEN — the reporter must be inside the belts namespace
    expect(beltsBody).toMatch(/blockId=factory_pick_belt/)
    expect(beltsBody).toMatch(/export\s+function\s+pickBelt\s*\(/)
  })

  it('pickBelt declares block="%belt"', () => {
    // GIVEN
    const beltsBody = extractNamespaceBody(readFactorySource(), 'belts')

    // THEN — the block template must be the bare belt parameter (mirrors
    // pickMachine which uses block="%machine"), so it can shadow into
    // belt-typed value inputs.
    expect(beltsBody).toMatch(/block="%belt"/)
  })

  it('pickBelt takes a Belt and returns a Belt', () => {
    // GIVEN
    const beltsBody = extractNamespaceBody(readFactorySource(), 'belts')

    // THEN
    expect(beltsBody).toMatch(
      /export\s+function\s+pickBelt\s*\(\s*belt\s*:\s*Belt\s*\)\s*:\s*Belt/,
    )
  })
})
