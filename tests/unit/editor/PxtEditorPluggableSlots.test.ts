import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level guard for the runtime monkey-patch that USED TO convert
 * `factory_*` consumer blocks' Machine/Belt enum FieldDropdown into a
 * pluggable value input (with a default shadow reporter block).
 *
 * REVERSION: the pluggable approach exposed a structural PXT compiler
 * bug — blocks→TS compilation always emits the enum's default member
 * (Machine.A === 0) for the shadow's argument, regardless of the
 * field value. We've reverted to inline FieldDropdowns, which PXT
 * compiles correctly. The patcher source file stays for now (we may
 * revisit later), but PxtEditor must NOT wire any of its functions
 * in — doing so would re-pluggable the inline slots and re-introduce
 * the compiler bug.
 *
 * The helper-exists guards (lower in this file) are retained so the
 * patcher source stays self-consistent until we delete it. The wiring
 * guards have been INVERTED to assert PxtEditor no longer calls
 * `patchPluggableSlots`, `migrateExistingWorkspaceBlocks`, or
 * `installMigrationListener`.
 */

const PXT_EDITOR_PATH = resolve(__dirname, '../../../src/editor/PxtEditor.ts')

function readPxtEditorSource(): string {
  return readFileSync(PXT_EDITOR_PATH, 'utf8')
}

/** Locate the body of the named method (best-effort brace matching). */
function extractMethodBody(source: string, methodName: string): string {
  const sigRe = new RegExp(`(?:private\\s+|public\\s+|protected\\s+)?${methodName}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]+)?\\{`)
  const m = source.match(sigRe)
  expect(m, `${methodName} declaration must exist`).not.toBeNull()
  const start = (m!.index ?? 0) + m![0].length
  let depth = 1
  let i = start
  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    i++
  }
  return source.slice(start, i - 1)
}

describe('PxtEditor — pluggable-slot wiring is REMOVED (PXT enum-shadow compiler bug)', () => {
  it('PxtEditor does NOT import patchPluggableSlots from the patcher module', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN
    expect(source).not.toMatch(/patchPluggableSlots[\s\S]*?from\s+['"]\.\/pluggableSlotsPatcher['"]/)
  })

  it('PxtEditor does NOT import migrateExistingWorkspaceBlocks from the patcher module', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN
    expect(source).not.toMatch(/migrateExistingWorkspaceBlocks[\s\S]*?from\s+['"]\.\/pluggableSlotsPatcher['"]/)
  })

  it('PxtEditor does NOT import installMigrationListener from the patcher module', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN
    expect(source).not.toMatch(/installMigrationListener[\s\S]*?from\s+['"]\.\/pluggableSlotsPatcher['"]/)
  })

  it('PxtEditor does NOT call patchPluggableSlots anywhere', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN
    expect(source).not.toMatch(/\bpatchPluggableSlots\s*\(/)
  })

  it('PxtEditor does NOT call migrateExistingWorkspaceBlocks anywhere', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN
    expect(source).not.toMatch(/\bmigrateExistingWorkspaceBlocks\s*\(/)
  })

  it('PxtEditor does NOT call installMigrationListener anywhere', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN
    expect(source).not.toMatch(/\binstallMigrationListener\s*\(/)
  })

  it('PxtEditor does NOT declare a patchPluggableMachineBeltSlots method', () => {
    // GIVEN — the per-list-update entry that wired the patch into
    // updateMachineList / updateBeltList must be gone. If this method
    // still exists, the patch is being re-applied on every machine /
    // belt list refresh, which is exactly how the enum-shadow bug came
    // back the last time we tried to keep "just the helper".
    const source = readPxtEditorSource()

    // THEN
    expect(source).not.toMatch(/patchPluggableMachineBeltSlots\s*\(/)
  })

  it('PxtEditor does NOT declare a pluggableSlotsPatched idempotency flag', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN — the flag has no purpose once the patch is gone.
    expect(source).not.toMatch(/pluggableSlotsPatched\s*[:=]/)
  })

  it('updateMachineList does NOT reference any pluggable-patch entry point', () => {
    // GIVEN
    const source = readPxtEditorSource()
    const body = extractMethodBody(source, 'updateMachineList')

    // THEN
    expect(body).not.toMatch(/patchPluggable|migrateExistingWorkspaceBlocks|installMigrationListener/)
  })

  it('updateBeltList does NOT reference any pluggable-patch entry point', () => {
    // GIVEN
    const source = readPxtEditorSource()
    const body = extractMethodBody(source, 'updateBeltList')

    // THEN
    expect(body).not.toMatch(/patchPluggable|migrateExistingWorkspaceBlocks|installMigrationListener/)
  })
})

