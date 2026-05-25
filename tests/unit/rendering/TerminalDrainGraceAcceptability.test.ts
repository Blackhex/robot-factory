import { describe, it, expect } from 'vitest'
import { createItem } from '../../../src/game/Item'
import { Machine } from '../../../src/game/Machine'
import { getRecipeById } from '../../../src/game/Recipe'
import type { ItemType } from '../../../src/game/types'

type BeltEndpoint = {
  toX: number
  toZ: number
}

type FrontItem = {
  type: ItemType
}

type TerminalDrainGraceDecider = (
  belt: BeltEndpoint,
  frontItem: FrontItem | undefined,
) => boolean

type CreateTerminalDrainGraceDecider = (deps: {
  getMachineAt: (x: number, z: number) => { id: string } | null | undefined
  getMachineById: (id: string) => Pick<Machine, 'canAcceptInput' | 'canConsume'> | undefined
}) => TerminalDrainGraceDecider

const ENDPOINT: BeltEndpoint = { toX: 4, toZ: 0 }

async function loadSubject(): Promise<CreateTerminalDrainGraceDecider> {
  const mod = await import('../../../src/rendering/TerminalDrainGraceAcceptability')
  if (typeof mod.createTerminalDrainGraceDecider !== 'function') {
    throw new Error(
      'Expected createTerminalDrainGraceDecider to be exported from src/rendering/TerminalDrainGraceAcceptability',
    )
  }
  return mod.createTerminalDrainGraceDecider as CreateTerminalDrainGraceDecider
}

async function createDecider(
  machineAtEndpoint: Machine | undefined,
): Promise<TerminalDrainGraceDecider> {
  const createTerminalDrainGraceDecider = await loadSubject()
  return createTerminalDrainGraceDecider({
    getMachineAt: (x, z) =>
      x === ENDPOINT.toX && z === ENDPOINT.toZ && machineAtEndpoint
        ? { id: machineAtEndpoint.id }
        : undefined,
    getMachineById: (id) =>
      machineAtEndpoint && id === machineAtEndpoint.id ? machineAtEndpoint : undefined,
  })
}

function startedFactoryOutput(): Machine {
  const machine = new Machine('output', 'factory_output')
  machine.start()
  return machine
}

function startedAssemblerThatConsumes(itemType: ItemType): Machine {
  const machine = new Machine('assembler', 'assembler')
  machine.setRecipe(getRecipeById('assemble_drivetrain_basic')!)
  machine.start()

  if (!machine.canConsume(itemType)) {
    throw new Error(`test setup expected assembler to consume ${itemType}`)
  }

  return machine
}

describe('createTerminalDrainGraceDecider', () => {
  it('returns true for a started factory_output at the belt endpoint', async () => {
    const decider = await createDecider(startedFactoryOutput())

    expect(decider(ENDPOINT, { type: 'wheel_small' })).toBe(true)
  })

  it('returns true for a started endpoint machine that has capacity and consumes the arriving type', async () => {
    const decider = await createDecider(startedAssemblerThatConsumes('wheel_small'))

    expect(decider(ENDPOINT, { type: 'wheel_small' })).toBe(true)
  })

  it('returns false for a disabled factory_output at the belt endpoint', async () => {
    const decider = await createDecider(new Machine('output', 'factory_output'))

    expect(decider(ENDPOINT, { type: 'wheel_small' })).toBe(false)
  })

  it('returns false when the endpoint machine cannot consume the arriving item type', async () => {
    const decider = await createDecider(startedAssemblerThatConsumes('wheel_small'))

    expect(decider(ENDPOINT, { type: 'wheel_medium' })).toBe(false)
  })

  it('returns false when the endpoint machine has no input capacity left', async () => {
    const machine = startedAssemblerThatConsumes('wheel_small')
    // Force-fill all 4 input slots with wheels by raw push, bypassing
    // addInput's per-type recipe quota (recipe asks for only 2 wheels).
    // The decider under test only consults canAcceptInput, which is the
    // cheap "any slot free?" predicate — see Machine.canAcceptItemType.test.ts.
    machine.inputSlots.push(createItem('wheel_small'))
    machine.inputSlots.push(createItem('wheel_small'))
    machine.inputSlots.push(createItem('wheel_small'))
    machine.inputSlots.push(createItem('wheel_small'))
    expect(machine.canAcceptInput()).toBe(false)

    const decider = await createDecider(machine)

    expect(decider(ENDPOINT, { type: 'wheel_small' })).toBe(false)
  })

  it('returns false when there is no machine at the belt endpoint', async () => {
    const decider = await createDecider(undefined)

    expect(decider(ENDPOINT, { type: 'wheel_small' })).toBe(false)
  })

  it('returns false when there is no arriving front item', async () => {
    const decider = await createDecider(startedFactoryOutput())

    expect(decider(ENDPOINT, undefined)).toBe(false)
  })
})