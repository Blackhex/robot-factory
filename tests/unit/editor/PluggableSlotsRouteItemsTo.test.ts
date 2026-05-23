import { describe, it, expect } from 'vitest'
import {
  PLUGGABLE_CONSUMER_TRANSFORMS,
  type PluggableSlotTransform,
} from '../../../src/editor/pluggableSlotsPatcher'

/**
 * E4d — `factory_route_items_to` must be registered in
 * `PLUGGABLE_CONSUMER_TRANSFORMS` so its `machine` parameter is
 * patched at runtime from a `FieldDropdown` into a typed value
 * input pre-populated with a `factory_pick_machine` shadow.
 *
 * The shape mirrors the existing `factory_on_item_arrives` entry
 * (which was added when the event hat was generalised):
 *
 *   { blockType: 'factory_on_item_arrives', fieldName: 'machine',
 *     check: 'Machine', shadow: 'factory_pick_machine' }
 *
 * These tests are RED today: the entry does not yet exist.
 */
describe('PLUGGABLE_CONSUMER_TRANSFORMS — factory_route_items_to entry (E4d)', () => {
  it('contains an entry whose blockType is factory_route_items_to', () => {
    const entry = PLUGGABLE_CONSUMER_TRANSFORMS.find(
      (t) => t.blockType === 'factory_route_items_to',
    )
    expect(
      entry,
      'PLUGGABLE_CONSUMER_TRANSFORMS must include a factory_route_items_to entry ' +
        'so its `machine` slot is patched into a value input at runtime.',
    ).toBeDefined()
  })

  it('the factory_route_items_to entry has the same shape as factory_on_item_arrives', () => {
    const entry = PLUGGABLE_CONSUMER_TRANSFORMS.find(
      (t) => t.blockType === 'factory_route_items_to',
    )
    expect(entry).toBeDefined()
    expect(entry!.fieldName).toBe('machine')
    expect(entry!.check).toBe('Machine')
    expect(entry!.shadow).toBe('factory_pick_machine')
  })

  it('the PluggableSlotTransform type literal accepts blockType=factory_route_items_to', () => {
    // Compile-time guard: this assignment must type-check after E4d
    // (the `blockType` field's union must include the new id, OR
    // remain a plain `string`). If the union ever narrows to exclude
    // the new id, this test breaks at `tsc --noEmit`.
    const probe: PluggableSlotTransform = {
      blockType: 'factory_route_items_to',
      fieldName: 'machine',
      check: 'Machine',
      shadow: 'factory_pick_machine',
    }
    expect(probe.blockType).toBe('factory_route_items_to')
  })
})
