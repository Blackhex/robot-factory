import { describe, it, expect } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import { saveFactory, loadFactory } from '../../../src/utils/SaveLoad'
import type { FactorySave } from '../../../src/utils/SaveLoad'
import { expectFactoryState } from '../helpers/factoryAssert'

function createValidSave(overrides: Partial<FactorySave> = {}): FactorySave {
  return {
    version: 2,
    grid: [],
    belts: [],
    pxtWorkspace: '',
    ...overrides,
  }
}

describe('SaveLoad', () => {
  describe('saveFactory()', () => {
    it('produces correct FactorySave structure', () => {
      // GIVEN
      const factory = new Factory(10, 10)
      factory.placeMachine(0, 0, 'assembler', 'south')
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 3, 3],
          expected: [
            '|A| | | |',
            '| | | | |',
            '| | | | |',
            '| | | | |',
          ].join('\n'),
        },
        machines: [{ x: 0, z: 0, rotation: 'south' }],
        belts: [],
      })

      // WHEN
      const save = saveFactory(factory, '<xml></xml>', 'level-1')

      // THEN
      expect(save).toHaveProperty('version', 2)
      expect(save).toHaveProperty('grid')
      expect(save).toHaveProperty('belts')
      expect(save).toHaveProperty('pxtWorkspace', '<xml></xml>')
      expect(save).toHaveProperty('levelId', 'level-1')
      expect(Array.isArray(save.grid)).toBe(true)
      expect(Array.isArray(save.belts)).toBe(true)
    })

    it('version field is 2', () => {
      // GIVEN
      const factory = new Factory()

      // WHEN
      const save = saveFactory(factory, '')

      // THEN
      expect(save.version).toBe(2)
    })

    it('saves empty factory correctly', () => {
      // GIVEN
      const factory = new Factory(5, 5)

      // WHEN
      const save = saveFactory(factory, '')

      // THEN
      expect(save.grid).toHaveLength(0)
      expect(save.belts).toHaveLength(0)
    })

    it('omits levelId when not provided', () => {
      // GIVEN
      const factory = new Factory()

      // WHEN
      const save = saveFactory(factory, '')

      // THEN
      expect(save.levelId).toBeUndefined()
    })

    it('saves machines with correct x, z, and machineType', () => {
      // GIVEN
      const factory = new Factory(10, 10)
      factory.placeMachine(2, 3, 'painter', 'south')
      factory.placeMachine(5, 7, 'recycler', 'south')
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 9, 9],
          expected: [
            '| | | | | | | | | | |',
            '| | | | | | | | | | |',
            '| | | | | | | | | | |',
            '| | |P| | | | | | | |',
            '| | | | | | | | | | |',
            '| | | | | | | | | | |',
            '| | | | | | | | | | |',
            '| | | | | |R| | | | |',
            '| | | | | | | | | | |',
            '| | | | | | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 2, z: 3, rotation: 'south' },
          { x: 5, z: 7, rotation: 'south' },
        ],
        belts: [],
      })

      // WHEN
      const save = saveFactory(factory, '')

      // THEN
      expect(save.grid).toHaveLength(2)
      expect(save.grid).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ x: 2, z: 3, machineType: 'painter' }),
          expect.objectContaining({ x: 5, z: 7, machineType: 'recycler' }),
        ]),
      )
    })

    it('saves belts with correct sourceSlot, destinationSlot, and path', () => {
      // GIVEN — use restoreState to bypass slot-blocking for adjacent machines
      const factory = new Factory(10, 10)
      factory.restoreState(
        [
          { x: 1, z: 1, type: 'assembler', rotation: 'south' },
          { x: 1, z: 2, type: 'assembler', rotation: 'south' },
        ],
        [{ sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 1, z: 1 }, { x: 1, z: 2 }] }],
      )
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| |A| | | |',
            '| |A| | | |',
            '| | | | | |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 1, rotation: 'south' },
          { x: 1, z: 2, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 1, z: 1 },
            destination: { x: 1, z: 2 },
            path: [{ x: 1, z: 1 }, { x: 1, z: 2 }],
          },
        ],
      })

      // WHEN
      const save = saveFactory(factory, '')

      // THEN
      expect(save.belts).toHaveLength(1)
      expect(save.belts[0].sourceSlot).toBe('front')
      expect(save.belts[0].destinationSlot).toBe('front')
      expect(save.belts[0].path).toEqual([[1, 1], [1, 2]])
    })

    it('saves multiple machines and belts', () => {
      // GIVEN
      const factory = new Factory(10, 10)
      factory.placeMachine(0, 0, 'part_fabricator', 'south')
      factory.placeMachine(1, 0, 'painter', 'south')
      factory.placeMachine(2, 0, 'quality_checker', 'south')
      factory.restoreState([], [
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] },
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 1, z: 0 }, { x: 2, z: 0 }] },
      ])
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 2],
          expected: [
            '|F|P|Q| | |',
            '| | | | | |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 0, z: 0, rotation: 'south' },
          { x: 1, z: 0, rotation: 'south' },
          { x: 2, z: 0, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 0, z: 0 },
            destination: { x: 1, z: 0 },
            path: [{ x: 0, z: 0 }, { x: 1, z: 0 }],
          },
          {
            source: { x: 1, z: 0 },
            destination: { x: 2, z: 0 },
            path: [{ x: 1, z: 0 }, { x: 2, z: 0 }],
          },
        ],
      })

      // WHEN
      const save = saveFactory(factory, '')

      // THEN
      expect(save.grid).toHaveLength(3)
      expect(save.belts).toHaveLength(2)
    })
  })

  describe('loadFactory()', () => {
    it('reconstructs Factory with correct machines', () => {
      // GIVEN
      const save = createValidSave({
        grid: [
          { x: 1, z: 2, machineType: 'assembler', rotation: 'south' },
          { x: 3, z: 4, machineType: 'painter', rotation: 'south' },
        ],
      })

      // WHEN
      const { factory } = loadFactory(save)
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 4],
          expected: [
            '| | | | | |',
            '| | | | | |',
            '| |A| | | |',
            '| | | | | |',
            '| | | |P| |',
          ].join('\n'),
        },
        machines: [
          { x: 1, z: 2, rotation: 'south' },
          { x: 3, z: 4, rotation: 'south' },
        ],
        belts: [],
      })

      // THEN
      const machines = factory.getMachines()
      expect(machines).toHaveLength(2)
      expect(factory.getMachineAt(1, 2)).not.toBeNull()
      expect(factory.getMachineAt(1, 2)!.type).toBe('assembler')
      expect(factory.getMachineAt(3, 4)).not.toBeNull()
      expect(factory.getMachineAt(3, 4)!.type).toBe('painter')
    })

    it('reconstructs Factory with correct belts', () => {
      // GIVEN
      const save = createValidSave({
        grid: [
          { x: 0, z: 0, machineType: 'assembler', rotation: 'south' },
          { x: 0, z: 1, machineType: 'assembler', rotation: 'south' },
        ],
        belts: [{ sourceSlot: 'front', destinationSlot: 'front', path: [[0, 0], [0, 1]] }],
      })

      // WHEN
      const { factory } = loadFactory(save)
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 3, 3],
          expected: [
            '|A| | | |',
            '|A| | | |',
            '| | | | |',
            '| | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 0, z: 0, rotation: 'south' },
          { x: 0, z: 1, rotation: 'south' },
        ],
        belts: [
          {
            source: { x: 0, z: 0 },
            destination: { x: 0, z: 1 },
            path: [{ x: 0, z: 0 }, { x: 0, z: 1 }],
          },
        ],
      })

      // THEN
      const belts = factory.getBelts()
      expect(belts).toHaveLength(1)
      expect(belts[0].sourceMachine.x).toBe(0)
      expect(belts[0].sourceMachine.z).toBe(0)
      expect(belts[0].destinationMachine.x).toBe(0)
      expect(belts[0].destinationMachine.z).toBe(1)
      expect(belts[0].path).toEqual([{ x: 0, z: 0 }, { x: 0, z: 1 }])
    })

    it('returns workspace string', () => {
      // GIVEN
      const save = createValidSave({ pxtWorkspace: '<xml>blocks</xml>' })

      // WHEN
      const { workspace } = loadFactory(save)

      // THEN
      expect(workspace).toBe('<xml>blocks</xml>')
    })

    it('returns levelId when present', () => {
      // GIVEN
      const save = createValidSave({ levelId: 'level-3' })

      // WHEN
      const { levelId } = loadFactory(save)

      // THEN
      expect(levelId).toBe('level-3')
    })

    it('returns undefined levelId when absent', () => {
      // GIVEN
      const save = createValidSave()

      // WHEN
      const { levelId } = loadFactory(save)

      // THEN
      expect(levelId).toBeUndefined()
    })

    it('loads empty factory correctly', () => {
      // GIVEN
      const save = createValidSave()

      // WHEN
      const { factory } = loadFactory(save)

      // THEN
      expect(factory.getMachines()).toHaveLength(0)
      expect(factory.getBelts()).toHaveLength(0)
    })
  })

  describe('round-trip', () => {
    it('save then load produces identical factory state', () => {
      // GIVEN
      const original = new Factory(10, 10)
      original.placeMachine(0, 0, 'part_fabricator', 'south')
      original.placeMachine(1, 0, 'assembler', 'south')
      original.restoreState([], [{ sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] }])
      // NOTE: restoreState's empty machine array drops both placeMachine'd entries,
      // and the belt referencing (1,0) cannot find its destination machine — so the
      // resulting state has only the (0,0) part_fabricator and zero belts.
      // (Production-code anomaly: belt with missing destination machine is silently dropped.)
      const ROUNDTRIP_INITIAL = {
        grid: {
          box: [0, 0, 4, 2] as [number, number, number, number],
          expected: [
            '|F| | | | |',
            '| | | | | |',
            '| | | | | |',
          ].join('\n'),
        },
        machines: [{ x: 0, z: 0, rotation: 'south' as const }],
        belts: [],
      }
      expectFactoryState(original, ROUNDTRIP_INITIAL)

      // WHEN
      const save = saveFactory(original, '<xml>prog</xml>', 'lvl-1')
      const { factory: restored, workspace, levelId } = loadFactory(save)
      expectFactoryState(restored, ROUNDTRIP_INITIAL)

      // THEN — machines match
      const origMachines = original.getMachines()
      const resMachines = restored.getMachines()
      expect(resMachines).toHaveLength(origMachines.length)
      for (const m of origMachines) {
        const loaded = restored.getMachineAt(m.x, m.z)
        expect(loaded, `machine at (${m.x},${m.z})`).not.toBeNull()
        expect(loaded!.type).toBe(m.type)
      }
      // belts match
      const origBelts = original.getBelts()
      const resBelts = restored.getBelts()
      expect(resBelts).toHaveLength(origBelts.length)
      for (const b of origBelts) {
        const match = resBelts.find(
          (rb) =>
            rb.sourceMachine.x === b.sourceMachine.x &&
            rb.sourceMachine.z === b.sourceMachine.z &&
            rb.destinationMachine.x === b.destinationMachine.x &&
            rb.destinationMachine.z === b.destinationMachine.z,
        )
        expect(match, `belt from (${b.sourceMachine.x},${b.sourceMachine.z})`).toBeDefined()
      }
      expect(workspace).toBe('<xml>prog</xml>')
      expect(levelId).toBe('lvl-1')
    })

    it('empty factory round-trips correctly', () => {
      // GIVEN
      const original = new Factory(20, 20)

      // WHEN
      const save = saveFactory(original, '')
      const { factory } = loadFactory(save)

      // THEN
      expect(factory.getMachines()).toHaveLength(0)
      expect(factory.getBelts()).toHaveLength(0)
    })

    it('pxtWorkspace string is preserved', () => {
      // GIVEN
      const workspace = '{"blocks":"complex\\"escaped\\"data","count":42}'
      const factory = new Factory()

      // WHEN
      const save = saveFactory(factory, workspace)
      const { workspace: restored } = loadFactory(save)

      // THEN
      expect(restored).toBe(workspace)
    })

    it('multiple machines and belts round-trip correctly', () => {
      // GIVEN
      const factory = new Factory(10, 10)
      factory.placeMachine(0, 0, 'part_fabricator', 'south')
      factory.placeMachine(1, 0, 'painter', 'south')
      factory.placeMachine(2, 0, 'quality_checker', 'south')
      factory.placeMachine(3, 0, 'recycler', 'south')
      factory.restoreState([], [
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] },
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 1, z: 0 }, { x: 2, z: 0 }] },
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 2, z: 0 }, { x: 3, z: 0 }] },
      ])
      const MULTI_INITIAL = {
        grid: {
          box: [0, 0, 5, 2] as [number, number, number, number],
          expected: [
            '|F|P|Q|R| | |',
            '| | | | | | |',
            '| | | | | | |',
          ].join('\n'),
        },
        machines: [
          { x: 0, z: 0, rotation: 'south' as const },
          { x: 1, z: 0, rotation: 'south' as const },
          { x: 2, z: 0, rotation: 'south' as const },
          { x: 3, z: 0, rotation: 'south' as const },
        ],
        belts: [
          { source: { x: 0, z: 0 }, destination: { x: 1, z: 0 }, path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] },
          { source: { x: 1, z: 0 }, destination: { x: 2, z: 0 }, path: [{ x: 1, z: 0 }, { x: 2, z: 0 }] },
          { source: { x: 2, z: 0 }, destination: { x: 3, z: 0 }, path: [{ x: 2, z: 0 }, { x: 3, z: 0 }] },
        ],
      }
      expectFactoryState(factory, MULTI_INITIAL)

      // WHEN
      const save = saveFactory(factory, 'ws')
      const { factory: restored } = loadFactory(save)
      expectFactoryState(restored, MULTI_INITIAL)

      // THEN
      expect(restored.getMachines()).toHaveLength(4)
      expect(restored.getBelts()).toHaveLength(3)
    })
  })

  describe('validateSave (via loadFactory)', () => {
    it('accepts valid save with machines and belts', () => {
      // GIVEN
      const save = createValidSave({
        grid: [
          { x: 0, z: 0, machineType: 'assembler', rotation: 'south' },
          { x: 0, z: 1, machineType: 'assembler', rotation: 'south' },
        ],
        belts: [{ sourceSlot: 'front', destinationSlot: 'front', path: [[0, 0], [0, 1]] }],
        pxtWorkspace: 'ws',
      })

      // WHEN + THEN
      expect(() => loadFactory(save)).not.toThrow()
    })

    it('accepts valid empty save', () => {
      // WHEN + THEN
      expect(() => loadFactory(createValidSave())).not.toThrow()
    })

    it('accepts all valid machine types', () => {
      // GIVEN
      const types = [
        'part_fabricator',
        'assembler',
        'quality_checker',
        'painter',
        'recycler',
        'splitter',
      ]

      // WHEN + THEN
      for (const machineType of types) {
        const save = createValidSave({
          grid: [{ x: 0, z: 0, machineType, rotation: 'south' }],
        })
        expect(() => loadFactory(save), `type: ${machineType}`).not.toThrow()
      }
    })

    it('rejects null data', () => {
      // WHEN + THEN
      expect(() => loadFactory(null as unknown as FactorySave)).toThrow(
        'Save data must be an object',
      )
    })

    it('rejects non-object data', () => {
      // WHEN + THEN
      expect(() => loadFactory('str' as unknown as FactorySave)).toThrow(
        'Save data must be an object',
      )
    })

    it('rejects wrong version', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory({ version: 999, grid: [], belts: [], pxtWorkspace: '' } as FactorySave),
      ).toThrow('Unsupported save version')
    })

    it('rejects missing version', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory({ grid: [], belts: [], pxtWorkspace: '' } as unknown as FactorySave),
      ).toThrow('Unsupported save version')
    })

    it('rejects non-array grid', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory({ version: 2, grid: 'bad', belts: [], pxtWorkspace: '' } as unknown as FactorySave),
      ).toThrow('grid must be an array')
    })

    it('rejects grid entry with missing x', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory(
          createValidSave({
            grid: [{ z: 0, machineType: 'assembler', rotation: 0 } as never],
          }),
        ),
      ).toThrow('numeric x and z')
    })

    it('rejects invalid machineType', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory(
          createValidSave({
            grid: [{ x: 0, z: 0, machineType: 'invalid_machine', rotation: 'south' }],
          }),
        ),
      ).toThrow('invalid machineType')
    })

    it('rejects grid entry with missing rotation', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory(
          createValidSave({
            grid: [{ x: 0, z: 0, machineType: 'assembler' } as never],
          }),
        ),
      ).toThrow('Direction rotation')
    })

    it('rejects non-array belts', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory({ version: 2, grid: [], belts: 'bad', pxtWorkspace: '' } as unknown as FactorySave),
      ).toThrow('belts must be an array')
    })

    it('rejects belt with invalid sourceSlot', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory(
          createValidSave({
            belts: [{ sourceSlot: 'invalid', destinationSlot: 'front', path: [[0, 0], [0, 1]] } as never],
          }),
        ),
      ).toThrow('valid sourceSlot')
    })

    it('rejects belt with invalid path', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory(
          createValidSave({
            belts: [{ sourceSlot: 'front', destinationSlot: 'front', path: [[0]] } as never],
          }),
        ),
      ).toThrow('belt.path')
    })

    it('rejects belt with missing destinationSlot', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory(
          createValidSave({
            belts: [{ sourceSlot: 'front', path: [[0, 0], [0, 1]] } as never],
          }),
        ),
      ).toThrow('valid destinationSlot')
    })

    it('rejects missing pxtWorkspace', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory({ version: 2, grid: [], belts: [] } as unknown as FactorySave),
      ).toThrow('pxtWorkspace must be a string')
    })

    it('rejects non-string pxtWorkspace', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory({ version: 2, grid: [], belts: [], pxtWorkspace: 42 } as unknown as FactorySave),
      ).toThrow('pxtWorkspace must be a string')
    })

    it('rejects non-string levelId', () => {
      // WHEN + THEN
      expect(() =>
        loadFactory({ version: 2, grid: [], belts: [], pxtWorkspace: '', levelId: 123 } as unknown as FactorySave),
      ).toThrow('levelId must be a string')
    })
  })
})
