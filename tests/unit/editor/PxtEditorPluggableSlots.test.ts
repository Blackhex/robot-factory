import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level guard for the runtime monkey-patch that converts
 * `factory_*` consumer blocks' Machine/Belt enum FieldDropdown into a
 * pluggable value input (with a default shadow reporter block).
 *
 * Background: PXT compiles enum-typed parameters to inline
 * `Blockly.FieldDropdown` fields, ignoring `param.shadow="..."` source
 * directives for enum kinds. As a result, the `factory_pick_machine` /
 * `factory_pick_belt` reporter blocks cannot be dragged onto a
 * machine/belt slot. We patch this at runtime in `PxtEditor.ts` by
 * wrapping each block's `init` function and rewriting its inputList:
 * the dropdown field is removed and replaced with a value input that
 * carries a Blockly type-check (`Machine` / `Belt`) and a default
 * shadow block of the matching reporter type.
 *
 * Reporter blocks (`factory_pick_machine`, `factory_pick_belt`) keep
 * their inline FieldDropdown — only their output type-check is
 * extended to include the matching enum name so the value input
 * accepts them.
 *
 * This is a structural guard: it ensures the patch infrastructure
 * stays in place across refactors. Runtime behaviour is verified by
 * end-to-end tests (see [tests/e2e/PxtEditor.spec.ts]).
 */

const PXT_EDITOR_PATH = resolve(__dirname, '../../../src/editor/PxtEditor.ts')
const PLUGGABLE_PATCHER_PATH = resolve(__dirname, '../../../src/editor/pluggableSlotsPatcher.ts')

function readPxtEditorSource(): string {
  return readFileSync(PXT_EDITOR_PATH, 'utf8')
}

function readPluggablePatcherSource(): string {
  return readFileSync(PLUGGABLE_PATCHER_PATH, 'utf8')
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

describe('PxtEditor — patchPluggableMachineBeltSlots structural guards', () => {
  it('declares the patchPluggableMachineBeltSlots method', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN
    expect(source).toMatch(/patchPluggableMachineBeltSlots\s*\(/)
  })

  it('declares an idempotency guard flag for the patch', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN — a private boolean flag prevents double-patching.
    expect(source).toMatch(/pluggableSlotsPatched\s*[:=]/)
  })

  it('method body references all 6 consumer block types', () => {
    // GIVEN — the consumer transform table (block-type strings + their
    // matching enum check + shadow reporter) lives in the helper module
    // so the PxtEditor.ts size budget is preserved. Both halves of the
    // patch (PxtEditor delegate + helper data) must agree on the set
    // of blocks being transformed.
    const helperSource = readPluggablePatcherSource()

    // THEN
    for (const blockType of [
      'factory_start_machine',
      'factory_stop_machine',
      'factory_set_recipe',
      'factory_set_machine_speed',
      'factory_on_machine_idle',
      'factory_set_belt_speed',
    ]) {
      expect(
        helperSource,
        `pluggableSlotsPatcher.ts must reference ${blockType}`,
      ).toMatch(new RegExp(`['"]${blockType}['"]`))
    }
  })

  it('method body references both reporter block types', () => {
    // GIVEN — same rationale as above; the reporter transform table
    // lives in the helper module.
    const helperSource = readPluggablePatcherSource()

    // THEN — the reporter blocks need their output type-check extended
    // so they can plug into the new value inputs.
    for (const reporterType of ['factory_pick_machine', 'factory_pick_belt']) {
      expect(
        helperSource,
        `pluggableSlotsPatcher.ts must reference ${reporterType}`,
      ).toMatch(new RegExp(`['"]${reporterType}['"]`))
    }
  })

  it('method body references both enum type-check names', () => {
    // GIVEN
    const helperSource = readPluggablePatcherSource()

    // THEN — Machine slot input.setCheck('Machine'), Belt slot
    // input.setCheck('Belt'); same names appear on the reporter
    // outputConnection.setCheck.
    expect(helperSource).toMatch(/['"]Machine['"]/)
    expect(helperSource).toMatch(/['"]Belt['"]/)
  })

  it('method body wires up outputConnection.setCheck on the reporter blocks', () => {
    // GIVEN
    const helperSource = readPluggablePatcherSource()

    // THEN — the reporter's output connection must be widened so it can
    // plug into the new typed value input.
    expect(helperSource).toMatch(/outputConnection[\s\S]*?setCheck/)
  })

  it('declares the convertFieldToValueInput helper', () => {
    // GIVEN — the helper lives in `pluggableSlotsPatcher.ts` so that
    // the heavy Blockly-DOM rewrite logic doesn't bloat PxtEditor.ts.
    const helperSource = readPluggablePatcherSource()

    // THEN
    expect(helperSource).toMatch(/convertFieldToValueInput\s*\(/)
  })

  it('convertFieldToValueInput uses Blockly input/shadow APIs', () => {
    // GIVEN
    const body = extractMethodBody(readPluggablePatcherSource(), 'convertFieldToValueInput')

    // THEN — must rebuild an input as a value input and attach a shadow.
    // We don't lock the exact API surface (Blockly versions differ on
    // `appendValueInput` vs `appendInput`, and `setShadowDom` vs
    // `connection.setShadowDom`), but at least one shadow-related call
    // must appear.
    expect(body).toMatch(/appendValueInput|appendInput/)
    expect(body).toMatch(/setShadowDom|setShadowState|domToBlock/)
    expect(body).toMatch(/setCheck/)
  })

  it('patch is invoked from updateMachineList and updateBeltList', () => {
    // GIVEN — the patch is a one-shot but must run as soon as Blockly
    // is reachable, so it is hooked into the same entry points as
    // patchBlocklyDropdowns.
    const source = readPxtEditorSource()
    const machineMethod = extractMethodBody(source, 'updateMachineList')
    const beltMethod = extractMethodBody(source, 'updateBeltList')

    // THEN
    expect(machineMethod).toMatch(/patchPluggableMachineBeltSlots/)
    expect(beltMethod).toMatch(/patchPluggableMachineBeltSlots/)
  })

  it('patch is idempotent (guarded against re-running)', () => {
    // GIVEN
    const body = extractMethodBody(readPxtEditorSource(), 'patchPluggableMachineBeltSlots')

    // THEN — early-return on the guard flag.
    expect(body).toMatch(/pluggableSlotsPatched/)
  })

  it('per-block-definition guard prevents wrapping init twice', () => {
    // GIVEN — even with the global flag, the block-level guard protects
    // against accidental re-wrap if the patch ever needs to be called
    // again (e.g. after PXT re-registers blocks). The marker flags live
    // in the helper module where the wrapping is performed.
    const helperSource = readPluggablePatcherSource()

    // THEN
    expect(helperSource).toMatch(/__rfPluggablePatched|__rfReporterPatched/)
  })

  it('convertFieldToValueInput recreates FieldLabel instances rather than re-attaching disposed ones', () => {
    // GIVEN — `block.removeInput(name, true)` disposes ALL fields on
    // that input, including the surrounding FieldLabel instances.
    // Re-attaching a disposed field is a no-op (and silently swallowed
    // by the try/catch), so the labels disappear from the block face
    // (e.g. "set", "stop", "set recipe of"). The fix snapshots label
    // text BEFORE removeInput and constructs fresh FieldLabel instances
    // on the rebuilt input.
    const body = extractMethodBody(readPluggablePatcherSource(), 'convertFieldToValueInput')

    // THEN — at least one fresh FieldLabel construction must appear.
    expect(
      body,
      'convertFieldToValueInput must construct new FieldLabel instances (not re-attach disposed fields)',
    ).toMatch(/new\s+(?:[A-Za-z_$][\w$]*\.)?FieldLabel\s*\(/)
  })

  it('convertFieldToValueInput places trailing labels on a separate dummy input', () => {
    // GIVEN — Blockly v9 renders fields BEFORE the socket on a value
    // input. Labels that originally appeared AFTER the dropdown
    // (e.g. " idle" in `on machine %machine idle`) must therefore be
    // attached to a SEPARATE dummy input following the value input,
    // otherwise they render visually before the slot.
    const body = extractMethodBody(readPluggablePatcherSource(), 'convertFieldToValueInput')

    // THEN
    expect(
      body,
      'convertFieldToValueInput must use appendDummyInput for trailing labels',
    ).toMatch(/appendDummyInput/)
  })

  it('convertFieldToValueInput preserves original input ordering via moveInputBefore', () => {
    // GIVEN — `appendValueInput` adds at the end of `inputList`. To
    // restore the dropdown's original visual position we must move
    // the new value input back to where the removed input used to be.
    // The previous implementation only fired `moveInputBefore` when
    // `targetIndex < length - 1`, which silently no-op'd for blocks
    // where the dropdown lived on the FIRST input (the common case).
    const body = extractMethodBody(readPluggablePatcherSource(), 'convertFieldToValueInput')

    // THEN
    expect(
      body,
      'convertFieldToValueInput must use moveInputBefore to restore ordering',
    ).toMatch(/moveInputBefore/)
  })

  it('convertFieldToValueInput assigns a synthetic name to unnamed sibling inputs', () => {
    // GIVEN — `moveInputBefore(inputName, siblingName)` requires the
    // sibling's `.name` to be a non-empty string. PXT generates dummy
    // inputs via `appendDummyInput()` with NO name argument, so their
    // `.name` is `""` (falsy). For blocks like `factory_set_recipe`
    // (where the dropdown lives on a dummy input followed by ANOTHER
    // dummy input — `" to "` + recipe dropdown), the next sibling's
    // empty name caused the `moveInputBefore` guard to short-circuit,
    // leaving the rebuilt value input appended at the END of inputList.
    // The visible result was wrong field order: "to <recipe> set recipe
    // of <machine>" instead of "set recipe of <machine> to <recipe>".
    //
    // The fix assigns a stable synthetic name to any unnamed sibling
    // BEFORE capturing it, so `moveInputBefore` can target it reliably.
    // Blockly stores input names as a plain string property and
    // `block.getInput(name)` walks `block.inputList` matching `.name`,
    // so a direct assignment is safe.
    const body = extractMethodBody(readPluggablePatcherSource(), 'convertFieldToValueInput')

    // THEN — the body must assign to `<sibling>.name` (any identifier
    // ending in "Sibling" or named `nextSibling`) when the captured
    // name is empty/falsy. We grep for a left-hand-side assignment to
    // a `.name` property on the sibling reference.
    expect(
      body,
      'convertFieldToValueInput must assign a synthetic .name to the next sibling input when it is unnamed (e.g. PXT-generated dummy inputs)',
    ).toMatch(/(?:nextSibling|sibling)\w*\.name\s*=/i)
  })
})

/**
 * Migration pass for blocks that already exist in the workspace at
 * the moment the prototype patch is installed. PXT loads the saved
 * workspace XML via the un-patched `Blockly.Blocks[type].init`, so
 * those blocks keep the inline FieldDropdown structure. The migration
 * function rewrites them in place — preserving connections (no
 * dispose) and the user's saved field selection.
 *
 * These are source-level structural guards: they protect the migration
 * infrastructure from being silently removed by future refactors.
 */
describe('pluggableSlotsPatcher — migrateExistingWorkspaceBlocks structural guards', () => {
  it('exports migrateExistingWorkspaceBlocks', () => {
    // GIVEN
    const source = readPluggablePatcherSource()

    // THEN — exported for `PxtEditor.ts` to call after `patchPluggableSlots`.
    expect(source).toMatch(/export\s+function\s+migrateExistingWorkspaceBlocks\s*\(/)
  })

  it('walks the live workspace via getAllBlocks', () => {
    // GIVEN — must enumerate every block currently in the workspace
    // (not just freshly-created ones), because the saved XML was
    // already deserialized before the prototype patch was installed.
    const body = extractMethodBody(readPluggablePatcherSource(), 'migrateExistingWorkspaceBlocks')

    // THEN
    expect(body).toMatch(/getAllBlocks\s*\(/)
  })

  it('writes the captured field value into the shadow via setFieldValue', () => {
    // GIVEN — the user's saved selection (e.g. `"part_fabricator_1"`)
    // must survive migration. After the structural transform, the new
    // shadow's matching field needs that value explicitly written.
    const body = extractMethodBody(readPluggablePatcherSource(), 'migrateExistingWorkspaceBlocks')

    // THEN
    expect(body).toMatch(/setFieldValue\s*\(/)
  })

  it('marks migrated blocks with __rfPluggableMigrated for idempotency', () => {
    // GIVEN — `updateMachineList` / `updateBeltList` may fire many
    // times; the migration must be idempotent at the per-block level.
    const body = extractMethodBody(readPluggablePatcherSource(), 'migrateExistingWorkspaceBlocks')

    // THEN — the marker name is fixed by the spec so PxtEditor.ts
    // (and external tooling) can rely on it.
    expect(body).toMatch(/__rfPluggableMigrated/)
  })

  it('wraps work in try/catch and reports failures via console.warn', () => {
    // GIVEN — migration must NEVER crash the editor; a single bad
    // block cannot prevent migration of the rest.
    const body = extractMethodBody(readPluggablePatcherSource(), 'migrateExistingWorkspaceBlocks')

    // THEN
    expect(body).toMatch(/try\s*\{/)
    expect(body).toMatch(/catch\s*\(/)
    expect(body).toMatch(/console\.warn/)
  })

  it('reuses convertFieldToValueInput rather than duplicating the structural transform', () => {
    // GIVEN — the spec mandates a single source of truth for the
    // FieldDropdown → value-input transform. Refactor, don't duplicate.
    const body = extractMethodBody(readPluggablePatcherSource(), 'migrateExistingWorkspaceBlocks')

    // THEN
    expect(body).toMatch(/convertFieldToValueInput\s*\(/)
  })

  it('does NOT call block.dispose (which would tear down parent connections)', () => {
    // GIVEN — the migration must transform blocks in place. Calling
    // `block.dispose()` would remove the block from its statement
    // chain and break the user's program.
    const body = extractMethodBody(readPluggablePatcherSource(), 'migrateExistingWorkspaceBlocks')

    // THEN
    expect(body).not.toMatch(/\bblock\.dispose\s*\(/)
  })

  it('does NOT call workspace.newBlock for shadow types (relies on Blockly auto-spawn from setShadowDom)', () => {
    // GIVEN — the spec mandates that the migration NEVER materializes
    // a non-shadow block on the value input. Blockly auto-instantiates
    // the shadow from the XML stored on the connection (via
    // `setShadowDom` → `respawnShadow_`), so the migration only needs
    // to read `connection.targetBlock()` and write the captured value
    // into the spawned shadow. Any explicit `workspace.newBlock(...)`
    // call would create a NON-shadow block that then has to be either
    // (a) explicitly marked as a shadow via `setShadow(true)` or
    // (b) connected as a sibling of the shadow — both of which produce
    // the duplicate `<shadow>` + `<block>` serialization that this
    // test guards against.
    const source = readPluggablePatcherSource()
    const migrationBody = extractMethodBody(source, 'migrateExistingWorkspaceBlocks')
    const helperBody = extractMethodBody(source, 'cleanupNonShadowTarget')
    const combined = migrationBody + '\n' + helperBody

    // THEN — no `workspace.newBlock(...)` / `ws.newBlock(...)` /
    // bare `newBlock(...)` call appears in the migration code path.
    // (The test allows the string `newBlock` to appear inside comments;
    // we strip line comments before asserting.)
    const stripped = combined
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n')
    expect(
      stripped,
      'migration must not call workspace.newBlock — Blockly auto-spawns the shadow from setShadowDom',
    ).not.toMatch(/\bnewBlock\s*\(/)
  })

  it('cleans up legacy duplicate <block> sibling left over by Blockly XML loader', () => {
    // GIVEN — Blockly's `Blockly.Xml.applyInputTagNodes_` processes
    // `<block>` and `<shadow>` children of a `<value>` independently:
    // the `<block>` is created via `domToBlockHeadless_` (a NON-shadow
    // block, connected to the input), then `<shadow>` is applied via
    // `connection.setShadowDom(...)`. Inspecting the bundled
    // `pxtblockly.js`:
    //
    //   Connection.prototype.setShadowDom = function(t, e) {
    //     this.shadowDom_ = t;
    //     if ((t = this.targetBlock())) {
    //       t.isShadow() && !e && (t.dispose(false), this.respawnShadow_());
    //     } else {
    //       this.respawnShadow_();
    //     }
    //   };
    //
    // When the existing target is a NON-shadow block, `setShadowDom`
    // silently stores the shadow XML alongside it WITHOUT disposing
    // the non-shadow block. The connection now holds both a real
    // block AND a shadow — and `workspaceToDom(ws, /*shadows*/true)`
    // serializes both, producing the duplicate
    // `<shadow.../><block.../>` siblings reported in the bug.
    //
    // Once that duplicate has been written to `main.blocks`, every
    // subsequent load reproduces it: PXT loads the buggy XML, the
    // patched `init` creates the value input + default shadow, then
    // Blockly's XML loader connects the saved `<block>`, then
    // `setShadowDom` stores the saved `<shadow>` alongside — repeat.
    // The migration MUST detect this state and dispose the
    // non-shadow target so only the shadow remains.
    const source = readPluggablePatcherSource()

    // THEN — a dedicated cleanup helper exists.
    expect(
      source,
      'migration must extract the duplicate-block cleanup into a named helper so the structural intent is testable',
    ).toMatch(/function\s+cleanupNonShadowTarget\s*\(/)

    const helperBody = extractMethodBody(source, 'cleanupNonShadowTarget')

    // THEN — checks `target.isShadow()` so it acts only on real
    // (non-shadow) blocks.
    expect(
      helperBody,
      'cleanup must inspect target.isShadow() so it never disposes a legitimate shadow',
    ).toMatch(/isShadow\s*\(/)

    // THEN — disposes the offending non-shadow target (we use the
    // identifier `target` so the existing "no block.dispose" guard
    // still passes).
    expect(
      helperBody,
      'cleanup must dispose the non-shadow target block to remove it from the connection',
    ).toMatch(/target\.dispose\s*\(/)

    // THEN — the cleanup must preserve any user-selected field value
    // by capturing it from the doomed real block BEFORE disposal and
    // writing it onto the (auto-respawned) shadow afterwards.
    expect(
      helperBody,
      'cleanup must preserve the captured field value by writing it onto the shadow after disposal',
    ).toMatch(/setFieldValue\s*\(/)
  })

  it('migration invokes cleanupNonShadowTarget for every consumer block (not just dummy-shaped ones)', () => {
    // GIVEN — the cleanup must run UNCONDITIONALLY per block, because
    // a block already in pluggable shape (value input + duplicate
    // sibling) skips the structural migration branch but still needs
    // the duplicate cleaned up.
    const body = extractMethodBody(readPluggablePatcherSource(), 'migrateExistingWorkspaceBlocks')

    // THEN
    expect(
      body,
      'migrateExistingWorkspaceBlocks must call cleanupNonShadowTarget for every consumer block',
    ).toMatch(/cleanupNonShadowTarget\s*\(/)
  })
})

describe('PxtEditor — migration wiring', () => {
  it('imports migrateExistingWorkspaceBlocks from the patcher module', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN
    expect(source).toMatch(/migrateExistingWorkspaceBlocks[\s\S]*?from\s+['"]\.\/pluggableSlotsPatcher['"]/)
  })

  it('calls migrateExistingWorkspaceBlocks from the shared pluggable-slot helper invoked by both list updates', () => {
    // GIVEN — `updateMachineList` and `updateBeltList` both invoke
    // `patchPluggableMachineBeltSlots`, which is the shared helper.
    // The migration call lives in that helper alongside (after) the
    // one-shot prototype patch. The structural test verifies that the
    // migration runs as part of the same code path triggered by both
    // list updates, satisfying the spec's "in both updateMachineList
    // and updateBeltList (or in a shared helper they both call)"
    // requirement.
    const source = readPxtEditorSource()
    const helperBody = extractMethodBody(source, 'patchPluggableMachineBeltSlots')

    // THEN — the helper must call `patchPluggableSlots` AND then
    // `migrateExistingWorkspaceBlocks`.
    expect(helperBody).toMatch(/patchPluggableSlots\s*\(/)
    expect(helperBody).toMatch(/migrateExistingWorkspaceBlocks\s*\(/)
    const patchIdx = helperBody.search(/patchPluggableSlots\s*\(/)
    const migrateIdx = helperBody.search(/migrateExistingWorkspaceBlocks\s*\(/)
    expect(
      migrateIdx,
      'migrateExistingWorkspaceBlocks must be called after patchPluggableSlots in the shared helper',
    ).toBeGreaterThan(patchIdx)

    // AND — both list-update entry points still route through the
    // shared helper (so the migration is reachable from both code paths).
    const machineMethod = extractMethodBody(source, 'updateMachineList')
    const beltMethod = extractMethodBody(source, 'updateBeltList')
    expect(machineMethod).toMatch(/patchPluggableMachineBeltSlots/)
    expect(beltMethod).toMatch(/patchPluggableMachineBeltSlots/)
  })

  it('migration call is wrapped in try/catch so it never crashes the editor', () => {
    // GIVEN — even with the helper's internal try/catch, the call site
    // must defensively guard against unexpected throws (e.g. blockly
    // window access errors).
    const body = extractMethodBody(readPxtEditorSource(), 'patchPluggableMachineBeltSlots')

    // THEN — the migration call should be inside a try/catch with a
    // console.warn fallback.
    expect(body).toMatch(/try\s*\{[\s\S]*?migrateExistingWorkspaceBlocks[\s\S]*?\}\s*catch[\s\S]*?console\.warn/)
  })
})

/**
 * Self-healing migration listener. The one-shot
 * `migrateExistingWorkspaceBlocks` pass runs from
 * `updateMachineList` / `updateBeltList`, which are driven by
 * simulation telemetry and fire BEFORE PXT finishes loading the
 * saved workspace XML inside the iframe. At that moment
 * `getAllBlocks(false)` is empty, so nothing is migrated. The
 * duplicate `<block>` sibling that Blockly's XML loader spawns
 * inside the value input therefore persists across reloads —
 * unless we also subscribe to workspace events and re-run the
 * cleanup whenever a consumer block is created or the loader
 * signals it is done.
 *
 * These tests guard the listener infrastructure against silent
 * removal by future refactors.
 */
describe('pluggableSlotsPatcher — installMigrationListener structural guards', () => {
  it('exports installMigrationListener', () => {
    // GIVEN
    const source = readPluggablePatcherSource()

    // THEN
    expect(source).toMatch(/export\s+function\s+installMigrationListener\s*\(/)
  })

  it('subscribes via workspace.addChangeListener (Blockly v9 API)', () => {
    // GIVEN
    const body = extractMethodBody(readPluggablePatcherSource(), 'installMigrationListener')

    // THEN
    expect(body).toMatch(/addChangeListener\s*\(/)
  })

  it('handles the BLOCK_CREATE event (or its string literal "create")', () => {
    // GIVEN — Blockly exposes `Blockly.Events.BLOCK_CREATE === 'create'`,
    // but the listener must work even if the constant is missing on a
    // stripped build, so it falls back to the string literal.
    const body = extractMethodBody(readPluggablePatcherSource(), 'installMigrationListener')

    // THEN
    expect(body).toMatch(/BLOCK_CREATE|['"]create['"]/)
  })

  it('handles the FINISHED_LOADING event so the cleanup runs after XML deserialization', () => {
    // GIVEN — `finished_loading` is the safe checkpoint at which the
    // duplicate `<block>` sibling is guaranteed to exist if it is
    // going to exist; the per-block BLOCK_CREATE handler is a safety
    // net but cannot rely on children being connected at that moment.
    const body = extractMethodBody(readPluggablePatcherSource(), 'installMigrationListener')

    // THEN
    expect(body).toMatch(/FINISHED_LOADING|['"]finished_loading['"]/)
  })

  it('marks the workspace with __rfMigrationListenerInstalled for one-shot install', () => {
    // GIVEN — the listener must be installed at most once per workspace
    // lifetime; subsequent calls are silent no-ops.
    const body = extractMethodBody(readPluggablePatcherSource(), 'installMigrationListener')

    // THEN
    expect(body).toMatch(/__rfMigrationListenerInstalled/)
  })

  it('reuses cleanupNonShadowTarget rather than duplicating the cleanup body', () => {
    // GIVEN — refactor, don't duplicate. The listener delegates to the
    // existing per-block cleanup helper.
    const body = extractMethodBody(readPluggablePatcherSource(), 'installMigrationListener')

    // THEN
    expect(body).toMatch(/cleanupNonShadowTarget\s*\(/)
  })

  it('wraps the listener body in try/catch with console.warn so it never throws into Blockly', () => {
    // GIVEN — a listener that throws would corrupt Blockly's event
    // loop and brick the editor for the rest of the session.
    const body = extractMethodBody(readPluggablePatcherSource(), 'installMigrationListener')

    // THEN
    expect(body).toMatch(/try\s*\{/)
    expect(body).toMatch(/catch\s*\(/)
    expect(body).toMatch(/console\.warn/)
  })
})

describe('PxtEditor — migration listener wiring', () => {
  it('imports installMigrationListener from the patcher module', () => {
    // GIVEN
    const source = readPxtEditorSource()

    // THEN
    expect(source).toMatch(/installMigrationListener[\s\S]*?from\s+['"]\.\/pluggableSlotsPatcher['"]/)
  })

  it('calls installMigrationListener from patchPluggableMachineBeltSlots after the initial migration', () => {
    // GIVEN — the listener install must be reachable from both
    // `updateMachineList` and `updateBeltList` (both route through the
    // shared `patchPluggableMachineBeltSlots` helper). The listener's
    // own `__rfMigrationListenerInstalled` flag makes repeated calls
    // safe, so we don't need a separate idempotency wrapper here.
    const body = extractMethodBody(readPxtEditorSource(), 'patchPluggableMachineBeltSlots')

    // THEN
    expect(body).toMatch(/installMigrationListener\s*\(/)
    const migrateIdx = body.search(/migrateExistingWorkspaceBlocks\s*\(/)
    const installIdx = body.search(/installMigrationListener\s*\(/)
    expect(
      installIdx,
      'installMigrationListener must be called after migrateExistingWorkspaceBlocks (so the initial pass runs first)',
    ).toBeGreaterThan(migrateIdx)
  })
})
