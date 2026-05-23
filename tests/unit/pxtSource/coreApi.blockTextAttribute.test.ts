import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * RED: pin the compiled PXT API registry to the new block-text
 * wording for the two Machines-category routing blocks, and confirm
 * the machine slot still carries the `factory_pick_machine` shadow
 * override so the editor renders a machine-picker dropdown.
 */

const TARGET_JSON_PATH = resolve(__dirname, '../../../public/pxt-editor/target.json')

interface ByQNameEntry {
  attributes?: {
    block?: string
    blockId?: string
    _shadowOverrides?: Record<string, string>
  }
  parameters?: Array<{ name?: string }>
}

function readByQName(): Record<string, ByQNameEntry> {
  const raw = readFileSync(TARGET_JSON_PATH, 'utf8')
  const json = JSON.parse(raw) as {
    apiInfo?: { 'libs/core'?: { apis?: { byQName?: Record<string, ByQNameEntry> } } }
  }
  const byQName = json.apiInfo?.['libs/core']?.apis?.byQName
  expect(byQName, "apiInfo['libs/core'].apis.byQName must exist").toBeTruthy()
  return byQName!
}

describe('PXT compiled API registry — Machines routing block text (RED)', () => {
  it('machines.routeItemsTo carries the new block text', () => {
    const entry = readByQName()['machines.routeItemsTo']
    expect(entry, 'machines.routeItemsTo entry must exist').toBeTruthy()
    expect(entry.attributes?.block).toBe('route items of %machine to %sides')
  })

  it('machines.routeItemsTo keeps _shadowOverrides.machine = factory_pick_machine', () => {
    const entry = readByQName()['machines.routeItemsTo']
    expect(entry.attributes?._shadowOverrides?.machine).toBe('factory_pick_machine')
  })

  it('machines.routeItemsTo parameters[0].name === "machine"', () => {
    const entry = readByQName()['machines.routeItemsTo']
    expect(entry.parameters?.[0]?.name).toBe('machine')
  })

  it('machines.routeCurrentItemTo carries the new block text', () => {
    const entry = readByQName()['machines.routeCurrentItemTo']
    expect(entry, 'machines.routeCurrentItemTo entry must exist').toBeTruthy()
    expect(entry.attributes?.block).toBe('route current item of %machine to %side')
  })

  it('machines.routeCurrentItemTo keeps _shadowOverrides.machine = factory_pick_machine', () => {
    const entry = readByQName()['machines.routeCurrentItemTo']
    expect(entry.attributes?._shadowOverrides?.machine).toBe('factory_pick_machine')
  })

  it('machines.routeCurrentItemTo parameters[0].name === "machine"', () => {
    const entry = readByQName()['machines.routeCurrentItemTo']
    expect(entry.parameters?.[0]?.name).toBe('machine')
  })
})
