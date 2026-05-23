/**
 * Runtime patch that strips the previous/next notches from
 * `factory_on_machine_idle` and `factory_on_item_arrives` so they
 * render as true hat blocks.
 *
 * **Why a runtime patch (not a `//%` directive change)**: PXT's block
 * init code unconditionally calls `setPreviousStatement(true)` /
 * `setNextStatement(true)` on any void-returning event block whose
 * source declares `//% handlerStatement=1`. The directive is required
 * for PXT decompile (TS → blocks) to preserve the HANDLER body across
 * save/reload — without it PXT silently drops the inner statements.
 * Hat shape + decompile-safe HANDLER body are mutually exclusive at
 * the directive level, so the only way to satisfy both is to override
 * the connections after the block has been wired.
 *
 * Two interception points:
 *  1. `Workspace.prototype.newBlock`: when called outside an XML load
 *     (detected via `Blockly.Events.isEnabled()`), strip connections
 *     immediately so direct callers (tests, toolbox drag) read back a
 *     hat block synchronously.
 *  2. `Xml.domToWorkspace` / `appendDomToWorkspace` / `domToBlock`:
 *     after the load finishes (parent attachments complete), walk the
 *     workspace and strip any restored hat block (any type listed in
 *     `HAT_BLOCK_TYPES`). Blockly auto-detaches them from their
 *     parent's `<next>`, leaving them as top-level orphans — which is
 *     what PXT compiles into a top-level `events.onMachineIdle(...)`
 *     call.
 */

const HAT_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'factory_on_machine_idle',
  'factory_on_item_arrives',
])

function stripBlockShape(block: any): void {
  if (!block) return
  try {
    if (!block.__rfHatApplied) {
      if (block.previousConnection) block.setPreviousStatement(false)
      if (block.nextConnection) block.setNextStatement(false)
      if (typeof block.setStartHat === 'function') block.setStartHat(true)
      block.__rfHatApplied = true
    }
    // Heal a stale `disabled="true"` flag carried in saved project XML
    // (originally written by an earlier orphan-disable race against
    // setStartHat). A top-level hat block has no parent and no previous
    // connection, so it is always a valid handler root and must render
    // enabled — and the same applies to its entire handler subtree
    // (input children + shadow defaults), because Blockly's renderer
    // paints `blocklyDisabled` on any descendant whose own `disabled`
    // flag is true, even when the hat is enabled.
    const parent = typeof block.getParent === 'function' ? block.getParent() : null
    if (!parent) {
      const subtree: any[] = typeof block.getDescendants === 'function'
        ? [block, ...block.getDescendants(false).filter((d: any) => d !== block)]
        : [block]
      for (const node of subtree) healEnabled(node)
    }
  } catch (err) {
    console.warn(`[PxtEditor] hat-shape strip(${block?.id}) failed`, err)
  }
}

function healEnabled(block: any): void {
  if (!block) return
  // Short-circuit when state is already correct, so the BLOCK_CHANGE
  // event our own heal would have fired is never emitted — this is
  // what prevents the BLOCK_CHANGE listener from looping back into a
  // recursive heal on the same block.
  const alreadyEnabled = typeof block.isEnabled === 'function' ? !!block.isEnabled() : true
  const flagAlreadyOk = !('disabled' in block) || block.disabled === false
  if (alreadyEnabled && flagAlreadyOk) return
  // Force-set both the data flag and the rendered visual. PXT's
  // setEnabled override is a no-op when the state already matches, so
  // calling updateDisabled / applyColour unconditionally ensures the
  // SVG's `blocklyDisabled` class and `url(#blocklyDisabledPattern…)`
  // fill are cleared even if a prior listener or render pass left
  // them stuck.
  if (typeof block.setEnabled === 'function' && !alreadyEnabled) {
    block.setEnabled(true)
  }
  if ('disabled' in block) block.disabled = false
  if (typeof block.updateDisabled === 'function') block.updateDisabled()
  else if (typeof block.applyColour === 'function') block.applyColour()
}

function walkAndStrip(workspace: any): void {
  if (!workspace || typeof workspace.getAllBlocks !== 'function') return
  try {
    const all: any[] = workspace.getAllBlocks(false) ?? []
    for (const b of all) if (HAT_BLOCK_TYPES.has(b.type)) stripBlockShape(b)
    const flyoutWs = workspace.getFlyout?.()?.getWorkspace?.()
    const flyoutAll: any[] = flyoutWs?.getAllBlocks?.(false) ?? []
    for (const b of flyoutAll) if (HAT_BLOCK_TYPES.has(b.type)) stripBlockShape(b)
  } catch (err) {
    console.warn('[PxtEditor] hat-shape workspace walk failed', err)
  }
}

/**
 * Run a second pass after the Blockly event queue has flushed. Loading
 * XML schedules a pending `Blockly.Events.fireNow_` via setTimeout(0)
 * that delivers the buffered CREATE/MOVE events to listeners like
 * `disableOrphans`. A re-run after the flush guarantees our heal wins
 * even if those listeners (or any deferred render) re-touch the hat
 * block's enabled state.
 */
function walkAndStripWithFlush(workspace: any): void {
  walkAndStrip(workspace)
  if (typeof setTimeout === 'function') {
    setTimeout(() => walkAndStrip(workspace), 0)
  }
}

function patchWorkspaceProto(blockly: any): void {
  const protos = [blockly?.WorkspaceSvg?.prototype, blockly?.Workspace?.prototype]
  for (const proto of protos) {
    if (!proto || proto.__rfHatNewBlockPatched || typeof proto.newBlock !== 'function') continue
    const origNewBlock = proto.newBlock
    proto.newBlock = function(this: any, type: string, opt_id?: string) {
      const block = origNewBlock.call(this, type, opt_id)
      // Skip when inside an XML load (Blockly disables events around
      // domToBlock/domToWorkspace) — the loader needs the connections
      // to attach the block to its saved parent. The post-load walk
      // strips them after attachment completes.
      if (HAT_BLOCK_TYPES.has(type) && blockly.Events?.isEnabled?.() !== false) {
        stripBlockShape(block)
      }
      return block
    }
    proto.__rfHatNewBlockPatched = true
  }
}

function patchXmlLoad(blockly: any): void {
  const xml = blockly?.Xml
  if (!xml || xml.__rfHatXmlPatched) return
  xml.__rfHatXmlPatched = true
  const wrap = (name: string, wsArgIndex: number): void => {
    const orig = xml[name]
    if (typeof orig !== 'function') return
    xml[name] = function(this: any, ...args: any[]) {
      let result: any
      try {
        result = orig.apply(this, args)
      } finally {
        const arg = args[wsArgIndex]
        const ws = arg && typeof arg.getAllBlocks === 'function'
          ? arg
          : (result && typeof result.workspace === 'object' ? result.workspace : null)
        if (ws) walkAndStripWithFlush(ws)
      }
      return result
    }
  }
  wrap('domToWorkspace', 1)
  wrap('appendDomToWorkspace', 1)
  wrap('domToBlock', 1)
}

function attachWorkspaceListener(blockly: any, workspace: any): void {
  if (!workspace || workspace.__rfHatListenerAttached) return
  if (typeof workspace.addChangeListener !== 'function') return
  const eventTypes = blockly?.Events
  if (!eventTypes) return
  workspace.addChangeListener((event: any) => {
    if (!event) return
    // Re-heal after CREATE / MOVE / FINISHED_LOADING events (the moments
    // when `disableOrphans` runs or a bulk XML load finishes) and after
    // any BLOCK_CHANGE event whose `element === 'disabled'` (which is
    // how Blockly + PXT's decompile/sync flows propagate a disable flag
    // back into our hat block after the initial heal). Healing on each
    // of these guarantees a final-state heal once the event queue has
    // flushed, and listener order does not matter — even if a later
    // listener (or recompile cycle) re-disables our block, the next
    // BLOCK_CHANGE event reaches us and we heal again. Our own heal
    // calls `setEnabled(true)` which fires a BLOCK_CHANGE with
    // `newValue === false` (the new disabled flag); we re-heal on it,
    // observe `block.isEnabled() === true` already, and skip without
    // firing another event — so no recursion.
    const t = event.type
    const isRelevant =
      t === eventTypes.CREATE
      || t === eventTypes.BLOCK_CREATE
      || t === eventTypes.MOVE
      || t === eventTypes.BLOCK_MOVE
      || t === eventTypes.FINISHED_LOADING
      || ((t === eventTypes.CHANGE || t === eventTypes.BLOCK_CHANGE)
          && event.element === 'disabled')
    if (!isRelevant) return
    walkAndStrip(workspace)
  })
  workspace.__rfHatListenerAttached = true
}

/**
 * Build a `setEnabled` replacement that wraps `orig` with the hat-
 * ancestor guard. Exported via the trap so it can be re-applied
 * whenever PXT reassigns `Block.prototype.setEnabled`.
 */
function makeHatGuardedSetEnabled(orig: Function): (this: any, enabled: boolean) => any {
  return function(this: any, enabled: boolean) {
    // For hat blocks (event handler roots) we refuse the disable path:
    // a freshly-placed or freshly-loaded event hat is conceptually a
    // valid handler regardless of what `disableOrphans` or PXT's
    // decompile-sync diff thinks.
    if (HAT_BLOCK_TYPES.has(this?.type)) {
      return orig.call(this, true)
    }
    if (enabled === false) {
      // Walk ancestors so the disable cascade PXT runs across the
      // handler subtree cannot strip our event hat's children either.
      let node: any = this
      for (let i = 0; i < 64 && node; i++) {
        const getParent = typeof node.getParent === 'function'
          ? node.getParent
          : (typeof node.getSurroundParent === 'function' ? node.getSurroundParent : null)
        if (!getParent) break
        const parent = getParent.call(node)
        if (!parent) break
        if (HAT_BLOCK_TYPES.has(parent.type)) {
          return orig.call(this, true)
        }
        node = parent
      }
    }
    return orig.call(this, enabled)
  }
}

function patchBlockProtoSetEnabled(blockly: any): void {
  const proto = blockly?.Block?.prototype
  if (!proto || proto.__rfHatSetEnabledPatched || typeof proto.setEnabled !== 'function') return
  // Skip when the defineProperty trap is already in place — it already
  // wraps every assignment, so a second wrap would only double-call orig.
  if (proto.__rfHatSetEnabledTrapped) {
    proto.__rfHatSetEnabledPatched = true
    return
  }
  const orig = proto.setEnabled
  proto.setEnabled = makeHatGuardedSetEnabled(orig)
  proto.__rfHatSetEnabledPatched = true
}

/**
 * Install a self-healing `Object.defineProperty` trap on
 * `Blockly.Block.prototype.setEnabled`. PXT's vendored bundles include
 * an IIFE in `pxtblocks.js` that lazily reassigns this prototype method
 * after Blockly loads. Under parallel-worker CPU contention the install
 * order races against our wrap, and a direct assignment is silently
 * overwritten.
 *
 * The trap intercepts every subsequent `proto.setEnabled = …` and
 * re-wraps the new implementation, so PXT's reassignments are healed
 * automatically. Callers always read back the guarded function via the
 * getter regardless of install order.
 *
 * If Blockly is not yet defined on `iframeWindow` (common — this is
 * installed from the iframe `load` event, before PXT bootstraps), the
 * trap polls every 10 ms up to a 30 s deadline.
 */
export function installSetEnabledTrap(iframeWindow: Window | null | undefined): void {
  if (!iframeWindow) return
  const deadline = Date.now() + 30000
  const tryInstall = (): void => {
    const blockly = (iframeWindow as any).Blockly
    const proto = blockly?.Block?.prototype
    if (!proto) {
      if (Date.now() > deadline) {
        console.warn('[PxtEditor] installSetEnabledTrap: Blockly never appeared on iframe; giving up')
        return
      }
      setTimeout(tryInstall, 10)
      return
    }
    if (proto.__rfHatSetEnabledTrapped) return
    let currentImpl: Function = typeof proto.setEnabled === 'function'
      ? proto.setEnabled
      : function(this: any, v: boolean) { this.enabled = v }
    let wrapped: Function = makeHatGuardedSetEnabled(currentImpl)
    try {
      Object.defineProperty(proto, 'setEnabled', {
        configurable: true,
        enumerable: false,
        get(): Function { return wrapped },
        set(newImpl: Function): void {
          currentImpl = newImpl
          wrapped = makeHatGuardedSetEnabled(newImpl)
        },
      })
      proto.__rfHatSetEnabledTrapped = true
    } catch (err) {
      console.warn('[PxtEditor] installSetEnabledTrap: defineProperty failed', err)
    }
  }
  tryInstall()
}

export function applyHatBlockShape(blockly: any, workspace: any): void {
  if (!blockly) return
  patchBlockProtoSetEnabled(blockly)
  patchWorkspaceProto(blockly)
  patchXmlLoad(blockly)
  attachWorkspaceListener(blockly, workspace)
  walkAndStrip(workspace)
}
