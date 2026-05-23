import { describe, it, expect } from 'vitest'
import { rotateOffset, getSlotPositions, slotPositionToOffset, rotationToFace, pickBestSlotOffset, directionToDegrees, degreesToDirection, rotateDirectionCW } from '../../../src/game/SlotUtils'
import type { GridPosition } from '../../../src/game/types'

describe('SlotUtils', () => {
  describe('rotateOffset()', () => {
    it('should return the same offset at south rotation', () => {
      // WHEN + THEN
      expect(rotateOffset({ x: 0, z: 1 }, 'south')).toEqual({ x: 0, z: 1 })
    })

    it('should rotate east (90 degrees clockwise)', () => {
      // WHEN
      const result = rotateOffset({ x: 0, z: 1 }, 'east')

      // THEN
      expect(result.x).toBe(1)
      expect(result.z + 0).toBe(0)
    })

    it('should rotate north (180 degrees)', () => {
      // WHEN
      const result = rotateOffset({ x: 0, z: 1 }, 'north')

      // THEN
      expect(result.x + 0).toBe(0)
      expect(result.z).toBe(-1)
    })

    it('should rotate west (270 degrees)', () => {
      // WHEN + THEN
      expect(rotateOffset({ x: 0, z: 1 }, 'west')).toEqual({ x: -1, z: 0 })
    })

    it('should handle diagonal offset rotation', () => {
      // WHEN + THEN
      expect(rotateOffset({ x: 1, z: 1 }, 'east')).toEqual({ x: 1, z: -1 })
    })

    it('should handle zero offset at any rotation', () => {
      for (const r of ['east', 'north', 'west'] as const) {
        // WHEN
        const result = rotateOffset({ x: 0, z: 0 }, r)

        // THEN
        expect(result.x + 0).toBe(0)
        expect(result.z + 0).toBe(0)
      }
    })
  })

  describe('getSlotPositions()', () => {
    it('should return 3 inputs and 1 front output for assembler', () => {
      // WHEN + THEN
      expect(getSlotPositions('assembler')).toEqual({ inputs: ['back', 'right', 'left'], outputs: ['front'] })
    })

    it('should return 1 back input and 3 outputs for splitter', () => {
      // WHEN + THEN
      expect(getSlotPositions('splitter')).toEqual({ inputs: ['back'], outputs: ['front', 'right', 'left'] })
    })

    it('should return default layout for all standard machine types', () => {
      // GIVEN
      const standardTypes = ['part_fabricator', 'painter', 'recycler'] as const

      // WHEN + THEN
      for (const type of standardTypes) {
        expect(getSlotPositions(type)).toEqual({ inputs: ['back'], outputs: ['front'] })
      }
    })

    it('should return 4 inputs and 0 outputs for factory_output', () => {
      // WHEN
      const slots = getSlotPositions('factory_output')

      // THEN
      expect(slots.inputs).toEqual(['back', 'right', 'left', 'front'])
      expect(slots.outputs).toEqual([])
    })
  })

  describe('slotPositionToOffset()', () => {
    it('should map front at south to +Z', () => {
      // WHEN + THEN
      expect(slotPositionToOffset('front', 'south')).toEqual({ x: 0, z: 1 })
    })

    it('should map back at south to -Z', () => {
      // WHEN + THEN
      expect(slotPositionToOffset('back', 'south')).toEqual({ x: 0, z: -1 })
    })

    // Updated for input-observer L/R convention (DESIGN.md §Machine Mechanics).
    it('should map right at south to -X', () => {
      // WHEN + THEN
      expect(slotPositionToOffset('right', 'south')).toEqual({ x: -1, z: 0 })
    })

    // Updated for input-observer L/R convention (DESIGN.md §Machine Mechanics).
    it('should map left at south to +X', () => {
      // WHEN + THEN
      expect(slotPositionToOffset('left', 'south')).toEqual({ x: 1, z: 0 })
    })

    it('should rotate front east to +X', () => {
      // WHEN
      const result = slotPositionToOffset('front', 'east')

      // THEN
      expect(result.x).toBe(1)
      expect(result.z + 0).toBe(0)
    })

    it('should rotate back north to front direction (+Z)', () => {
      // WHEN
      const result = slotPositionToOffset('back', 'north')

      // THEN
      expect(result.x + 0).toBe(0)
      expect(result.z).toBe(1)
    })

    it('should rotate right east to -Z', () => {
      // WHEN
      const result = slotPositionToOffset('right', 'east')

      // THEN
      expect(result.x + 0).toBe(0)
      expect(result.z).toBe(-1)
    })

    it('should rotate front west to -X', () => {
      // WHEN + THEN
      expect(slotPositionToOffset('front', 'west')).toEqual({ x: -1, z: 0 })
    })
  })

  describe('getSlotPositions() + slotPositionToOffset()', () => {
    it('should return 1 input and 1 output for default machine at south', () => {
      // GIVEN
      const positions = getSlotPositions('painter')

      // WHEN
      const inputOffsets = positions.inputs.map(p => slotPositionToOffset(p, 'south'))
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'south'))

      // THEN
      expect(inputOffsets).toEqual([{ x: 0, z: -1 }])
      expect(outputOffsets).toEqual([{ x: 0, z: 1 }])
    })

    it('should rotate default machine slots at east', () => {
      // GIVEN
      const positions = getSlotPositions('painter')

      // WHEN
      const inputOffsets = positions.inputs.map(p => slotPositionToOffset(p, 'east'))
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'east'))

      // THEN
      expect(inputOffsets).toHaveLength(1)
      expect(inputOffsets[0].x).toBe(-1)
      expect(inputOffsets[0].z + 0).toBe(0)
      expect(outputOffsets).toHaveLength(1)
      expect(outputOffsets[0].x).toBe(1)
      expect(outputOffsets[0].z + 0).toBe(0)
    })

    it('should return 1 input and 3 outputs for splitter at south', () => {
      // GIVEN
      const positions = getSlotPositions('splitter')

      // WHEN
      const inputOffsets = positions.inputs.map(p => slotPositionToOffset(p, 'south'))
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'south'))

      // THEN
      expect(inputOffsets).toHaveLength(1)
      expect(outputOffsets).toHaveLength(3)
      expect(inputOffsets).toEqual([{ x: 0, z: -1 }])
      expect(outputOffsets).toContainEqual({ x: 0, z: 1 })
      expect(outputOffsets).toContainEqual({ x: 1, z: 0 })
      expect(outputOffsets).toContainEqual({ x: -1, z: 0 })
    })

    it('should return 3 inputs and 1 output for assembler at south', () => {
      // GIVEN
      const positions = getSlotPositions('assembler')

      // WHEN
      const inputOffsets = positions.inputs.map(p => slotPositionToOffset(p, 'south'))
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'south'))

      // THEN
      expect(inputOffsets).toHaveLength(3)
      expect(outputOffsets).toHaveLength(1)
      expect(outputOffsets).toEqual([{ x: 0, z: 1 }])
      expect(inputOffsets).toContainEqual({ x: 0, z: -1 })
      expect(inputOffsets).toContainEqual({ x: 1, z: 0 })
      expect(inputOffsets).toContainEqual({ x: -1, z: 0 })
    })

    it('should rotate splitter outputs correctly at east', () => {
      // GIVEN
      const positions = getSlotPositions('splitter')

      // WHEN
      const inputOffsets = positions.inputs.map(p => slotPositionToOffset(p, 'east'))
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'east'))

      // THEN
      expect(inputOffsets).toHaveLength(1)
      expect(inputOffsets[0].x).toBe(-1)
      expect(Math.abs(inputOffsets[0].z)).toBe(0)
      expect(outputOffsets).toHaveLength(3)
    })

    it('should handle all standard machine types', () => {
      // GIVEN
      const standardTypes = ['part_fabricator', 'painter', 'recycler'] as const

      // WHEN + THEN
      for (const type of standardTypes) {
        const positions = getSlotPositions(type)
        expect(positions.inputs).toHaveLength(1)
        expect(positions.outputs).toHaveLength(1)
      }
    })

    it('should rotate assembler inputs at north', () => {
      // GIVEN
      const positions = getSlotPositions('assembler')

      // WHEN
      const outputOffsets = positions.outputs.map(p => slotPositionToOffset(p, 'north'))
      const inputOffsets = positions.inputs.map(p => slotPositionToOffset(p, 'north'))

      // THEN
      expect(outputOffsets).toHaveLength(1)
      expect(Math.abs(outputOffsets[0].x)).toBe(0)
      expect(outputOffsets[0].z).toBe(-1)
      expect(inputOffsets).toHaveLength(3)
    })
  })

  describe('rotationToFace()', () => {
    it('should return south for +Z direction', () => {
      // WHEN + THEN
      expect(rotationToFace(0, 1)).toBe('south')
    })

    it('should return east for +X direction', () => {
      // WHEN + THEN
      expect(rotationToFace(1, 0)).toBe('east')
    })

    it('should return north for -Z direction', () => {
      // WHEN + THEN
      expect(rotationToFace(0, -1)).toBe('north')
    })

    it('should return west for -X direction', () => {
      // WHEN + THEN
      expect(rotationToFace(-1, 0)).toBe('west')
    })

    it('should return south for zero direction', () => {
      // WHEN + THEN
      expect(rotationToFace(0, 0)).toBe('south')
    })
  })

  describe('directionToDegrees()', () => {
    it('should convert south to 0', () => {
      // WHEN + THEN
      expect(directionToDegrees('south')).toBe(0)
    })

    it('should convert east to 90', () => {
      // WHEN + THEN
      expect(directionToDegrees('east')).toBe(90)
    })

    it('should convert north to 180', () => {
      // WHEN + THEN
      expect(directionToDegrees('north')).toBe(180)
    })

    it('should convert west to 270', () => {
      // WHEN + THEN
      expect(directionToDegrees('west')).toBe(270)
    })
  })

  describe('degreesToDirection()', () => {
    it('should convert 0 to south', () => {
      // WHEN + THEN
      expect(degreesToDirection(0)).toBe('south')
    })

    it('should convert 90 to east', () => {
      // WHEN + THEN
      expect(degreesToDirection(90)).toBe('east')
    })

    it('should convert 180 to north', () => {
      // WHEN + THEN
      expect(degreesToDirection(180)).toBe('north')
    })

    it('should convert 270 to west', () => {
      // WHEN + THEN
      expect(degreesToDirection(270)).toBe('west')
    })

    it('should normalize negative degrees', () => {
      // WHEN + THEN
      expect(degreesToDirection(-90)).toBe('west')
    })

    it('should normalize degrees above 360', () => {
      // WHEN + THEN
      expect(degreesToDirection(450)).toBe('east')
    })
  })

  describe('rotateDirectionCW()', () => {
    it('should rotate south to west', () => {
      // WHEN + THEN
      expect(rotateDirectionCW('south')).toBe('west')
    })

    it('should rotate west to north', () => {
      // WHEN + THEN
      expect(rotateDirectionCW('west')).toBe('north')
    })

    it('should rotate north to east', () => {
      // WHEN + THEN
      expect(rotateDirectionCW('north')).toBe('east')
    })

    it('should rotate east to south', () => {
      // WHEN + THEN
      expect(rotateDirectionCW('east')).toBe('south')
    })
  })

  describe('pickBestSlotOffset()', () => {
    it('should return null for empty slot list', () => {
      // WHEN + THEN
      expect(pickBestSlotOffset([], 5, 5, { x: 6, z: 5 })).toBeNull()
    })

    it('should return the only slot when there is one', () => {
      // GIVEN
      const slots: GridPosition[] = [{ x: 0, z: 1 }]

      // WHEN + THEN
      expect(pickBestSlotOffset(slots, 5, 5, { x: 5, z: 8 })).toEqual({ x: 0, z: 1 })
    })

    it('should choose the slot closest to target (Manhattan distance)', () => {
      // GIVEN — machine at (5, 5), target at (5, 8)
      const slots: GridPosition[] = [{ x: 0, z: -1 }, { x: 0, z: 1 }]

      // WHEN + THEN
      expect(pickBestSlotOffset(slots, 5, 5, { x: 5, z: 8 })).toEqual({ x: 0, z: 1 })
    })

    it('should choose the slot closest when target is to the side', () => {
      // GIVEN — machine at (5, 5), target at (8, 5)
      const slots: GridPosition[] = [{ x: -1, z: 0 }, { x: 1, z: 0 }]

      // WHEN + THEN
      expect(pickBestSlotOffset(slots, 5, 5, { x: 8, z: 5 })).toEqual({ x: 1, z: 0 })
    })

    it('should handle three slots (splitter/assembler)', () => {
      // GIVEN — machine at (5, 5), target at (3, 5)
      const slots: GridPosition[] = [{ x: 0, z: 1 }, { x: 1, z: 0 }, { x: -1, z: 0 }]

      // WHEN + THEN
      expect(pickBestSlotOffset(slots, 5, 5, { x: 3, z: 5 })).toEqual({ x: -1, z: 0 })
    })
  })
})
