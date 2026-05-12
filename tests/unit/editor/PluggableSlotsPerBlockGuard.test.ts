import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * RED-adjacent guard tests for the PoC slice that ONLY changes
 * `factory_set_recipe`. The other 5 consumer blocks
 * (`factory_start_machine`, `factory_stop_machine`,
 * `factory_set_machine_speed`, `factory_on_machine_idle`,
 * `factory_set_belt_speed`) MUST keep their inline `FieldDropdown`
 * shape and MUST NOT be patched at runtime by
 * `pluggableSlotsPatcher.ts`.
 *
 * Why a separate per-block guard file:
 *
 * `tests/unit/editor/PxtEditorPluggableSlots.test.ts` pins a BROAD
 * "no patching anywhere" invariant via a handful of negative regex
 * scans over the entire `PxtEditor.ts` source. The PoC slice
 * narrows that invariant for `factory_set_recipe` ONLY — the GREEN
 * agent must relax those broad scans to allow patching for that one
 * block. Once relaxed, the broad scans no longer catch accidental
 * patching of OTHER blocks, so this file installs a per-block
 * safety net that survives the targeted relaxation.
 *
 * EXPECTED BEHAVIOUR: every assertion here PASSES today (PxtEditor
 * has no patching wiring at all). After GREEN it must continue to
 * pass — the only new wiring should target `factory_set_recipe`.
 *
 * COVERAGE — for each unchanged block, assert that its block-id
 * literal does NOT appear in any context that wires up the
 * pluggable-slot patcher (`patchPluggableSlots`, the
 * `PLUGGABLE_CONSUMER_TRANSFORMS` table override, or the
 * `migrateExistingWorkspaceBlocks` per-block-type loop).
 */

const PXT_EDITOR_PATH = resolve(__dirname, '../../../src/editor/PxtEditor.ts')
const PATCHER_PATH = resolve(__dirname, '../../../src/editor/pluggableSlotsPatcher.ts')

function readPxtEditor(): string {
  return readFileSync(PXT_EDITOR_PATH, 'utf8')
}

function readPatcher(): string {
  return readFileSync(PATCHER_PATH, 'utf8')
}

/**
 * The 5 unchanged consumer block ids. Each must appear in
 * `MACHINE_BLOCK_TYPES` / `BELT_BLOCK_TYPES` for the editor to
 * recognise them, but must NOT be wired into any pluggable-patch
 * code path inside PxtEditor.ts.
 */
const UNCHANGED_CONSUMER_BLOCKS = [
  'factory_start_machine',
  'factory_stop_machine',
  'factory_set_machine_speed',
  'factory_on_machine_idle',
  'factory_set_belt_speed',
] as const

/**
 * Tokens that appear in pluggable-patch wiring code paths. If the
 * GREEN agent adds patching for `factory_set_recipe`, these tokens
 * may show up adjacent to that block id only. They must NOT show
 * up adjacent to the unchanged block ids.
 */
const PATCH_WIRING_TOKENS = [
  'patchPluggableSlots',
  'migrateExistingWorkspaceBlocks',
  'installMigrationListener',
  'convertFieldToValueInput',
  'PLUGGABLE_CONSUMER_TRANSFORMS',
  'PLUGGABLE_REPORTER_TRANSFORMS',
  'patchPluggableMachineBeltSlots',
  '__rfPluggablePatched',
  '__rfPluggableMigrated',
]

/** Build a regex that matches any line containing both `blockId`
 * and any of `wiringTokens`. Lenient on whitespace and ordering. */
function patchWiringNearBlockIdRegex(blockId: string): RegExp {
  const tokenAlt = PATCH_WIRING_TOKENS.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|')
  return new RegExp(`(${tokenAlt}).{0,200}["']${blockId}["']|["']${blockId}["'].{0,200}(${tokenAlt})`, 's')
}

describe('PxtEditor.ts — pluggable-patch wiring is NOT applied to the 5 unchanged consumer blocks (PoC narrow scope)', () => {
  for (const blockId of UNCHANGED_CONSUMER_BLOCKS) {
    it(`${blockId} is NOT referenced anywhere alongside pluggable-patch wiring tokens in PxtEditor.ts`, () => {
      // GIVEN
      const source = readPxtEditor()

      // THEN
      expect(
        source,
        `${blockId} appears near a pluggable-patch wiring token. The PoC ` +
          `slice covers ONLY factory_set_recipe — patching any other ` +
          `consumer block re-introduces the historical enum-shadow ` +
          `compiler bug for blocks that haven't been validated.`,
      ).not.toMatch(patchWiringNearBlockIdRegex(blockId))
    })
  }
})

describe('pluggableSlotsPatcher.ts — `PLUGGABLE_CONSUMER_TRANSFORMS` (if exported) does NOT include the 5 unchanged consumer blocks', () => {
  // The patcher source file may stay in the tree (the GREEN agent
  // re-uses pieces of it for factory_set_recipe). But the consumer
  // transform table must NOT enumerate the unchanged blocks. If
  // any of them appear, an `installMigrationListener` /
  // `migrateExistingWorkspaceBlocks` call (whether re-wired in the
  // PoC or accidentally re-introduced later) would patch every
  // listed block, not just factory_set_recipe.

  for (const blockId of UNCHANGED_CONSUMER_BLOCKS) {
    it(`${blockId} is NOT listed in PLUGGABLE_CONSUMER_TRANSFORMS or any sibling transform table`, () => {
      // GIVEN
      const source = readPatcher()

      // Locate every `PLUGGABLE_*_TRANSFORMS` array literal and
      // assert the block id does not appear inside.
      const tableRe = /PLUGGABLE_[A-Z_]*TRANSFORMS\s*[:=][^\[]*\[([\s\S]*?)\]/g
      const inTable: string[] = []
      let m: RegExpExecArray | null
      while ((m = tableRe.exec(source)) !== null) {
        if (m[1].includes(`'${blockId}'`) || m[1].includes(`"${blockId}"`)) {
          inTable.push(m[0].slice(0, 80))
        }
      }

      // THEN
      expect(
        inTable,
        `${blockId} appears inside a PLUGGABLE_*_TRANSFORMS table — ` +
          `running migrateExistingWorkspaceBlocks would attempt to ` +
          `pluggable-patch this block, which is out of PoC scope.`,
      ).toHaveLength(0)
    })
  }
})

describe('PxtEditor.ts — bookkeeping for the broad guard relaxation', () => {
  it('the broad PluggableSlots guard test file still exists (must be relaxed in GREEN, not deleted)', () => {
    // GIVEN — the broad scans live in
    // `tests/unit/editor/PxtEditorPluggableSlots.test.ts`. The PoC
    // narrows them for factory_set_recipe only. The file must
    // survive that relaxation so the unchanged-block invariants
    // remain pinned.
    const broadPath = resolve(
      __dirname,
      'PxtEditorPluggableSlots.test.ts',
    )
    expect(
      readFileSync(broadPath, 'utf8').length,
      'The broad-guard test file is missing or empty. GREEN must ' +
        'narrow its scans to exclude factory_set_recipe — NOT delete ' +
        'them outright. The five unchanged consumer blocks still need ' +
        'a guard that PxtEditor.ts never wires the pluggable patch in ' +
        'on their behalf.',
    ).toBeGreaterThan(0)
  })
})
