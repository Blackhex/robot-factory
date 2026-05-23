/**
 * RED tests — Persistent multi-output Splitter routing config + strict
 * round-robin.
 *
 * Pins the new Splitter contract:
 *
 *   - `Machine` gains two persistent fields:
 *       outputSidesConfig: number  // bitfield, default 7
 *       routingCounter:    number  // round-robin index, default 0
 *
 *   - Bit positions (FIXED, document this here):
 *       Left    = 1
 *       Forward = 2
 *       Right   = 4
 *     Default `7` enables all three sides.
 *
 *   - The enabled-sides list is built in *numerical bit order*:
 *     Left (1) → Forward (2) → Right (4). Disabled bits are skipped.
 *     The `routingCounter` indexes into that filtered list modulo its
 *     length.
 *
 *   - On a successful park, `routingCounter` advances by exactly 1. On
 *     a failed park (target slot occupied), the splitter sets
 *     `state = 'blocked'` and the counter is NOT advanced; the same
 *     side will be re-attempted on the next tick.
 *
 *   - `clearRuntimeState` resets BOTH fields to their defaults
 *     (outputSidesConfig=7, routingCounter=0).
 *
 *   - `tickSplitter` no longer accepts a `SplitterHandlerBridge`
 *     parameter. Routing is decided ONLY by `outputSidesConfig` +
 *     `routingCounter`. Any registered bridge MUST be ignored.
 *
 * These tests are written BEFORE the implementation lands and MUST
 * fail against the current codebase. They use loose casts to read the
 * not-yet-existing fields without breaking compilation.
 *
 * Per-side → port mapping (already pinned by SplitterEventHandler):
 *   Forward → primary  (`outputSlot`)
 *   Right   → secondary (`secondaryOutputSlot`)
 *   Left    → tertiary  (`tertiaryOutputSlot`)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Machine } from '../../../src/game/Machine'
import { ALL_OUTPUTS_CONNECTED_ENV } from '../../../src/game/MachineBehaviors'
import { Simulation } from '../../../src/game/Simulation'
import { createItem, resetItemIdCounter } from '../../../src/game/Item'
import type { Item } from '../../../src/game/Item'
import { SPLITTER_SIDE_BIT, SPLITTER_ALL_SIDES_BITS } from '../../../src/game/types'

const LEFT = SPLITTER_SIDE_BIT.left
const FORWARD = SPLITTER_SIDE_BIT.forward
const RIGHT = SPLITTER_SIDE_BIT.right
const ALL = SPLITTER_ALL_SIDES_BITS

function makeSplitter(id = 's1'): Machine {
  const m = new Machine(id, 'splitter')
  m.start()
  return m
}

function drainAllOutputs(m: Machine): void {
  m.outputSlot = null
  m.secondaryOutputSlot = null
  m.tertiaryOutputSlot = null
}

// ---------------------------------------------------------------------------
// Group 1 — New Machine fields and their defaults.
// ---------------------------------------------------------------------------
describe('Splitter routing — new persistent Machine fields', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('Machine.outputSidesConfig defaults to 7 (Left | Forward | Right) on a fresh splitter', () => {
    const m = new Machine('s1', 'splitter')
    expect(m.outputSidesConfig).toBe(ALL)
  })

  it('Machine.routingCounter defaults to 0 on a fresh splitter', () => {
    const m = new Machine('s1', 'splitter')
    expect(m.routingCounter).toBe(0)
  })

  it('clearRuntimeState resets both outputSidesConfig (→ALL) and routingCounter (→0)', () => {
    const m = new Machine('s1', 'splitter')
    m.outputSidesConfig = RIGHT
    m.routingCounter = 17

    m.clearRuntimeState()

    expect(m.outputSidesConfig).toBe(ALL)
    expect(m.routingCounter).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Group 2 — Default config (7 = all three sides) round-robins
//           Left → Forward → Right → Left → Forward → Right → ...
// ---------------------------------------------------------------------------
describe('Splitter routing — default config (7 = all three sides) cycles left → forward → right', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('first 3 items land on tertiary (left), primary (forward), secondary (right) in that order', () => {
    const m = makeSplitter()
    expect(m.outputSidesConfig).toBe(ALL)

    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const c = createItem('wheel_small')
    m.addInput(a)
    m.addInput(b)
    m.addInput(c)

    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    // Numerical bit order: Left (1) → Forward (2) → Right (4).
    expect(m.tertiaryOutputSlot).toBe(a)
    expect(m.outputSlot).toBe(b)
    expect(m.secondaryOutputSlot).toBe(c)
    expect(m.inputSlots).toHaveLength(0)
    expect(m.state).toBe('idle')
    expect(m.routingCounter).toBe(3)
  })

  it('counter wraps: items 4, 5, 6 land on left, forward, right respectively after a drain', () => {
    const m = makeSplitter()

    const items: Item[] = [1, 2, 3].map(() => createItem('wheel_small'))
    items.forEach((it) => m.addInput(it))
    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
    drainAllOutputs(m)
    expect(m.routingCounter).toBe(3)

    const more: Item[] = [1, 2, 3].map(() => createItem('wheel_small'))
    more.forEach((it) => m.addInput(it))
    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    expect(m.tertiaryOutputSlot).toBe(more[0]) // item 4 → left
    expect(m.outputSlot).toBe(more[1])         // item 5 → forward
    expect(m.secondaryOutputSlot).toBe(more[2]) // item 6 → right
    expect(m.routingCounter).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// Group 3 — Single-side configs ignore the round-robin (trivial cycle).
// ---------------------------------------------------------------------------
describe('Splitter routing — single-side configs route every item to the one enabled side', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('outputSidesConfig=2 (Forward only) sends every item to primary; counter still advances per park', () => {
    const m = makeSplitter()
    m.outputSidesConfig = FORWARD

    for (let i = 0; i < 4; i++) {
      const it = createItem('wheel_small')
      m.addInput(it)
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
      expect(m.outputSlot, `item #${i + 1} must land on primary (forward)`).toBe(it)
      expect(m.secondaryOutputSlot).toBeNull()
      expect(m.tertiaryOutputSlot).toBeNull()
      expect(m.routingCounter).toBe(i + 1)
      m.outputSlot = null // drain so the next item can park
    }
  })

  it('outputSidesConfig=1 (Left only) sends every item to tertiary', () => {
    const m = makeSplitter()
    m.outputSidesConfig = LEFT

    for (let i = 0; i < 3; i++) {
      const it = createItem('wheel_small')
      m.addInput(it)
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
      expect(m.tertiaryOutputSlot, `item #${i + 1} must land on tertiary (left)`).toBe(it)
      expect(m.outputSlot).toBeNull()
      expect(m.secondaryOutputSlot).toBeNull()
      m.tertiaryOutputSlot = null
    }
    expect(m.routingCounter).toBe(3)
  })

  it('outputSidesConfig=4 (Right only) sends every item to secondary', () => {
    const m = makeSplitter()
    m.outputSidesConfig = RIGHT

    for (let i = 0; i < 3; i++) {
      const it = createItem('wheel_small')
      m.addInput(it)
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
      expect(m.secondaryOutputSlot, `item #${i + 1} must land on secondary (right)`).toBe(it)
      expect(m.outputSlot).toBeNull()
      expect(m.tertiaryOutputSlot).toBeNull()
      m.secondaryOutputSlot = null
    }
    expect(m.routingCounter).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Group 4 — Two-side configs cycle in numerical bit order
//           (Left=1 < Forward=2 < Right=4).
// ---------------------------------------------------------------------------
describe('Splitter routing — two-side configs cycle in numerical bit order', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('outputSidesConfig=6 (Forward | Right) cycles forward → right (Forward bit 2 < Right bit 4)', () => {
    const m = makeSplitter()
    m.outputSidesConfig = FORWARD | RIGHT // 6

    const lands: Array<'primary' | 'secondary' | 'tertiary'> = []
    for (let i = 0; i < 4; i++) {
      const it = createItem('wheel_small')
      m.addInput(it)
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
      if (m.outputSlot === it) lands.push('primary')
      else if (m.secondaryOutputSlot === it) lands.push('secondary')
      else if (m.tertiaryOutputSlot === it) lands.push('tertiary')
      drainAllOutputs(m)
    }
    expect(lands).toEqual(['primary', 'secondary', 'primary', 'secondary'])
    expect(m.routingCounter).toBe(4)
  })

  it('outputSidesConfig=5 (Left | Right) cycles left → right (Left bit 1 < Right bit 4)', () => {
    const m = makeSplitter()
    m.outputSidesConfig = LEFT | RIGHT // 5

    const lands: Array<'primary' | 'secondary' | 'tertiary'> = []
    for (let i = 0; i < 4; i++) {
      const it = createItem('wheel_small')
      m.addInput(it)
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
      if (m.outputSlot === it) lands.push('primary')
      else if (m.secondaryOutputSlot === it) lands.push('secondary')
      else if (m.tertiaryOutputSlot === it) lands.push('tertiary')
      drainAllOutputs(m)
    }
    expect(lands).toEqual(['tertiary', 'secondary', 'tertiary', 'secondary'])
    expect(m.routingCounter).toBe(4)
  })

  it('outputSidesConfig=3 (Left | Forward) cycles left → forward (Left bit 1 < Forward bit 2)', () => {
    const m = makeSplitter()
    m.outputSidesConfig = LEFT | FORWARD // 3

    const lands: Array<'primary' | 'secondary' | 'tertiary'> = []
    for (let i = 0; i < 4; i++) {
      const it = createItem('wheel_small')
      m.addInput(it)
      m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
      if (m.outputSlot === it) lands.push('primary')
      else if (m.secondaryOutputSlot === it) lands.push('secondary')
      else if (m.tertiaryOutputSlot === it) lands.push('tertiary')
      drainAllOutputs(m)
    }
    expect(lands).toEqual(['tertiary', 'primary', 'tertiary', 'primary'])
    expect(m.routingCounter).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Group 5 — Strict round-robin blocking (CRITICAL).
//
// On a failed park, the splitter must set state='blocked' and stop —
// it must NOT advance the counter and must NOT skip ahead to the next
// enabled side. The same side is retried on the following tick.
// ---------------------------------------------------------------------------
describe('Splitter routing — strict round-robin blocks instead of skipping ahead', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('with default config (7), a stray item on FORWARD blocks at the second routing slot', () => {
    const m = makeSplitter()
    expect(m.outputSidesConfig).toBe(ALL)

    // Pre-fill the FORWARD output slot (the second slot in the cycle
    // left → forward → right). The first item will succeed on left,
    // then the second item tries forward and gets blocked.
    const stray = createItem('wheel_small')
    m.outputSlot = stray

    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const c = createItem('wheel_small')
    m.addInput(a)
    m.addInput(b)
    m.addInput(c)

    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    // Item a parked on left successfully (counter advanced 0 → 1).
    expect(m.tertiaryOutputSlot).toBe(a)
    // Item b attempted forward, found stray, splitter blocked.
    expect(m.outputSlot).toBe(stray)
    // Item b and c are STILL in input — splitter must NOT skip ahead
    // to right and park b there.
    expect(m.secondaryOutputSlot).toBeNull()
    expect(m.inputSlots).toHaveLength(2)
    expect(m.inputSlots[0]).toBe(b)
    expect(m.inputSlots[1]).toBe(c)
    expect(m.state).toBe('blocked')
    // Counter advanced exactly once (for the successful left park).
    expect(m.routingCounter).toBe(1)
  })

  it('after the blocked slot drains, the queued item parks at the SAME counter position', () => {
    const m = makeSplitter()

    const stray = createItem('wheel_small')
    m.outputSlot = stray

    const a = createItem('wheel_small')
    const b = createItem('wheel_small')
    const c = createItem('wheel_small')
    m.addInput(a)
    m.addInput(b)
    m.addInput(c)

    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)
    expect(m.state).toBe('blocked')
    expect(m.routingCounter).toBe(1)

    // Drain forward and clear the tertiary so left is reusable.
    m.outputSlot = null
    m.tertiaryOutputSlot = null

    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    // Item b parks on FORWARD (re-attempt at the same counter slot),
    // counter → 2. Item c attempts right (counter % 3 = 2 → right),
    // succeeds, counter → 3.
    expect(m.outputSlot).toBe(b)
    expect(m.secondaryOutputSlot).toBe(c)
    expect(m.inputSlots).toHaveLength(0)
    expect(m.state).toBe('idle')
    expect(m.routingCounter).toBe(3)
  })

  it('counter does NOT advance on a failed park (single-side config, occupied slot)', () => {
    const m = makeSplitter()
    m.outputSidesConfig = FORWARD

    const stray = createItem('wheel_small')
    m.outputSlot = stray

    const a = createItem('wheel_small')
    m.addInput(a)

    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    expect(m.state).toBe('blocked')
    expect(m.inputSlots).toHaveLength(1)
    expect(m.inputSlots[0]).toBe(a)
    expect(m.routingCounter).toBe(0) // unchanged
  })
})

// ---------------------------------------------------------------------------
// Group 6 — The legacy `on item arrives` event-handler bridge has NO
// effect on routing. The tickSplitter signature drops its bridge
// parameter; routing is decided exclusively by outputSidesConfig +
// routingCounter.
// ---------------------------------------------------------------------------
describe('Splitter routing — legacy event-handler bridge is ignored', () => {
  beforeEach(() => {
    resetItemIdCounter()
  })

  it('Machine.tick(rng) without any bridge argument still routes via the new persistent config', () => {
    // Confirms the new behavior does not require a bridge argument.
    const m = makeSplitter()
    m.outputSidesConfig = RIGHT

    const a = createItem('wheel_small')
    m.addInput(a)

    // Note: only one positional argument (rng). The legacy second
    // parameter (`splitterBridge`) is intentionally NOT passed.
    m.tick(Math.random, ALL_OUTPUTS_CONNECTED_ENV)

    expect(m.secondaryOutputSlot).toBe(a)
    expect(m.outputSlot).toBeNull()
    expect(m.tertiaryOutputSlot).toBeNull()
    expect(m.routingCounter).toBe(1)
  })

  it('a bridge that says "left" is overridden by outputSidesConfig=4 (Right only) → item lands on secondary', () => {
    // After E4h removed the legacy splitter-handler bridge entirely,
    // routing is driven solely by `outputSidesConfig`. This test pins
    // that contract: even without a bridge, the Right-only config
    // routes the item to the secondary slot.
    const sim = new Simulation()
    const splitter = makeSplitter('sBridge')
    sim.addMachine(splitter)
    // Mark `secondary` as connected (registry write only — no real belt
    // is registered, so `transferMachineOutputs` won't drain the slot
    // before the assertion below reads `splitter.secondaryOutputSlot`).
    sim.setMachineOutputBelt('sBridge', 'sBridge_bs', 'secondary')
    splitter.outputSidesConfig = RIGHT

    const a = createItem('wheel_small')
    splitter.addInput(a)

    sim.tick()

    // Routing follows outputSidesConfig (Right).
    expect(splitter.secondaryOutputSlot).toBe(a)
    expect(splitter.tertiaryOutputSlot).toBeNull()
    expect(splitter.outputSlot).toBeNull()
    expect(splitter.routingCounter).toBe(1)
  })
})
