import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level guard for shadow-input wiring in
 * `pxt-target/libs/core/factory.ts`.
 *
 * To make the `factory_pick_machine` and `factory_pick_belt` reporters
 * pluggable into the corresponding action/event blocks, PXT requires the
 * source to declare each parameter with a `<param>.shadow="<blockId>"`
 * directive. This causes PXT to render a value input (with a shadow
 * reporter block) instead of a non-pluggable FieldDropdown.
 *
 * We assert these directives by inspecting the block annotation
 * (contiguous `//%` lines) immediately preceding each `export function`.
 * This mirrors the source-text approach used elsewhere in this folder
 * (PxtEditorMachineBlockTypes.test.ts, PxtEditorExtractions.test.ts).
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

describe('factory.ts shadow-input wiring — Machine action/event blocks', () => {
  const MACHINE_BLOCKS_WITH_SHADOW = [
    'factory_start_machine',
    'factory_stop_machine',
    'factory_set_recipe',
    'factory_set_machine_speed',
    'factory_on_machine_idle',
  ]

  for (const blockId of MACHINE_BLOCKS_WITH_SHADOW) {
    it(`${blockId} declares machine.shadow="factory_pick_machine"`, () => {
      // GIVEN
      const annotation = extractAnnotation(readFactorySource(), blockId)

      // THEN — a //% machine.shadow="factory_pick_machine" directive must
      // appear inside the block annotation so PXT renders a value input
      // populated with the pick-machine reporter as the shadow.
      expect(annotation).toMatch(/machine\.shadow\s*=\s*"factory_pick_machine"/)
    })
  }
})

describe('factory.ts shadow-input wiring — Belt action blocks', () => {
  it('factory_set_belt_speed declares belt.shadow="factory_pick_belt"', () => {
    // GIVEN
    const annotation = extractAnnotation(readFactorySource(), 'factory_set_belt_speed')

    // THEN
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
