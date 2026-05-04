import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level guard for the PXT block annotation that backs the new
 * `set machine speed` block.
 *
 * The PXT compiler in `pxt-target/` reads block metadata from JSDoc-style
 * `//% block=...` annotations on exported functions inside `namespace
 * machines { ... }`. We assert these are present so the block id, the
 * displayed label, and the function signature stay in sync with the
 * BlockInterpreter / FactoryToolbox / MACHINE_BLOCK_TYPES wiring.
 */

const FACTORY_TS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/factory.ts',
)

function readFactoryPxtSource(): string {
  return readFileSync(FACTORY_TS_PATH, 'utf8')
}

describe('pxt-target/libs/core/factory.ts — set machine speed block annotation', () => {
  it('declares blockId=factory_set_machine_speed', () => {
    // GIVEN
    const source = readFactoryPxtSource()

    // THEN
    expect(source).toMatch(/blockId=factory_set_machine_speed\b/)
  })

  it('declares the user-visible block label "set %machine speed to %speed"', () => {
    // GIVEN
    const source = readFactoryPxtSource()

    // THEN
    expect(source).toContain('block="set %machine speed to %speed"')
  })

  it('declares the function setMachineSpeed(machine: Machine, speed: number) inside namespace machines', () => {
    // GIVEN
    const source = readFactoryPxtSource()

    // WHEN — extract the body of `namespace machines { ... }`
    const nsStart = source.search(/namespace\s+machines\s*\{/)
    expect(nsStart, 'namespace machines must exist').toBeGreaterThan(-1)
    // Find the matching close brace by scanning depth.
    let depth = 0
    let i = source.indexOf('{', nsStart)
    let nsEnd = -1
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) {
          nsEnd = i
          break
        }
      }
    }
    expect(nsEnd, 'namespace machines must close').toBeGreaterThan(nsStart)
    const body = source.slice(nsStart, nsEnd + 1)

    // THEN
    expect(body).toMatch(
      /export\s+function\s+setMachineSpeed\s*\(\s*machine\s*:\s*Machine\s*,\s*speed\s*:\s*number\s*\)/,
    )
  })
})
