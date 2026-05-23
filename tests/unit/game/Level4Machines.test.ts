/**
 * RED-step tests for Task D: Level 4 unlocks the Splitter and Recycler
 * machines on the placement toolbar.
 *
 * Currently `level_4` only lists ['part_fabricator', 'assembler',
 * 'factory_output']. Splitter doesn't show up until level_5.
 */
import { describe, it, expect } from 'vitest'
import { getLevelById } from '../../../src/game/Level'

describe('Level 4 availableMachines (Task D)', () => {
  const level4 = getLevelById('level_4')

  it('exists', () => {
    expect(level4, 'level_4 must be defined').toBeDefined()
  })

  it('T13: includes splitter', () => {
    expect(level4!.availableMachines).toContain('splitter')
  })

  it('T14: includes recycler', () => {
    expect(level4!.availableMachines).toContain('recycler')
  })

  it('T15: regression — still includes part_fabricator, assembler, factory_output', () => {
    expect(level4!.availableMachines).toContain('part_fabricator')
    expect(level4!.availableMachines).toContain('assembler')
    expect(level4!.availableMachines).toContain('factory_output')
  })
})
