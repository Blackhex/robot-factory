/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Factory } from '../../../src/game/Factory'
import {
  saveFactory,
  loadFactory,
  saveToLocalStorage,
  loadFromLocalStorage,
} from '../../../src/utils/SaveLoad'
import type { FactorySave } from '../../../src/utils/SaveLoad'
import { ALL_MACHINE_TYPES } from '../../../src/game/types'
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
      // Updated for input-observer L/R convention (DESIGN.md §Machine Mechanics).
      expect(save).toHaveProperty('version', 3)
      expect(save).toHaveProperty('grid')
      expect(save).toHaveProperty('belts')
      expect(save).toHaveProperty('pxtWorkspace', '<xml></xml>')
      expect(save).toHaveProperty('levelId', 'level-1')
      expect(Array.isArray(save.grid)).toBe(true)
      expect(Array.isArray(save.belts)).toBe(true)
    })

    // Updated for input-observer L/R convention (DESIGN.md §Machine Mechanics).
    it('version field is 3', () => {
      // GIVEN
      const factory = new Factory()

      // WHEN
      const save = saveFactory(factory, '')

      // THEN
      expect(save.version).toBe(3)
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
      factory.placeMachine(2, 0, 'recycler', 'south')
      factory.restoreState([], [
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] },
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 1, z: 0 }, { x: 2, z: 0 }] },
      ])
      expectFactoryState(factory, {
        grid: {
          box: [0, 0, 4, 2],
          expected: [
            '|F|P|R| | |',
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

    // -----------------------------------------------------------------
    // RED contract: legacy `quality_checker` cells must be silently
    // dropped on load. The Quality Checker machine has been removed
    // from the game; old saves must not throw — instead, the affected
    // cell is omitted, and any belt whose source or destination
    // references that cell is also omitted. All other machines and
    // belts in the save load normally.
    // -----------------------------------------------------------------
    describe('Checker removal — legacy `quality_checker` cells', () => {
      it('silently drops a `quality_checker` cell (no throw, no machine at that position)', () => {
        // GIVEN — a save containing a quality_checker plus an unrelated assembler.
        const save: FactorySave = {
          version: 2,
          grid: [
            { x: 1, z: 1, machineType: 'assembler', rotation: 'south' },
            { x: 2, z: 0, machineType: 'quality_checker', rotation: 'south' },
          ],
          belts: [],
          pxtWorkspace: '',
        }

        // WHEN — must NOT throw.
        const result = loadFactory(save)

        // THEN — the legacy cell is gone but the rest is intact.
        const machines = result.factory.getMachines()
        expect(machines.find(m => m.x === 2 && m.z === 0)).toBeUndefined()
        expect(machines.find(m => m.x === 1 && m.z === 1)).toBeDefined()
        expect(machines.find(m => m.x === 1 && m.z === 1)!.type).toBe('assembler')
      })

      it('drops belts whose source or destination references a dropped `quality_checker` cell', () => {
        // GIVEN — a save with a fabricator → checker → output topology
        // where the checker is the legacy machine. Both belts must be
        // dropped because each touches the removed cell.
        const save: FactorySave = {
          version: 2,
          grid: [
            { x: 0, z: 0, machineType: 'part_fabricator', rotation: 'south' },
            { x: 1, z: 0, machineType: 'quality_checker', rotation: 'south' },
            { x: 2, z: 0, machineType: 'factory_output', rotation: 'west' },
          ],
          belts: [
            // fab → checker (touches dropped cell at destination)
            {
              sourceSlot: 'front',
              destinationSlot: 'back',
              path: [[0, 0], [1, 0]],
            },
            // checker → output (touches dropped cell at source)
            {
              sourceSlot: 'front',
              destinationSlot: 'front',
              path: [[1, 0], [2, 0]],
            },
          ],
          pxtWorkspace: '',
        }

        // WHEN — must NOT throw.
        const result = loadFactory(save)

        // THEN — checker gone, both touching belts gone.
        const machines = result.factory.getMachines()
        expect(machines.find(m => m.x === 1 && m.z === 0)).toBeUndefined()
        // The two surviving machines must still load.
        expect(machines.find(m => m.x === 0 && m.z === 0)?.type).toBe('part_fabricator')
        expect(machines.find(m => m.x === 2 && m.z === 0)?.type).toBe('factory_output')
        // No belts because both endpoints touched the dropped cell.
        expect(result.factory.getBelts()).toHaveLength(0)
      })

      it('keeps unaffected belts when only some touch the dropped `quality_checker` cell', () => {
        // GIVEN — a save with three machines and two belts; only one
        // belt touches the dropped checker.
        const save: FactorySave = {
          version: 2,
          grid: [
            { x: 0, z: 0, machineType: 'part_fabricator', rotation: 'south' },
            { x: 1, z: 0, machineType: 'assembler', rotation: 'south' },
            { x: 2, z: 0, machineType: 'quality_checker', rotation: 'south' },
          ],
          belts: [
            // fab → assembler (NOT touching checker — must survive)
            {
              sourceSlot: 'front',
              destinationSlot: 'back',
              path: [[0, 0], [1, 0]],
            },
            // assembler → checker (touches dropped cell — must be dropped)
            {
              sourceSlot: 'front',
              destinationSlot: 'back',
              path: [[1, 0], [2, 0]],
            },
          ],
          pxtWorkspace: '',
        }

        // WHEN
        const result = loadFactory(save)

        // THEN
        const belts = result.factory.getBelts()
        expect(belts).toHaveLength(1)
        // Surviving belt is the fab→assembler one.
        const surviving = belts[0]
        expect(surviving.path[0]).toEqual({ x: 0, z: 0 })
        expect(surviving.path[surviving.path.length - 1]).toEqual({ x: 1, z: 0 })
      })
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
      factory.placeMachine(3, 0, 'recycler', 'south')
      factory.placeMachine(2, 2, 'splitter', 'south')
      factory.restoreState([], [
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] },
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 2, z: 2 }] },
        { sourceSlot: 'front', destinationSlot: 'front', path: [{ x: 2, z: 2 }, { x: 2, z: 1 }, { x: 2, z: 0 }, { x: 3, z: 0 }] },
      ])
      const MULTI_INITIAL = {
        grid: {
          box: [0, 0, 5, 2] as [number, number, number, number],
          expected: [
            '|F|P|+|R| | |',
            '| | |+| | | |',
            '| | |S| | | |',
          ].join('\n'),
        },
        machines: [
          { x: 0, z: 0, rotation: 'south' as const },
          { x: 1, z: 0, rotation: 'south' as const },
          { x: 3, z: 0, rotation: 'south' as const },
          { x: 2, z: 2, rotation: 'south' as const },
        ],
        belts: [
          { source: { x: 0, z: 0 }, destination: { x: 1, z: 0 }, path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] },
          { source: { x: 1, z: 0 }, destination: { x: 2, z: 2 }, path: [{ x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 2, z: 2 }] },
          { source: { x: 2, z: 2 }, destination: { x: 3, z: 0 }, path: [{ x: 2, z: 2 }, { x: 2, z: 1 }, { x: 2, z: 0 }, { x: 3, z: 0 }] },
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

  // ─────────────────────────────────────────────────────────────────────────
  // MachineType ↔ validateSave parity (regression + anti-drift)
  //
  // Bug: src/utils/SaveLoad.ts VALID_MACHINE_TYPES omits 'factory_output',
  // so any save containing a factory_output machine fails validateSave with
  // `invalid machineType "factory_output"` → loadFromLocalStorage returns
  // null silently and the player loses their factory on reload.
  //
  // These tests are EXPECTED TO FAIL until the production set is fixed.
  // ─────────────────────────────────────────────────────────────────────────
  describe('MachineType parity with validateSave', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('round-trips every MachineType through saveToLocalStorage / loadFromLocalStorage', () => {
      // GIVEN — for each canonical MachineType, a 1-machine factory.
      for (const machineType of ALL_MACHINE_TYPES) {
        const factory = new Factory(5, 5)
        const placed = factory.placeMachine(0, 0, machineType, 'south')
        expect(placed, `precondition: place ${machineType} at (0,0)`).not.toBeNull()

        const key = `regression-test-${machineType}`
        const save = saveFactory(factory, '<xml/>', 'level-test')

        // WHEN
        saveToLocalStorage(key, save)
        const loaded = loadFromLocalStorage(key)

        // THEN — load must succeed for every canonical MachineType. Currently
        // fails for 'factory_output' because VALID_MACHINE_TYPES omits it,
        // causing validateSave to throw and loadFromLocalStorage to return null.
        expect(loaded, `loadFromLocalStorage returned null for "${machineType}"`).not.toBeNull()
        expect(loaded!.grid).toHaveLength(1)
        expect(loaded!.grid[0].machineType).toBe(machineType)
      }
    })

    it('validateSave accepts an inline save containing a factory_output machine (direct regression)', () => {
      // GIVEN — the exact shape produced by saveFactory for a single
      // factory_output machine. This is the minimal repro for the bug.
      const save: FactorySave = {
        version: 2,
        grid: [{ x: 0, z: 0, machineType: 'factory_output', rotation: 'south' }],
        belts: [],
        pxtWorkspace: '<xml/>',
      }

      // WHEN + THEN — loadFactory invokes the same validateSave code path
      // as loadFromLocalStorage. It must NOT throw 'invalid machineType'.
      expect(() => loadFactory(save)).not.toThrow()
    })

    it('validateSave accepts every member of the MachineType union (anti-drift)', () => {
      // GIVEN — ALL_MACHINE_TYPES is pinned to the MachineType union by the
      // compile-time `_MachineTypeExhaustive` sentinel in src/game/types.ts,
      // so adding/removing a union member without updating that constant
      // breaks `tsc --noEmit`. The runtime assertion below pins parity with
      // VALID_MACHINE_TYPES inside src/utils/SaveLoad.ts.
      for (const machineType of ALL_MACHINE_TYPES) {
        const save: FactorySave = {
          version: 2,
          grid: [{ x: 0, z: 0, machineType, rotation: 'south' }],
          belts: [],
          pxtWorkspace: '',
        }

        // WHEN + THEN
        expect(
          () => loadFactory(save),
          `validateSave rejected MachineType "${machineType}"`,
        ).not.toThrow()
      }
    })
  })
})
