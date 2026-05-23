/**
 * Behavioral tests for the `setEnabled` proto patch installed by
 * `applyHatBlockShape` in `src/editor/hatBlockShape.ts`.
 *
 * The current implementation only refuses `setEnabled(false)` when
 * `this.type` is itself a hat type. PXT's compile-time disable cascade
 * also walks into descendants of a hat (the handler body), so the
 * guard must additionally walk `getParent()` / `getSurroundParent()`
 * and refuse if ANY ancestor is a hat. Cases 2 & 3 are the RED step
 * that drive that extension.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { applyHatBlockShape, installSetEnabledTrap } from '../../../src/editor/hatBlockShape'

const HAT_TYPE_ARRIVES = 'factory_on_item_arrives'
const HAT_TYPE_IDLE = 'factory_on_machine_idle'

interface FakeBlock {
  type: string
  enabled: boolean
  parent: FakeBlock | null
  surroundParent?: FakeBlock | null
  getParent(): FakeBlock | null
  getSurroundParent?(): FakeBlock | null
}

function makeBlock(type: string, parent: FakeBlock | null = null): FakeBlock {
  return {
    type,
    enabled: true,
    parent,
    getParent() { return this.parent },
    getSurroundParent() { return this.parent },
  }
}

function makeBlocklyStub() {
  return {
    Block: {
      prototype: {
        setEnabled(this: any, v: boolean) { this.enabled = v },
      },
    },
  }
}

function setEnabledOn(blockly: any, block: FakeBlock, value: boolean): void {
  blockly.Block.prototype.setEnabled.call(block, value)
}

describe('hatBlockShape — setEnabled descendant guard', () => {
  let blockly: ReturnType<typeof makeBlocklyStub>

  beforeEach(() => {
    blockly = makeBlocklyStub()
    // workspace stub minimal enough for applyHatBlockShape to no-op
    // through the other patch helpers without throwing.
    const workspace = { getAllBlocks: () => [] }
    applyHatBlockShape(blockly, workspace)
  })

  it('refuses setEnabled(false) on a hat block itself', () => {
    const hat = makeBlock(HAT_TYPE_ARRIVES)
    setEnabledOn(blockly, hat, false)
    expect(hat.enabled).toBe(true)
  })

  it('refuses setEnabled(false) on a direct child of a hat block', () => {
    const hat = makeBlock(HAT_TYPE_ARRIVES)
    const child = makeBlock('factory_pick_machine', hat)
    setEnabledOn(blockly, child, false)
    expect(child.enabled).toBe(true)
  })

  it('refuses setEnabled(false) on a deeply nested descendant of a hat block', () => {
    const hat = makeBlock(HAT_TYPE_IDLE)
    const mid = makeBlock('controls_if', hat)
    const leaf = makeBlock('factory_route_items_to', mid)
    setEnabledOn(blockly, leaf, false)
    expect(leaf.enabled).toBe(true)
  })

  it('accepts setEnabled(false) on a non-hat block with no hat ancestor', () => {
    const top = makeBlock('controls_if')
    const child = makeBlock('factory_pick_machine', top)
    setEnabledOn(blockly, child, false)
    expect(child.enabled).toBe(false)
  })

  it('accepts setEnabled(true) regardless of ancestor', () => {
    const hat = makeBlock(HAT_TYPE_ARRIVES)
    hat.enabled = false
    setEnabledOn(blockly, hat, true)
    expect(hat.enabled).toBe(true)

    const child = makeBlock('factory_pick_machine', makeBlock(HAT_TYPE_IDLE))
    child.enabled = false
    setEnabledOn(blockly, child, true)
    expect(child.enabled).toBe(true)
  })
})

describe('hatBlockShape — installSetEnabledTrap (self-healing)', () => {
  it('re-wraps after PXT-style reassignment of proto.setEnabled', () => {
    const blockly = makeBlocklyStub()
    const win: any = { Blockly: blockly }
    installSetEnabledTrap(win as Window)

    // Simulate PXT's IIFE replacing the prototype method AFTER the trap
    // installed. The setter must intercept and re-wrap.
    blockly.Block.prototype.setEnabled = function(this: any, v: boolean) {
      this.enabled = v
      ;(this as any).pxtCalled = true
    }

    const hat = makeBlock(HAT_TYPE_ARRIVES)
    const child = makeBlock('factory_route_items_to', hat)
    setEnabledOn(blockly, child, false)

    expect(child.enabled).toBe(true)
    expect((child as any).pxtCalled).toBe(true)
  })

  it('polls for Blockly when not yet defined and installs once it appears', async () => {
    const win: any = { Blockly: undefined }
    installSetEnabledTrap(win as Window)

    // Blockly arrives after a short delay; the trap's setTimeout retry
    // (10 ms cadence) should pick it up.
    await new Promise(r => setTimeout(r, 5))
    win.Blockly = makeBlocklyStub()
    await new Promise(r => setTimeout(r, 50))

    expect(win.Blockly.Block.prototype.__rfHatSetEnabledTrapped).toBe(true)

    const hat = makeBlock(HAT_TYPE_IDLE)
    const child = makeBlock('factory_route_items_to', hat)
    setEnabledOn(win.Blockly, child, false)
    expect(child.enabled).toBe(true)
  })

  it('is idempotent — re-installing does not double-wrap', () => {
    const blockly = makeBlocklyStub()
    const win: any = { Blockly: blockly }
    installSetEnabledTrap(win as Window)
    const firstGetter = Object.getOwnPropertyDescriptor(blockly.Block.prototype, 'setEnabled')!.get
    installSetEnabledTrap(win as Window)
    const secondGetter = Object.getOwnPropertyDescriptor(blockly.Block.prototype, 'setEnabled')!.get
    expect(secondGetter).toBe(firstGetter)
  })
})
