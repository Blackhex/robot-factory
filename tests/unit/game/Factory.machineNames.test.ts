import { describe, it, expect } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import type { MachineType } from '../../../src/game/types'

/**
 * Tests for `Factory.relocalizeAutoNames(generator)`.
 *
 * Behavior under test:
 *   - Walk every machine. If the current `name` matches ANY known
 *     auto-generated pattern (legacy space-separated, no-space humanized,
 *     or any locale's `<Label><N>` form), replace it with
 *     `generator(type, perTypeIndex)` where the index reflects placement
 *     order (Nth-placed machine of that type → index N).
 *   - Custom (user-renamed) names are left UNCHANGED.
 *   - Per-type counters reseed so subsequent placeMachine() calls continue
 *     from the highest-used N for each type.
 *
 * Expected to FAIL until `relocalizeAutoNames` is implemented.
 */

type MachineNameGenerator = (type: MachineType, n: number) => string

interface FactoryWithRelocalize {
  relocalizeAutoNames(generator: MachineNameGenerator): void
}

function asRelocalizable(factory: Factory): Factory & FactoryWithRelocalize {
  return factory as Factory & FactoryWithRelocalize
}

const EN_LABELS: Record<MachineType, string> = {
  part_fabricator: 'Fabricator',
  assembler: 'Assembler',
  painter: 'Painter',
  recycler: 'Recycler',
  splitter: 'Splitter',
  factory_output: 'Shipper',
}

const CS_LABELS: Record<MachineType, string> = {
  part_fabricator: 'Vyráběč',
  assembler: 'Montovač',
  painter: 'Lakovač',
  recycler: 'Recyklovač',
  splitter: 'Rozdělovač',
  factory_output: 'Odesílač',
}

function makeEnGenerator(): MachineNameGenerator {
  return (type, n) => `${EN_LABELS[type]}${n}`
}

function makeCsGenerator(): MachineNameGenerator {
  return (type, n) => `${CS_LABELS[type]}${n}`
}

describe('Factory.relocalizeAutoNames', () => {
  it('exists as a public method on Factory', () => {
    const factory = new Factory(10, 10)
    expect(typeof (factory as unknown as FactoryWithRelocalize).relocalizeAutoNames).toBe('function')
  })

  it('renames machines that have the legacy space-separated auto-name', () => {
    // GIVEN — a factory whose machine has the legacy `Part Fabricator 1` name.
    const factory = new Factory(10, 10)
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    // Force the legacy format directly to simulate a loaded older save.
    factory.renameMachine(1, 1, 'Part Fabricator 1')

    // WHEN
    asRelocalizable(factory).relocalizeAutoNames(makeEnGenerator())

    // THEN
    expect(factory.getMachineAt(1, 1)!.name).toBe('Fabricator1')
  })

  it('renames machines that have the new no-space humanized auto-name', () => {
    // GIVEN
    const factory = new Factory(10, 10)
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.renameMachine(1, 1, 'PartFabricator1')

    // WHEN
    asRelocalizable(factory).relocalizeAutoNames(makeCsGenerator())

    // THEN
    expect(factory.getMachineAt(1, 1)!.name).toBe('Vyráběč1')
  })

  it('renames machines that have a localized auto-name from another language', () => {
    // GIVEN — an English-localized auto-name being switched to Czech.
    const factory = new Factory(10, 10)
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.renameMachine(1, 1, 'Fabricator1')

    // WHEN
    asRelocalizable(factory).relocalizeAutoNames(makeCsGenerator())

    // THEN
    expect(factory.getMachineAt(1, 1)!.name).toBe('Vyráběč1')
  })

  it('renames Czech-localized auto-names when switching to English', () => {
    // GIVEN
    const factory = new Factory(10, 10)
    factory.placeMachine(1, 1, 'assembler', 'south')
    factory.renameMachine(1, 1, 'Montovač1')

    // WHEN
    asRelocalizable(factory).relocalizeAutoNames(makeEnGenerator())

    // THEN
    expect(factory.getMachineAt(1, 1)!.name).toBe('Assembler1')
  })

  it('leaves custom (user-renamed) machine names UNCHANGED', () => {
    // GIVEN — a mix of auto and custom names.
    const factory = new Factory(10, 10)
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.placeMachine(4, 1, 'part_fabricator', 'south')
    factory.placeMachine(7, 1, 'assembler', 'south')
    factory.renameMachine(4, 1, 'My Cool Bot')
    factory.renameMachine(7, 1, 'Bob')

    // WHEN
    asRelocalizable(factory).relocalizeAutoNames(makeEnGenerator())

    // THEN — auto becomes localized; custom names are preserved verbatim.
    expect(factory.getMachineAt(1, 1)!.name).toBe('Fabricator1')
    expect(factory.getMachineAt(4, 1)!.name).toBe('My Cool Bot')
    expect(factory.getMachineAt(7, 1)!.name).toBe('Bob')
  })

  it('renames machines using placement-order index per type, not stored counter', () => {
    // GIVEN — three fabricators placed in order; one assembler.
    const factory = new Factory(10, 10)
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.placeMachine(4, 1, 'part_fabricator', 'south')
    factory.placeMachine(7, 1, 'part_fabricator', 'south')
    factory.placeMachine(1, 4, 'assembler', 'south')

    // WHEN — relocalize to CS.
    asRelocalizable(factory).relocalizeAutoNames(makeCsGenerator())

    // THEN — 1st-placed fabricator → Vyráběč1, 2nd → Vyráběč2, 3rd → Vyráběč3;
    // 1st assembler → Montovač1.
    expect(factory.getMachineAt(1, 1)!.name).toBe('Vyráběč1')
    expect(factory.getMachineAt(4, 1)!.name).toBe('Vyráběč2')
    expect(factory.getMachineAt(7, 1)!.name).toBe('Vyráběč3')
    expect(factory.getMachineAt(1, 4)!.name).toBe('Montovač1')
  })

  it('reseeds the per-type counter so the next placeMachine continues from the highest used N', () => {
    // GIVEN — three fabricators (Vyráběč1..3), then relocalize back to EN.
    const factory = new Factory(10, 10)
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.placeMachine(4, 1, 'part_fabricator', 'south')
    factory.placeMachine(7, 1, 'part_fabricator', 'south')
    asRelocalizable(factory).relocalizeAutoNames(makeEnGenerator())
    // sanity
    expect(factory.getMachineAt(7, 1)!.name).toBe('Fabricator3')

    // WHEN — place a new fabricator AFTER relocalization.
    factory.placeMachine(1, 4, 'part_fabricator', 'south')

    // THEN — the new machine continues the sequence at 4, not restarts at 1.
    expect(factory.getMachineAt(1, 4)!.name).toMatch(/4$/)
    expect(factory.getMachineAt(1, 4)!.name).not.toBe('Fabricator1')
  })

  it('leaves custom names that happen to share a prefix with a localized label alone', () => {
    // GIVEN — custom names that are NOT auto-pattern matches.
    const factory = new Factory(10, 10)
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.placeMachine(4, 1, 'part_fabricator', 'south')
    factory.renameMachine(1, 1, 'Fabricator-A')   // dash → not auto
    factory.renameMachine(4, 1, 'Fabricator 1A')  // trailing letter → not auto

    // WHEN
    asRelocalizable(factory).relocalizeAutoNames(makeCsGenerator())

    // THEN — both names preserved.
    expect(factory.getMachineAt(1, 1)!.name).toBe('Fabricator-A')
    expect(factory.getMachineAt(4, 1)!.name).toBe('Fabricator 1A')
  })
})
