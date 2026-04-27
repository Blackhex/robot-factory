/**
 * Shared assertion helpers for factory-situation tests.
 *
 * Implements the rule-7 trio from `.github/skills/unit-testing/SKILL.md`:
 *   (a) Grid snapshot via `renderGrid(...)`.
 *   (b) Final orientation of every machine on the grid.
 *   (c) Final placement and orientation of every belt on the grid
 *       (count, exact path cells, source/destination machine endpoints).
 *
 * The wrapper helpers `expectMachines`, `expectBelts`, and `expectFactoryState`
 * internally call the canonical `expect(...)` assertions required by rule 7,
 * so they may be used in place of the raw expects.
 */

import { expect } from 'vitest'
import type { Factory } from '../../../src/game/Factory'
import type { Direction, GridPosition, MachineType, SlotPosition } from '../../../src/game/types'

export type Rotation = Direction

export interface BeltExpectation {
  source: { x: number; z: number }
  destination: { x: number; z: number }
  sourceSlot?: SlotPosition
  destinationSlot?: SlotPosition
  path: Array<{ x: number; z: number }>
}

/** Machine type → single display character. */
export const MACHINE_CHAR: Record<MachineType, string> = {
  assembler: 'A',
  painter: 'P',
  recycler: 'R',
  quality_checker: 'Q',
  splitter: 'S',
  part_fabricator: 'F',
  factory_output: 'O',
}

/** Shorthand: returns a `[from, to]` pair of GridPositions for belt segment assertions. */
export function seg(fx: number, fz: number, tx: number, tz: number): [GridPosition, GridPosition] {
  return [{ x: fx, z: fz }, { x: tx, z: tz }]
}

/**
 * Render a rectangular region of the factory grid as an ASCII string.
 *
 * Format: `|c|c|c|\n|c|c|c|` where each `c` is one character per cell.
 * Rows = Z axis (z1 at top, z2 at bottom). Columns = X axis (x1 at left).
 *
 * Cell priority:
 * 1. Machine → type letter (A, P, R, Q, S, F)
 * 2. Belt intermediate cell → box-drawing character based on entry/exit direction
 * 3. Empty → space
 *
 * Belt characters for intermediate path cells:
 * - Straight: `─` (horizontal), `│` (vertical)
 * - Corners: `┌` (right+down), `┐` (left+down), `└` (right+up), `┘` (left+up)
 * - Crossings: `+`
 */
export function renderGrid(factory: Factory, x1: number, z1: number, x2: number, z2: number): string {
  const charMap = new Map<string, string>()

  for (const belt of factory.getBelts()) {
    for (let i = 1; i < belt.path.length - 1; i++) {
      const { x, z } = belt.path[i]
      const key = `${x},${z}`
      if (charMap.has(key)) {
        charMap.set(key, '+')
        continue
      }
      const prev = belt.path[i - 1]
      const next = belt.path[i + 1]
      charMap.set(key, beltChar(x - prev.x, z - prev.z, next.x - x, next.z - z))
    }
  }

  for (const machine of factory.getMachines()) {
    charMap.set(`${machine.x},${machine.z}`, MACHINE_CHAR[machine.type] ?? '?')
  }

  const rows: string[] = []
  for (let z = z1; z <= z2; z++) {
    let row = '|'
    for (let x = x1; x <= x2; x++) {
      row += (charMap.get(`${x},${z}`) ?? ' ') + '|'
    }
    rows.push(row)
  }
  return rows.join('\n')
}

function beltChar(inDx: number, inDz: number, outDx: number, outDz: number): string {
  if (inDx === outDx && inDz === outDz) {
    return inDx !== 0 ? '─' : '│'
  }
  const sides = new Set<string>()
  if (inDx === 1)  sides.add('L')
  if (inDx === -1) sides.add('R')
  if (inDz === 1)  sides.add('T')
  if (inDz === -1) sides.add('B')
  if (outDx === 1)  sides.add('R')
  if (outDx === -1) sides.add('L')
  if (outDz === 1)  sides.add('B')
  if (outDz === -1) sides.add('T')
  if (sides.has('R') && sides.has('B')) return '┌'
  if (sides.has('L') && sides.has('B')) return '┐'
  if (sides.has('R') && sides.has('T')) return '└'
  if (sides.has('L') && sides.has('T')) return '┘'
  if (sides.has('L') && sides.has('R')) return '─'
  if (sides.has('T') && sides.has('B')) return '│'
  return '?'
}

/** Assert factory has EXACTLY the given belt segments (order-independent). */
export function expectBeltSegments(factory: Factory, expected: [GridPosition, GridPosition][]): void {
  const actual: [GridPosition, GridPosition][] = []
  for (const belt of factory.getBelts()) {
    for (let i = 0; i < belt.path.length - 1; i++) {
      actual.push([belt.path[i], belt.path[i + 1]])
    }
  }
  const fmt = (segs: [GridPosition, GridPosition][]) =>
    segs.map(([f, t]) => `(${f.x},${f.z})→(${t.x},${t.z})`).join(', ')
  expect(actual.length, `Belt count mismatch.\n  Expected: [${fmt(expected)}]\n  Actual:   [${fmt(actual)}]`).toBe(expected.length)
  for (const [ef, et] of expected) {
    const found = actual.some(([af, at]) =>
      af.x === ef.x && af.z === ef.z && at.x === et.x && at.z === et.z
    )
    expect(found, `Missing belt segment (${ef.x},${ef.z})→(${et.x},${et.z}).\n  Actual: [${fmt(actual)}]`).toBe(true)
  }
}

/**
 * Rule-7 (b): assert the rotation of EVERY machine on the grid.
 *
 * Pass an array of `{ x, z, rotation }` entries. The helper:
 *   1. Asserts `factory.getMachines().length === expected.length`
 *      (catches stray machines you forgot about).
 *   2. For each entry, asserts `factory.getMachineAt(x, z)!.rotation`.
 *
 * Internally calls the canonical `expect(factory.getMachineAt(x, z)!.rotation).toBe(...)`.
 */
export function expectMachines(
  factory: Factory,
  expected: Array<{ x: number; z: number; rotation: Rotation }>
): void {
  expect(factory.getMachines().length, 'Total machine count must match expected list').toBe(expected.length)
  for (const m of expected) {
    const machine = factory.getMachineAt(m.x, m.z)
    expect(machine, `Expected machine at (${m.x},${m.z})`).not.toBeNull()
    expect(machine!.rotation, `Machine at (${m.x},${m.z}) rotation`).toBe(m.rotation)
  }
}

/**
 * Rule-7 (c): assert EVERY belt on the grid by source/destination + path,
 * and by source/destination slot when those fields are provided.
 *
 * Internally calls:
 *   - `expect(factory.getBelts()).toHaveLength(n)`
 *   - `expect(belt.path).toEqual([...])`
 *   - asserts source/destination machine x/z.
 *   - asserts source/destination slots for expected entries that include them.
 *
 * Endpoint/path-only expectations remain useful for geometry tests, but
 * migration tests that depend on lane identity should pass `sourceSlot` and
 * `destinationSlot` so same-endpoint belts cannot be silently swapped.
 */
export function expectBelts(
  factory: Factory,
  expected: BeltExpectation[]
): void {
  const belts = factory.getBelts()
  expect(belts).toHaveLength(expected.length)
  // Mark-and-check: each actual belt may satisfy at most one expected entry.
  const remaining = belts.slice()
  for (const e of expected) {
    const matchIdx = remaining.findIndex(b =>
      b.sourceMachine.x === e.source.x &&
      b.sourceMachine.z === e.source.z &&
      b.destinationMachine.x === e.destination.x &&
      b.destinationMachine.z === e.destination.z &&
      (e.sourceSlot === undefined || b.sourceSlot === e.sourceSlot) &&
      (e.destinationSlot === undefined || b.destinationSlot === e.destinationSlot) &&
      b.path.length === e.path.length &&
      b.path.every((p, i) => p.x === e.path[i].x && p.z === e.path[i].z)
    )
    // If no exact (source+dest+path) match remains, fall back to source+dest
    // and any requested slot fields. This preserves prior geometry-test
    // behaviour while keeping slot-aware migration expectations strict.
    const idx = matchIdx >= 0
      ? matchIdx
      : remaining.findIndex(b =>
          b.sourceMachine.x === e.source.x &&
          b.sourceMachine.z === e.source.z &&
          b.destinationMachine.x === e.destination.x &&
          b.destinationMachine.z === e.destination.z &&
          (e.sourceSlot === undefined || b.sourceSlot === e.sourceSlot) &&
          (e.destinationSlot === undefined || b.destinationSlot === e.destinationSlot)
        )
    expect(
      idx,
      `Expected an unmatched belt from (${e.source.x},${e.source.z}) → (${e.destination.x},${e.destination.z})` +
        `${e.sourceSlot === undefined ? '' : ` sourceSlot=${e.sourceSlot}`}` +
        `${e.destinationSlot === undefined ? '' : ` destinationSlot=${e.destinationSlot}`}`,
    ).toBeGreaterThanOrEqual(0)
    const belt = remaining.splice(idx, 1)[0]
    expect(belt.sourceMachine.x).toBe(e.source.x)
    expect(belt.sourceMachine.z).toBe(e.source.z)
    expect(belt.destinationMachine.x).toBe(e.destination.x)
    expect(belt.destinationMachine.z).toBe(e.destination.z)
    if (e.sourceSlot !== undefined) {
      expect(belt.sourceSlot).toBe(e.sourceSlot)
    }
    if (e.destinationSlot !== undefined) {
      expect(belt.destinationSlot).toBe(e.destinationSlot)
    }
    expect(belt.path).toEqual(e.path)
  }
}

/**
 * Rule-7 (a)+(b)+(c) one-shot: full snapshot of the factory grid state.
 *
 * Asserts:
 *   - (a) `renderGrid(factory, ...box)` matches `grid`
 *   - (b) every machine present has the listed rotation, and machine count matches
 *   - (c) every belt present matches by source/destination/path, and belt count matches
 */
export function expectFactoryState(
  factory: Factory,
  opts: {
    grid?: { box: [number, number, number, number]; expected: string }
    machines: Array<{ x: number; z: number; rotation: Rotation }>
    belts: BeltExpectation[]
  }
): void {
  if (opts.grid) {
    const [x1, z1, x2, z2] = opts.grid.box
    expect(renderGrid(factory, x1, z1, x2, z2)).toBe(opts.grid.expected)
  }
  expectMachines(factory, opts.machines)
  expectBelts(factory, opts.belts)
}

/**
 * Authoring helper: print copy-pasteable assertion code for the current
 * factory state. Use during test authoring to derive exact expected values,
 * then replace the dump call with the printed `expectFactoryState(...)` block.
 *
 * Calls to `dumpFactoryAssertions` must not appear in committed tests — they
 * produce console output but make no assertions.
 *
 * Usage:
 *   dumpFactoryAssertions(factory, [0, 0, 5, 5])
 *
 * Output (printed to console.log) is a TypeScript snippet that can be pasted
 * directly into a test in place of the dump call.
 */
export function dumpFactoryAssertions(
  factory: Factory,
  box?: [number, number, number, number]
): void {
  const lines: string[] = []
  lines.push('// --- expectFactoryState ---')
  lines.push('expectFactoryState(factory, {')
  if (box) {
    const [x1, z1, x2, z2] = box
    const grid = renderGrid(factory, x1, z1, x2, z2)
    const rows = grid.split('\n').map(r => `      '${r}',`).join('\n')
    lines.push(`  grid: { box: [${x1}, ${z1}, ${x2}, ${z2}], expected: [`)
    lines.push(rows)
    lines.push(`    ].join('\\n') },`)
  }
  lines.push('  machines: [')
  for (const m of factory.getMachines()) {
    lines.push(`    { x: ${m.x}, z: ${m.z}, rotation: '${m.rotation}' },`)
  }
  lines.push('  ],')
  lines.push('  belts: [')
  for (const b of factory.getBelts()) {
    const path = b.path.map(p => `{ x: ${p.x}, z: ${p.z} }`).join(', ')
    lines.push(`    {`)
    lines.push(`      source: { x: ${b.sourceMachine.x}, z: ${b.sourceMachine.z} },`)
    lines.push(`      destination: { x: ${b.destinationMachine.x}, z: ${b.destinationMachine.z} },`)
    lines.push(`      sourceSlot: '${b.sourceSlot}',`)
    lines.push(`      destinationSlot: '${b.destinationSlot}',`)
    lines.push(`      path: [${path}],`)
    lines.push(`    },`)
  }
  lines.push('  ],')
  lines.push('})')
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))
}
