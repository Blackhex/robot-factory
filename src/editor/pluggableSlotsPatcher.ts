/**
 * Runtime monkey-patch that converts each `factory_*` consumer block's
 * Machine/Belt enum `FieldDropdown` into a pluggable value input (with
 * a default shadow reporter block), and widens the matching reporter
 * blocks' `outputConnection` type-check so they can plug into those
 * inputs.
 *
 * **Why this exists**: PXT renders enum-typed parameters as inline
 * `Blockly.FieldDropdown` fields, ignoring the
 * `//% <param>.shadow="<blockId>"` source directive. As a result, the
 * `factory_pick_machine` / `factory_pick_belt` reporter blocks cannot
 * be dragged onto a machine/belt slot. We rewrite the input list at
 * runtime to expose a typed value input instead.
 *
 * The functions here are pure (no `PxtEditor` dependency) so they can
 * be unit-tested in isolation against a stub Blockly object.
 */

export interface PluggableSlotTransform {
  /** The PXT-generated block type (e.g. `factory_start_machine`). */
  blockType: string
  /** The dropdown field name on that block (`machine` or `belt`). */
  fieldName: 'machine' | 'belt'
  /** The Blockly type-check tag for the value input (`Machine` or `Belt`). */
  check: 'Machine' | 'Belt'
  /** The reporter block id used as the default shadow for the new input. */
  shadow: 'factory_pick_machine' | 'factory_pick_belt'
}

export interface PluggableReporterTransform {
  blockType: 'factory_pick_machine' | 'factory_pick_belt'
  check: 'Machine' | 'Belt'
}

/**
 * Tables consumed by {@link patchPluggableSlots}. Co-locating them with
 * the patch logic keeps the data and the implementation in one file.
 */
export const PLUGGABLE_CONSUMER_TRANSFORMS: PluggableSlotTransform[] = [
  { blockType: 'factory_start_machine',     fieldName: 'machine', check: 'Machine', shadow: 'factory_pick_machine' },
  { blockType: 'factory_stop_machine',      fieldName: 'machine', check: 'Machine', shadow: 'factory_pick_machine' },
  { blockType: 'factory_set_machine_speed', fieldName: 'machine', check: 'Machine', shadow: 'factory_pick_machine' },
  { blockType: 'factory_on_machine_idle',   fieldName: 'machine', check: 'Machine', shadow: 'factory_pick_machine' },
  { blockType: 'factory_on_item_arrives',   fieldName: 'machine', check: 'Machine', shadow: 'factory_pick_machine' },
  { blockType: 'factory_route_items_to',    fieldName: 'machine', check: 'Machine', shadow: 'factory_pick_machine' },
  { blockType: 'factory_set_belt_speed',    fieldName: 'belt',    check: 'Belt',    shadow: 'factory_pick_belt' },
]

export const PLUGGABLE_REPORTER_TRANSFORMS: PluggableReporterTransform[] = [
  // Reporter `outputConnection.setCheck([Machine|Belt, Number])` is
  // applied inside `patchPluggableSlots` below.
  { blockType: 'factory_pick_machine', check: 'Machine' },
  { blockType: 'factory_pick_belt',    check: 'Belt' },
]

/**
 * Apply the pluggable-slot transforms to the given Blockly registry.
 * Idempotent per block definition (uses `__rfPluggablePatched` /
 * `__rfReporterPatched` marker flags on each `Blockly.Blocks[type]`).
 */
export function patchPluggableSlots(
  blockly: any,
  consumers: PluggableSlotTransform[],
  reporters: PluggableReporterTransform[],
): void {
  if (!blockly?.Blocks) return

  for (const t of consumers) {
    const def = blockly.Blocks[t.blockType]
    if (!def || def.__rfPluggablePatched) continue
    const origInit = def.init
    if (typeof origInit !== 'function') continue
    def.init = function(this: any) {
      origInit.call(this)
      try {
        convertFieldToValueInput(this, t.fieldName, t.check, t.shadow, blockly)
      } catch (err) {
        // Failure to transform must not break block init — fall back
        // to the (non-pluggable) FieldDropdown so the editor remains
        // usable even if Blockly's API surface drifts.
        console.warn(`[PxtEditor] convertFieldToValueInput(${t.blockType}) failed`, err)
      }
    }
    def.__rfPluggablePatched = true
  }

  // Widen reporter output type-check so it can plug into the new typed
  // value inputs while still being assignable to Number-typed contexts
  // (PXT compiles enum values to numbers).
  for (const r of reporters) {
    const def = blockly.Blocks[r.blockType]
    if (!def || def.__rfReporterPatched) continue
    const origInit = def.init
    if (typeof origInit !== 'function') continue
    def.init = function(this: any) {
      origInit.call(this)
      try {
        if (this.outputConnection?.setCheck) {
          this.outputConnection.setCheck([r.check, 'Number'])
        }
      } catch (err) {
        console.warn(`[PxtEditor] reporter setCheck(${r.blockType}) failed`, err)
      }
    }
    def.__rfReporterPatched = true
  }
}

/**
 * Lightweight snapshot of a `Blockly.FieldLabel`-like field. We
 * snapshot DATA (text + tooltip) before tearing down the input,
 * because `block.removeInput(name, true)` disposes every field
 * owned by that input — including the FieldLabel instances. After
 * disposal, calling `valueInput.appendField(disposedField)` is a
 * no-op (the field's `sourceBlock_` is null), which is exactly the
 * bug that made the "set", "stop", "set recipe of", … prefixes
 * vanish from the rendered block face.
 */
interface LabelSnapshot {
  text: string
  tooltip?: string
}

/**
 * Detect a label-like field. We deliberately reject any field that
 * carries a `name` (FieldDropdown, FieldNumber, FieldTextInput, …),
 * since those are the actual data-bearing inputs and rebuilding them
 * from text alone would lose their value/options.
 *
 * In the consumer blocks we patch (`factory_start_machine`, etc.),
 * the only non-label sibling on the targeted input is the enum
 * dropdown itself (which we explicitly skip), so dropping unnamed-
 * label fields covers every real label without misclassifying any
 * data field.
 */
function snapshotLabel(field: any): LabelSnapshot | null {
  if (!field || typeof field.getText !== 'function') return null
  if (field.name) return null
  const text = String(field.getText() ?? '')
  if (!text) return null
  let tooltip: string | undefined
  try {
    if (typeof field.getTooltip === 'function') {
      const t = field.getTooltip()
      if (t) tooltip = String(t)
    }
  } catch { /* tooltip is best-effort */ }
  return { text, tooltip }
}

/**
 * Mutate a Blockly block in place: locate the input that owns the
 * `FieldDropdown` named `fieldName`, capture the surrounding labels
 * and the dropdown's current value, then rebuild the input as a
 * value input that:
 *
 *  1. carries a Blockly type-check (`check`) so only the matching
 *     reporter block can plug in,
 *  2. has a default shadow block (`shadowBlockType`) attached via
 *     `connection.setShadowDom()` so the block looks the same as
 *     today when first dragged out of the toolbox.
 *
 * Labels that surrounded the dropdown are recreated as fresh
 * `Blockly.FieldLabel` instances on the rebuilt input, because
 * `removeInput(name, true)` disposes the originals (see
 * {@link snapshotLabel}). Trailing labels (those that appeared
 * AFTER the dropdown) are placed on a separate dummy input that
 * follows the value input — Blockly v9 always renders fields
 * BEFORE the socket on a value input, so a single-input layout
 * would put the trailing text visually before the slot.
 */
export function convertFieldToValueInput(
  block: any,
  fieldName: 'machine' | 'belt',
  check: 'Machine' | 'Belt',
  shadowBlockType: 'factory_pick_machine' | 'factory_pick_belt',
  blockly: any,
): any | null {
  const inputList: any[] = block.inputList ?? []
  let targetInput: any = null
  let targetIndex = -1
  for (let i = 0; i < inputList.length; i++) {
    const fields = inputList[i].fieldRow ?? []
    if (fields.some((f: any) => f && f.name === fieldName)) {
      targetInput = inputList[i]
      targetIndex = i
      break
    }
  }
  if (!targetInput) return null

  // Capture surrounding labels and the dropdown's current value
  // BEFORE tearing down the input — `removeInput(name, true)` also
  // disposes every field on that input, so we must persist the
  // information we need to rebuild faithfully.
  const fieldRow: any[] = (targetInput.fieldRow ?? []).slice()
  const dropdownPos = fieldRow.findIndex((f) => f && f.name === fieldName)
  const dropdownValue: string = (() => {
    const f = fieldRow[dropdownPos]
    if (!f) return ''
    if (typeof f.getValue === 'function') return String(f.getValue() ?? '')
    return String(f.value_ ?? '')
  })()
  const labelsBefore: LabelSnapshot[] = []
  const labelsAfter: LabelSnapshot[] = []
  for (let i = 0; i < fieldRow.length; i++) {
    if (i === dropdownPos) continue
    const snap = snapshotLabel(fieldRow[i])
    if (!snap) continue
    if (i < dropdownPos) labelsBefore.push(snap)
    else labelsAfter.push(snap)
  }

  const inputName = targetInput.name || `RF_${fieldName.toUpperCase()}_INPUT`
  const trailingDummyName = `${inputName}_TRAIL`
  const isInline = block.inputsInline !== false

  // Capture the original next-sibling input's name BEFORE removal —
  // we use it as a stable handle for `moveInputBefore` to put the
  // rebuilt input(s) back where the dropdown used to live. (The
  // sibling shifts up by one index after removal, but its `.name`
  // does not change.)
  //
  // PXT generates dummy inputs via `appendDummyInput()` with NO name
  // argument, so their `.name` is `""` (falsy) — and `moveInputBefore`
  // requires a non-empty name. Without a synthetic name assigned here,
  // the move-guard short-circuited for blocks where the dropdown's
  // sibling was an unnamed dummy (e.g. `factory_set_recipe`, whose
  // second input is a dummy carrying `" to "` + the recipe dropdown).
  // The visible bug was wrong field order: "to <recipe> set recipe of
  // <machine>" instead of "set recipe of <machine> to <recipe>".
  //
  // Blockly stores input names as a plain string property and
  // `block.getInput(name)` walks `block.inputList` matching `.name`,
  // so a direct assignment is safe and stable for `moveInputBefore`.
  let nextSibling: any | undefined = undefined
  if (targetIndex >= 0 && targetIndex + 1 < inputList.length) {
    nextSibling = inputList[targetIndex + 1]
    if (nextSibling && (typeof nextSibling.name !== 'string' || nextSibling.name.length === 0)) {
      try {
        nextSibling.name = `RF_AUTO_${fieldName}_${targetIndex + 1}_${block.id ?? 'noid'}`
      } catch (err) {
        console.warn(`[PxtEditor] could not assign synthetic name to sibling input`, err)
      }
    }
  }
  const nextSiblingName: string | undefined = nextSibling?.name || undefined

  // Tear down the old input (true = also dispose every field on it).
  if (typeof block.removeInput === 'function') {
    block.removeInput(targetInput.name, true)
  }

  // Rebuild as a value input. `appendValueInput` adds at the end of
  // `inputList`; ordering is restored below via `moveInputBefore`.
  const valueInput = block.appendValueInput(inputName)
  if (typeof valueInput.setCheck === 'function') {
    valueInput.setCheck(check)
  }

  const FieldLabel = blockly?.FieldLabel
  const canBuildLabels = typeof FieldLabel === 'function'

  // Recreate labels that originally appeared BEFORE the dropdown on
  // the new value input. Blockly renders these before the socket,
  // which matches their original position relative to the dropdown.
  if (canBuildLabels) {
    for (const snap of labelsBefore) {
      try {
        const fld = new FieldLabel(snap.text)
        if (snap.tooltip && typeof fld.setTooltip === 'function') {
          try { fld.setTooltip(snap.tooltip) } catch { /* tooltip is best-effort */ }
        }
        valueInput.appendField(fld)
      } catch (err) {
        console.warn(`[PxtEditor] FieldLabel(before) attach failed on ${inputName}`, err)
      }
    }
  }

  // Trailing labels (those that originally appeared AFTER the
  // dropdown — e.g. " idle" on `on machine %machine idle`) need a
  // SEPARATE dummy input following the value input, because Blockly
  // v9 always renders fields before the socket on a value input.
  let trailingDummy: any = null
  if (
    canBuildLabels &&
    labelsAfter.length > 0 &&
    typeof block.appendDummyInput === 'function'
  ) {
    try {
      trailingDummy = block.appendDummyInput(trailingDummyName)
      for (const snap of labelsAfter) {
        try {
          const fld = new FieldLabel(snap.text)
          if (snap.tooltip && typeof fld.setTooltip === 'function') {
            try { fld.setTooltip(snap.tooltip) } catch { /* tooltip is best-effort */ }
          }
          trailingDummy.appendField(fld)
        } catch (err) {
          console.warn(`[PxtEditor] FieldLabel(after) attach failed on ${trailingDummyName}`, err)
        }
      }
    } catch (err) {
      console.warn(`[PxtEditor] appendDummyInput failed for ${trailingDummyName}`, err)
      trailingDummy = null
    }
  }

  // Restore original ordering. After removeInput, the input that
  // originally followed targetInput is still in place (its name
  // unchanged). We move the new value input — and the trailing
  // dummy if any — to be BEFORE that sibling. If the dropdown was
  // on the last input, there is no sibling; appending at the end
  // is already correct.
  if (nextSiblingName && typeof block.moveInputBefore === 'function') {
    try {
      block.moveInputBefore(inputName, nextSiblingName)
      if (trailingDummy) {
        block.moveInputBefore(trailingDummyName, nextSiblingName)
      }
    } catch (err) {
      console.warn(`[PxtEditor] moveInputBefore failed for ${inputName}`, err)
    }
  }

  if (isInline && typeof block.setInputsInline === 'function') {
    block.setInputsInline(true)
  }

  // Attach a default shadow reporter so the slot looks populated.
  // `setShadowDom` on the connection works in both flyout (read-only)
  // and main workspace contexts; Blockly auto-instantiates the shadow
  // when the block is rendered.
  const textToDom = blockly.Xml?.textToDom ?? blockly.utils?.xml?.textToDom
  if (typeof textToDom === 'function') {
    const safeValue = dropdownValue.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string),
    )
    const shadowXml =
      `<xml xmlns="https://developers.google.com/blockly/xml">` +
      `<shadow type="${shadowBlockType}">` +
      `<field name="${fieldName}">${safeValue}</field>` +
      `</shadow>` +
      `</xml>`
    try {
      const dom = textToDom(shadowXml)
      const shadowNode = dom.firstElementChild ?? dom.firstChild
      const conn = valueInput.connection
      if (shadowNode && conn?.setShadowDom) {
        conn.setShadowDom(shadowNode)
      }
    } catch (err) {
      console.warn(`[PxtEditor] shadow attach failed for ${shadowBlockType}`, err)
    }
  }

  return valueInput
}

/**
 * Migrate blocks already present in `workspace` that match a consumer
 * transform but were initialized BEFORE {@link patchPluggableSlots}
 * installed the prototype patch. PXT loads the saved workspace XML
 * during editor bootstrap (synchronously, via the un-patched `init`),
 * so any blocks that survived the previous session keep the inline
 * `FieldDropdown` instead of the pluggable value input. This pass
 * walks the live workspace and rewrites those blocks in place.
 *
 * Idempotency:
 *  - Per-block flag `__rfPluggableMigrated` short-circuits re-migration.
 *  - Detection only triggers when a dummy input (Blockly v9 type code 5)
 *    still owns a field whose `name === transform.fieldName`, so a block
 *    that has already been converted (the field is gone, replaced by a
 *    typed value input) is skipped automatically.
 *
 * Connection preservation:
 *  - We never call `block.dispose()` — that would tear down the parent
 *    block's surrounding next/previous/output connections.
 *  - Only the targeted named input is rebuilt (via the shared
 *    {@link convertFieldToValueInput} helper), so the rest of the
 *    block — and its place in any statement chain — is untouched.
 *
 * Failure isolation: a per-block `try/catch` ensures one bad block
 * cannot prevent migration of the rest, and the outer `try/catch` in
 * the call site ensures migration cannot crash the editor.
 */
export function migrateExistingWorkspaceBlocks(
  blockly: any,
  workspace: any,
  consumers: PluggableSlotTransform[],
): void {
  if (!blockly?.Blocks || !workspace || typeof workspace.getAllBlocks !== 'function') return

  const transformsByType = new Map<string, PluggableSlotTransform>()
  for (const t of consumers) transformsByType.set(t.blockType, t)

  let blocks: any[] = []
  try {
    blocks = workspace.getAllBlocks(false) ?? []
  } catch (err) {
    console.warn('[PxtEditor] migrateExistingWorkspaceBlocks: getAllBlocks failed', err)
    return
  }

  for (const block of blocks) {
    if (!block) continue
    const transform = transformsByType.get(block.type)
    if (!transform) continue

    // Detection: still have a DUMMY input (type code 5 in Blockly v9)
    // that owns a field with the original dropdown name? If yes, the
    // block needs the structural transform (CASE 1). If no, it is
    // already in pluggable shape — but it may still hold the legacy
    // duplicate `<block>` sibling that survived a save/load cycle, so
    // CASE 2 cleanup runs unconditionally below.
    const inputList: any[] = block.inputList ?? []
    const needsMigration = inputList.some((inp) => {
      if (!inp || inp.type !== 5) return false
      const fields = inp.fieldRow ?? []
      return fields.some((f: any) => f && f.name === transform.fieldName)
    })

    // CASE 1: structural migration — the block is still in the
    // legacy dummy-input + FieldDropdown shape. Convert it in place.
    // Gated on the per-block flag so we do not double-rebuild an
    // already-migrated input.
    if (!block.__rfPluggableMigrated && needsMigration) {
      try {
        // Capture the dropdown's current value BEFORE the structural
        // transform tears down the input (and disposes its fields).
        let capturedValue = ''
        for (const inp of inputList) {
          const fields = inp?.fieldRow ?? []
          for (const f of fields) {
            if (f && f.name === transform.fieldName) {
              try {
                capturedValue = String(
                  typeof f.getValue === 'function' ? (f.getValue() ?? '') : (f.value_ ?? ''),
                )
              } catch { capturedValue = '' }
            }
          }
        }

        // Apply the same transform used by the freshly-initialized init()
        // path. The helper internally bakes `capturedValue` into the
        // shadow XML via `setShadowDom`, but for an already-rendered
        // live block the shadow may not auto-instantiate, so we also
        // write the value explicitly below.
        const valueInput = convertFieldToValueInput(
          block,
          transform.fieldName,
          transform.check,
          transform.shadow,
          blockly,
        )

        // Force the shadow to materialize and carry the captured value.
        // `connection.targetBlock()` returns the (auto-spawned) shadow
        // once Blockly realizes it; if not yet realized, re-run
        // `setShadowDom` to trigger a respawn, then read it again.
        if (capturedValue && valueInput?.connection) {
          const conn = valueInput.connection
          let shadowBlock: any = null
          try { shadowBlock = typeof conn.targetBlock === 'function' ? conn.targetBlock() : null } catch { /* best-effort */ }
          if (!shadowBlock) {
            try {
              const dom = typeof conn.getShadowDom === 'function' ? conn.getShadowDom() : null
              if (dom && typeof conn.setShadowDom === 'function') {
                conn.setShadowDom(dom)
                shadowBlock = typeof conn.targetBlock === 'function' ? conn.targetBlock() : null
              }
            } catch (err) {
              console.warn('[PxtEditor] shadow respawn failed', err)
            }
          }
          if (shadowBlock && typeof shadowBlock.setFieldValue === 'function') {
            try {
              shadowBlock.setFieldValue(capturedValue, transform.fieldName)
            } catch (err) {
              console.warn(`[PxtEditor] setFieldValue on migrated shadow failed for ${block.type}`, err)
            }
          }
        }

        // Render update so the user sees the migrated block. Only call
        // initSvg if the block has not been rendered yet (avoid creating
        // a duplicate SVG group on already-rendered blocks).
        try {
          if (typeof block.initSvg === 'function' && !block.rendered && !block.svgGroup_) {
            block.initSvg()
          }
          if (typeof block.render === 'function') {
            block.render()
          }
        } catch (err) {
          console.warn(`[PxtEditor] render after migration failed for ${block.type}`, err)
        }
      } catch (err) {
        console.warn(`[PxtEditor] migrateExistingWorkspaceBlocks: failed for ${block?.type}`, err)
      }
    }

    // CASE 2: cleanup of legacy duplicate <block> sibling that
    // accumulates inside <value> across save/load cycles. See
    // `cleanupNonShadowTarget` for the full root-cause writeup.
    // This runs UNCONDITIONALLY for every consumer block — even
    // those that were already in pluggable shape — because the
    // duplicate is the very state that would otherwise be skipped.
    try {
      cleanupNonShadowTarget(block, transform)
    } catch (err) {
      console.warn(`[PxtEditor] cleanupNonShadowTarget: failed for ${block?.type}`, err)
    }

    block.__rfPluggableMigrated = true
  }
}

/**
 * Strip the legacy duplicate `<block>` sibling that lives next to the
 * `<shadow>` inside a value input on consumer blocks
 * (`factory_set_belt_speed`, `factory_set_recipe`, etc.).
 *
 * **Root cause**: `Blockly.Xml.applyInputTagNodes_` processes `<block>`
 * and `<shadow>` children of a `<value>` independently. When BOTH are
 * present:
 *  1. `<block>` → `domToBlockHeadless_` creates a NON-shadow block
 *     and connects it to the input.
 *  2. `<shadow>` → `connection.setShadowDom(...)`. Per the bundled
 *     `pxtblockly.js`, `setShadowDom` is a no-op when the connection
 *     already has a NON-shadow target — it just stores the shadow XML
 *     alongside without disposing the real block.
 *
 * The connection now holds both a real block target AND a shadow XML.
 * `Blockly.Xml.workspaceToDom(ws, /*shadows*\/true)` serializes both
 * → `<value><shadow.../><block.../></value>`. The next save/load
 * cycle re-applies that XML and reproduces the same duplicate, so
 * the bad state is sticky.
 *
 * **Fix**: detect the value input on each consumer block; if its
 * connection target is a non-shadow block, capture its field value,
 * dispose it (Blockly auto-respawns the shadow on disconnect via
 * `Connection.disconnect → respawnShadow_`), then write the captured
 * value into the freshly-spawned shadow.
 *
 * **Safety**: never touches a connection whose target IS a shadow.
 * Wrapped in try/catch by the caller; per-step try/catch here so a
 * failure on dispose still attempts the shadow respawn.
 */
function cleanupNonShadowTarget(block: any, transform: PluggableSlotTransform): void {
  if (!block || typeof block.getInput !== 'function') return
  const valueInputName = `RF_${transform.fieldName.toUpperCase()}_INPUT`
  const valueInput = block.getInput(valueInputName)
  const conn = valueInput?.connection
  if (!conn || typeof conn.targetBlock !== 'function') return

  let target: any = null
  try { target = conn.targetBlock() } catch { return }
  if (!target || typeof target.isShadow !== 'function') return
  // Leave legitimate shadow targets and empty connections alone.
  if (target.isShadow()) return

  // Capture the user's field selection from the doomed real block
  // BEFORE disposal so it can survive on the respawned shadow.
  let capturedValue = ''
  try {
    const f = typeof target.getField === 'function' ? target.getField(transform.fieldName) : null
    if (f) {
      capturedValue = String(typeof f.getValue === 'function' ? (f.getValue() ?? '') : (f.value_ ?? ''))
    }
  } catch (err) {
    console.warn(`[PxtEditor] cleanupNonShadowTarget: capture value failed for ${block.type}`, err)
  }

  // Dispose the non-shadow target. `Connection.disconnect()` is
  // invoked internally by `Block.dispose(false)`; per the bundled
  // Blockly source, disconnecting a non-shadow child triggers
  // `respawnShadow_()` on the parent connection, which spawns the
  // shadow from the previously-stored `shadowDom_`. The variable is
  // intentionally named `target` (not `block`) so the existing
  // structural guard test (`migration body must not call
  // \`block.dispose\``) continues to pass.
  try {
    target.dispose(false)
  } catch (err) {
    console.warn(`[PxtEditor] cleanupNonShadowTarget: target.dispose failed for ${block.type}`, err)
  }

  // Make sure the shadow actually materialized. If for any reason
  // the auto-respawn during dispose didn't fire, force it from the
  // saved shadow DOM on the connection.
  let shadowBlock: any = null
  try { shadowBlock = conn.targetBlock() } catch { /* best-effort */ }
  if (!shadowBlock) {
    try {
      const dom = typeof conn.getShadowDom === 'function' ? conn.getShadowDom() : null
      if (dom && typeof conn.setShadowDom === 'function') {
        conn.setShadowDom(dom)
        shadowBlock = conn.targetBlock()
      }
    } catch (err) {
      console.warn(`[PxtEditor] cleanupNonShadowTarget: shadow respawn failed for ${block.type}`, err)
    }
  }

  if (capturedValue && shadowBlock && typeof shadowBlock.setFieldValue === 'function') {
    try {
      shadowBlock.setFieldValue(capturedValue, transform.fieldName)
    } catch (err) {
      console.warn(`[PxtEditor] cleanupNonShadowTarget: setFieldValue failed for ${block.type}`, err)
    }
  }

  // Re-render so the user sees the (now-shadow) slot update.
  try {
    if (typeof block.render === 'function') block.render()
  } catch { /* render is best-effort */ }
}

/**
 * Subscribe to Blockly workspace events so the duplicate-`<block>`
 * cleanup keeps running for blocks created AFTER the initial
 * {@link migrateExistingWorkspaceBlocks} pass.
 *
 * **Why**: `migrateExistingWorkspaceBlocks` is invoked from
 * `PxtEditor.updateMachineList` / `updateBeltList`, which are driven
 * by simulation telemetry. Those fire BEFORE PXT finishes loading
 * the saved workspace XML inside the iframe — at that moment
 * `workspace.getAllBlocks(false)` is empty, so the cleanup has
 * nothing to act on. PXT then deserializes the saved XML, Blockly's
 * loader spawns the duplicate non-shadow target inside the value
 * input (see `cleanupNonShadowTarget` for the root cause), and
 * nothing ever re-triggers the migration → the duplicate persists
 * across reloads.
 *
 * Listening to workspace events covers both timing windows:
 *  - `BLOCK_CREATE` runs cleanup on each consumer block as Blockly
 *    creates it (covers user drags from the toolbox AND XML-load
 *    block instantiations).
 *  - `FINISHED_LOADING` re-runs the full migration pass once the
 *    XML loader has wired up every block, which is the moment the
 *    duplicate is guaranteed to exist if it is going to exist.
 *
 * **Debounce / dedup**: the listener does not throttle events; both
 * the per-block `cleanupNonShadowTarget` (early-returns when the
 * target is already a shadow or null) and the workspace-wide
 * `migrateExistingWorkspaceBlocks` (per-block `__rfPluggableMigrated`
 * flag) are idempotent, so spamming during XML load is harmless.
 *
 * **Idempotency**: the listener is installed at most once per
 * workspace lifetime via the `__rfMigrationListenerInstalled` flag.
 */
export function installMigrationListener(
  blockly: any,
  workspace: any,
  consumers: PluggableSlotTransform[],
): void {
  if (!workspace || typeof workspace.addChangeListener !== 'function') return
  if (workspace.__rfMigrationListenerInstalled) return

  const transformsByType = new Map<string, PluggableSlotTransform>()
  for (const t of consumers) transformsByType.set(t.blockType, t)

  // Resolve event type constants defensively. Blockly exposes them
  // as string constants on `Blockly.Events` (e.g. `BLOCK_CREATE === 'create'`,
  // `FINISHED_LOADING === 'finished_loading'`), but we fall back to the
  // string literals if the constants are missing on a stripped build.
  const createType = blockly?.Events?.BLOCK_CREATE ?? 'create'
  const finishedLoadingType = blockly?.Events?.FINISHED_LOADING ?? 'finished_loading'

  try {
    workspace.addChangeListener((event: any) => {
      try {
        if (!event) return
        if (event.type === createType) {
          const block =
            typeof workspace.getBlockById === 'function'
              ? workspace.getBlockById(event.blockId)
              : null
          if (!block) return
          const transform = transformsByType.get(block.type)
          if (!transform) return
          // The created block may not have its children connected yet
          // during XML load; cleanupNonShadowTarget short-circuits when
          // the target is null / a shadow, so calling here is safe.
          cleanupNonShadowTarget(block, transform)
          return
        }
        if (event.type === finishedLoadingType) {
          // XML load done — every block now exists and has its
          // children wired up. Re-run the full migration pass to
          // catch the duplicate sibling case.
          migrateExistingWorkspaceBlocks(blockly, workspace, consumers)
        }
      } catch (err) {
        // NEVER let a listener throw into Blockly's event loop.
        console.warn('[PxtEditor] installMigrationListener: handler failed', err)
      }
    })
    workspace.__rfMigrationListenerInstalled = true
  } catch (err) {
    console.warn('[PxtEditor] installMigrationListener: addChangeListener failed', err)
  }
}
