/**
 * Task B (RED): StarvationGuard must consider the splitter's tertiary
 * port when walking the producer→consumer belt graph.
 *
 * Pins two things:
 *   1. `detectStarvation` queries the context for the tertiary port —
 *      assertable via a stub context that records every
 *      `getOutputBelt(machineId, port)` call.
 *   2. A consumer that is reachable ONLY through the splitter's
 *      tertiary edge MUST NOT be reported as starved.
 *
 * Today, `detectStarvation` iterates `['primary', 'secondary'] as const`
 * — the tertiary edge is invisible. The first test fails because no
 * tertiary lookup happens; the second fails because the consumer is
 * incorrectly flagged as starved.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { detectStarvation } from '../../../src/game/StarvationGuard'
import type { StarvationContext } from '../../../src/game/StarvationGuard'
import { Machine } from '../../../src/game/Machine'
import { ConveyorBelt } from '../../../src/game/ConveyorBelt'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import { getRecipeById } from '../../../src/game/Recipe'
import type { Recipe } from '../../../src/game/Recipe'
import type { MachineOutputPort } from '../../../src/game/types'

function recipe(id: string): Recipe {
  const r = getRecipeById(id)
  if (!r) throw new Error(`recipe ${id} not found`)
  return r
}

interface Fixture {
  machines: Map<string, Machine>
  belts: Map<string, ConveyorBelt>
  positions: Map<string, { x: number; z: number }>
  outputBelts: Map<string, Partial<Record<MachineOutputPort, string>>>
  portLookups: Array<{ machineId: string; port: MachineOutputPort }>
  context: StarvationContext
}

function newFixture(): Fixture {
  const machines = new Map<string, Machine>()
  const belts = new Map<string, ConveyorBelt>()
  const positions = new Map<string, { x: number; z: number }>()
  const outputBelts = new Map<string, Partial<Record<MachineOutputPort, string>>>()
  const portLookups: Array<{ machineId: string; port: MachineOutputPort }> = []

  const context: StarvationContext = {
    getOutputBelt(machineId, port) {
      portLookups.push({ machineId, port })
      return outputBelts.get(machineId)?.[port]
    },
    getBelt(id) {
      return belts.get(id)
    },
    findMachineAt(x, z) {
      for (const [id, p] of positions) if (p.x === x && p.z === z) return machines.get(id)
      return undefined
    },
    findBeltStartingAt(x, z) {
      for (const b of belts.values()) if (b.fromX === x && b.fromZ === z) return b
      return undefined
    },
  }
  return { machines, belts, positions, outputBelts, portLookups, context }
}

function place(f: Fixture, m: Machine, x: number, z: number): void {
  f.machines.set(m.id, m)
  f.positions.set(m.id, { x, z })
}

function wireBelt(
  f: Fixture,
  beltId: string,
  fromMachineId: string,
  toMachineId: string,
  port: MachineOutputPort,
): ConveyorBelt {
  const from = f.positions.get(fromMachineId)!
  const to = f.positions.get(toMachineId)!
  const belt = new ConveyorBelt(beltId, from.x, from.z, to.x, to.z, 1.0)
  f.belts.set(beltId, belt)
  const slot = f.outputBelts.get(fromMachineId) ?? {}
  slot[port] = beltId
  f.outputBelts.set(fromMachineId, slot)
  return belt
}

describe('detectStarvation — splitter tertiary port', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('queries the tertiary port for splitters that have a tertiary belt registered', () => {
    const f = newFixture()

    const fab = new Machine('fab', 'part_fabricator')
    fab.setRecipe(recipe('wheel_press_small'))
    fab.start()

    const splitter = new Machine('splitter', 'splitter')
    splitter.start()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()

    place(f, fab, 0, 0)
    place(f, splitter, 1, 0)
    place(f, assembler, 1, -1) // tertiary side ("left") of splitter

    wireBelt(f, 'b_in', 'fab', 'splitter', 'primary')
    wireBelt(f, 'b_tertiary', 'splitter', 'assembler', 'tertiary')

    detectStarvation(f.machines.values(), f.context, 5)

    const tertiaryLookups = f.portLookups.filter(
      (l) => l.machineId === 'splitter' && l.port === 'tertiary',
    )
    expect(
      tertiaryLookups.length,
      `detectStarvation should query the splitter's 'tertiary' port at least once. ` +
        `Recorded ports for 'splitter': [${f.portLookups
          .filter((l) => l.machineId === 'splitter')
          .map((l) => l.port)
          .join(', ')}]`,
    ).toBeGreaterThan(0)
  })

  it('does NOT report starvation when the missing input is reachable through the splitter tertiary edge', () => {
    const f = newFixture()

    // Layout: wheelFab → splitter → assembler (via tertiary edge).
    // Assembler has one wheel delivered, needs circuit_basic — none
    // available. Wheel chain reachable via tertiary should NOT cause
    // wheel_small to be reported, and the only flagged input must be
    // circuit_basic (truly missing).
    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    const splitter = new Machine('splitter', 'splitter')
    splitter.start()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('circuit_basic'))
    // wheel_small NOT delivered; reachable via tertiary chain only.

    place(f, wheelFab, 0, 0)
    place(f, splitter, 1, 0)
    place(f, assembler, 1, -1)

    wireBelt(f, 'b_in', 'wheelFab', 'splitter', 'primary')
    wireBelt(f, 'b_tertiary', 'splitter', 'assembler', 'tertiary')

    const info = detectStarvation(f.machines.values(), f.context, 11)
    expect(
      info,
      `expected null (wheel_small reachable through splitter tertiary edge), ` +
        `got starvation for ${info?.itemType ?? '<none>'} on machine ${info?.machineId ?? '<none>'} — ` +
        `the guard appears to ignore the 'tertiary' port`,
    ).toBeNull()
  })

  it('does report starvation for a truly missing input even when other reachable edges flow through tertiary', () => {
    // Same topology, but circuit producer is missing entirely AND
    // wheel_small is also missing. Wheel reachable via tertiary →
    // only circuit_basic should starve.
    const f = newFixture()

    const wheelFab = new Machine('wheelFab', 'part_fabricator')
    wheelFab.setRecipe(recipe('wheel_press_small'))
    wheelFab.start()

    const splitter = new Machine('splitter', 'splitter')
    splitter.start()

    const assembler = new Machine('assembler', 'assembler')
    assembler.setRecipe(recipe('assemble_drivetrain_basic'))
    assembler.start()
    assembler.addInput(createItem('wheel_small')) // only wheel delivered

    place(f, wheelFab, 0, 0)
    place(f, splitter, 1, 0)
    place(f, assembler, 1, -1)

    wireBelt(f, 'b_in', 'wheelFab', 'splitter', 'primary')
    wireBelt(f, 'b_tertiary', 'splitter', 'assembler', 'tertiary')

    const info = detectStarvation(f.machines.values(), f.context, 13)
    expect(info, 'expected starvation to fire for missing circuit_basic').not.toBeNull()
    expect(info!.machineId).toBe('assembler')
    expect(info!.itemType).toBe('circuit_basic')
  })
})
