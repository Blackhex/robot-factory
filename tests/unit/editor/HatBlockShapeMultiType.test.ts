/**
 * RED-step source-level tests for Task D: the runtime hat-shape patch
 * in `src/editor/hatBlockShape.ts` must apply to BOTH
 * `factory_on_machine_idle` (existing) AND `factory_on_item_arrives`
 * (new in Task C).
 *
 * The Blockly runtime is awkward to drive from Vitest, so these tests
 * assert on the source-file contents directly. They are intentionally
 * resilient to Set-vs-array-vs-disjunction refactor styles.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC_PATH = join(__dirname, '..', '..', '..', 'src', 'editor', 'hatBlockShape.ts')
const SRC = readFileSync(SRC_PATH, 'utf-8')

describe('hatBlockShape.ts — multi-type hat support (Task D)', () => {
  it('T16: source contains the literal "factory_on_item_arrives"', () => {
    expect(SRC).toContain("'factory_on_item_arrives'")
  })

  it('T17: source no longer pins the hat list to a single-value constant for factory_on_machine_idle', () => {
    // (a) The single-value `const HAT_BLOCK_TYPE = 'factory_on_machine_idle'`
    //     literal is no longer valid: the value must reference both block
    //     types (Set / array / disjunction) OR the constant must be gone.
    const singleValueConst = /const\s+HAT_BLOCK_TYPE\s*=\s*['"]factory_on_machine_idle['"]\s*;?\s*$/m
    expect(SRC, 'hat-type list must include factory_on_item_arrives, not just factory_on_machine_idle')
      .not.toMatch(singleValueConst)

    // (b) Independently, every comparison against the hat type set must
    //     handle the new block too. Accept any of:
    //       - `block.type === 'factory_on_machine_idle' || block.type === 'factory_on_item_arrives'`
    //       - `HAT_BLOCK_TYPES.has(block.type)` / `.includes(block.type)`
    //       - a Set/array literal containing both type strings
    const idleAndArrivesDisjunction =
      /factory_on_machine_idle[\s\S]{0,80}factory_on_item_arrives|factory_on_item_arrives[\s\S]{0,80}factory_on_machine_idle/
    const setOrArrayCheck = /\.(has|includes)\s*\(/
    const handlesBoth =
      idleAndArrivesDisjunction.test(SRC) || (setOrArrayCheck.test(SRC) && SRC.includes("'factory_on_item_arrives'"))
    expect(
      handlesBoth,
      'hatBlockShape.ts must check for both factory_on_machine_idle and factory_on_item_arrives (Set/array/disjunction)',
    ).toBe(true)
  })
})
