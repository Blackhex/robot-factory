import { describe, it, expect } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import type { MachineType } from '../../../src/game/types'

/**
 * Tests for the injected `nameGenerator` hook on Factory / FactoryMachineRegistry
 * and the deterministic English no-space fallback when no generator is injected.
 *
 * These tests are expected to FAIL until:
 *   - `new Factory(w, h, { nameGenerator })` (or an equivalent setter) is wired
 *   - `placeMachine()` writes `name = nameGenerator(type, n)` when injected
 *   - The default fallback produces `<HumanizedType><N>` with NO space
 *     (e.g. `PartFabricator1`, `Assembler1`, `FactoryOutput1`).
 */

type MachineNameGenerator = (type: MachineType, n: number) => string

interface FactoryOptions {
  nameGenerator?: MachineNameGenerator
}

function makeFactory(opts?: FactoryOptions): Factory {
  // Cast to silence TS until the option is added to the public Factory constructor.
  const Ctor = Factory as unknown as new (w: number, h: number, opts?: FactoryOptions) => Factory
  return new Ctor(10, 10, opts)
}

describe('FactoryMachineRegistry — injected name generator', () => {
  it('uses the injected nameGenerator when placeMachine is called', () => {
    // GIVEN — a generator that returns `${type}-${n}` (no space, type-id form).
    const gen: MachineNameGenerator = (type, n) => `${type}-${n}`
    const factory = makeFactory({ nameGenerator: gen })

    // WHEN
    factory.placeMachine(1, 1, 'part_fabricator', 'south')

    // THEN
    expect(factory.getMachineAt(1, 1)!.name).toBe('part_fabricator-1')
  })

  it('passes a 1-based per-type counter that increments per placement of the same type', () => {
    // GIVEN
    const gen: MachineNameGenerator = (type, n) => `${type}#${n}`
    const factory = makeFactory({ nameGenerator: gen })

    // WHEN — place three of the same type.
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.placeMachine(2, 1, 'part_fabricator', 'south')
    factory.placeMachine(3, 1, 'part_fabricator', 'south')

    // THEN — counter is 1, 2, 3.
    expect(factory.getMachineAt(1, 1)!.name).toBe('part_fabricator#1')
    expect(factory.getMachineAt(2, 1)!.name).toBe('part_fabricator#2')
    expect(factory.getMachineAt(3, 1)!.name).toBe('part_fabricator#3')
  })

  it('keeps per-type counters independent', () => {
    // GIVEN
    const gen: MachineNameGenerator = (type, n) => `${type}:${n}`
    const factory = makeFactory({ nameGenerator: gen })

    // WHEN — spread along x=1 with z-spacing ≥2 so side-slot machines
    // (assembler) do not have their slot cells overlap a neighbor's body.
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.placeMachine(1, 3, 'assembler', 'south')
    factory.placeMachine(1, 5, 'part_fabricator', 'south')
    factory.placeMachine(1, 7, 'assembler', 'south')

    // THEN — each type counts from 1 independently.
    expect(factory.getMachineAt(1, 1)!.name).toBe('part_fabricator:1')
    expect(factory.getMachineAt(1, 3)!.name).toBe('assembler:1')
    expect(factory.getMachineAt(1, 5)!.name).toBe('part_fabricator:2')
    expect(factory.getMachineAt(1, 7)!.name).toBe('assembler:2')
  })

  it('produces a localized-style no-space label when generator uses a label map', () => {
    // GIVEN — a generator emulating an i18n-backed lookup (EN side).
    const labels: Record<MachineType, string> = {
      part_fabricator: 'Fabricator',
      assembler: 'Assembler',
      painter: 'Painter',
      recycler: 'Recycler',
      splitter: 'Splitter',
      factory_output: 'Shipper',
    }
    const gen: MachineNameGenerator = (type, n) => `${labels[type]}${n}`
    const factory = makeFactory({ nameGenerator: gen })

    // WHEN — spread along x=1 with z-spacing ≥2 so side-slot machines
    // (assembler, factory_output) do not block one another.
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.placeMachine(1, 3, 'part_fabricator', 'south')
    factory.placeMachine(1, 5, 'assembler', 'south')
    factory.placeMachine(1, 7, 'factory_output', 'south')

    // THEN — no space between label and counter.
    expect(factory.getMachineAt(1, 1)!.name).toBe('Fabricator1')
    expect(factory.getMachineAt(1, 3)!.name).toBe('Fabricator2')
    expect(factory.getMachineAt(1, 5)!.name).toBe('Assembler1')
    expect(factory.getMachineAt(1, 7)!.name).toBe('Shipper1')
  })
})

describe('FactoryMachineRegistry — default (no generator) fallback', () => {
  /**
   * When no generator is injected, the registry must still emit a deterministic
   * English no-space name so unit tests work without i18n bootstrap.
   * Expected format: `<HumanizedType><N>` — humanized from the machine_type id
   * (snake_case → PascalCase), joined WITHOUT a space, suffixed with the
   * per-type counter.
   */
  it('emits `<HumanizedType><N>` with no space between the label and the index', () => {
    // GIVEN
    const factory = makeFactory()

    // WHEN — spread along x=1 with z-spacing ≥2 so side-slot machines
    // (assembler, factory_output, splitter) do not block one another.
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.placeMachine(1, 3, 'assembler', 'south')
    factory.placeMachine(1, 5, 'factory_output', 'south')
    factory.placeMachine(1, 7, 'splitter', 'south')

    // THEN
    expect(factory.getMachineAt(1, 1)!.name).toBe('PartFabricator1')
    expect(factory.getMachineAt(1, 3)!.name).toBe('Assembler1')
    expect(factory.getMachineAt(1, 5)!.name).toBe('FactoryOutput1')
    expect(factory.getMachineAt(1, 7)!.name).toBe('Splitter1')
  })

  it('does NOT emit the legacy space-separated format', () => {
    // GIVEN
    const factory = makeFactory()

    // WHEN
    factory.placeMachine(1, 1, 'part_fabricator', 'south')

    // THEN — explicitly assert the legacy "Part Fabricator 1" shape is gone.
    const name = factory.getMachineAt(1, 1)!.name
    expect(name).not.toMatch(/^Part Fabricator \d+$/)
    expect(name).not.toContain(' ')
  })

  it('increments the per-type counter starting from 1', () => {
    // GIVEN
    const factory = makeFactory()

    // WHEN
    factory.placeMachine(1, 1, 'part_fabricator', 'south')
    factory.placeMachine(2, 1, 'part_fabricator', 'south')
    factory.placeMachine(3, 1, 'part_fabricator', 'south')

    // THEN
    expect(factory.getMachineAt(1, 1)!.name).toBe('PartFabricator1')
    expect(factory.getMachineAt(2, 1)!.name).toBe('PartFabricator2')
    expect(factory.getMachineAt(3, 1)!.name).toBe('PartFabricator3')
  })
})
