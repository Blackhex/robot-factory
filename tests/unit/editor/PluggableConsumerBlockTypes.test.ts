import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PLUGGABLE_CONSUMER_BLOCK_TYPES } from '../../../src/editor/pluggableConsumerBlockTypes'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pxtEditorPath = resolve(__dirname, '../../../src/editor/PxtEditor.ts')

const EXPECTED_SORTED = [
  'factory_on_machine_idle',
  'factory_set_belt_speed',
  'factory_set_machine_speed',
  'factory_set_recipe',
  'factory_start_machine',
  'factory_stop_machine',
]

describe('pluggable consumer block-type IDs are centralized in a shared module', () => {
  it('exports PLUGGABLE_CONSUMER_BLOCK_TYPES with exactly the 6 expected pluggable consumer block-type IDs', () => {
    expect(
      Array.isArray(PLUGGABLE_CONSUMER_BLOCK_TYPES),
      'PLUGGABLE_CONSUMER_BLOCK_TYPES must be an array',
    ).toBe(true)
    expect([...PLUGGABLE_CONSUMER_BLOCK_TYPES].sort()).toEqual(EXPECTED_SORTED)
    expect(
      Object.isFrozen(PLUGGABLE_CONSUMER_BLOCK_TYPES),
      'PLUGGABLE_CONSUMER_BLOCK_TYPES must be frozen (use Object.freeze or `as const` on a literal that satisfies Object.isFrozen)',
    ).toBe(true)
  })

  it('PxtEditor.ts imports PLUGGABLE_CONSUMER_BLOCK_TYPES from ./pluggableConsumerBlockTypes', () => {
    const src = readFileSync(pxtEditorPath, 'utf8')
    const importPattern =
      /import\s*\{[^}]*\bPLUGGABLE_CONSUMER_BLOCK_TYPES\b[^}]*\}\s*from\s*['"]\.\/pluggableConsumerBlockTypes['"]/
    expect(
      importPattern.test(src),
      'PxtEditor.ts must import { PLUGGABLE_CONSUMER_BLOCK_TYPES } from "./pluggableConsumerBlockTypes"',
    ).toBe(true)
  })

  it('PxtEditor.ts no longer inlines the 6 block-type alternation in the PLUGGABLE_CONSUMER_BLOCK_RE regex literal', () => {
    const src = readFileSync(pxtEditorPath, 'utf8')
    expect(
      src.includes('factory_set_recipe|factory_start_machine'),
      'PxtEditor.ts still contains the inlined regex alternation "factory_set_recipe|factory_start_machine"; build the RegExp from PLUGGABLE_CONSUMER_BLOCK_TYPES.join("|") instead',
    ).toBe(false)
  })

  it('PxtEditor.ts JSDoc on pendingDirectLoad no longer enumerates the 6 consumer block-type names inline', () => {
    const src = readFileSync(pxtEditorPath, 'utf8')
    expect(
      src.includes('`factory_set_recipe`, `factory_start_machine`'),
      'PxtEditor.ts JSDoc on `pendingDirectLoad` still enumerates the 6 block-type names inline; reference PLUGGABLE_CONSUMER_BLOCK_TYPES instead',
    ).toBe(false)
  })

  it('the watchdog docstring on maybeReapplyPendingDirectLoad uses "loaded XML" and no longer says "migrated XML"', () => {
    const src = readFileSync(pxtEditorPath, 'utf8')
    expect(
      src.includes('loaded XML'),
      'PxtEditor.ts watchdog docstring on `maybeReapplyPendingDirectLoad` must say "loaded XML"',
    ).toBe(true)
    expect(
      src.includes('migrated XML'),
      'PxtEditor.ts watchdog docstring on `maybeReapplyPendingDirectLoad` still says the stale "migrated XML"; rename to "loaded XML"',
    ).toBe(false)
  })
})
