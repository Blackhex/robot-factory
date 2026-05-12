/**
 * Runtime patch that strips the previous/next notches from
 * `factory_on_machine_idle` so it renders as a true hat block.
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
 *     workspace and strip any restored `factory_on_machine_idle`
 *     blocks. Blockly auto-detaches them from their parent's `<next>`,
 *     leaving them as top-level orphans — which is what PXT compiles
 *     into a top-level `events.onMachineIdle(...)` call.
 */

const HAT_BLOCK_TYPE = 'factory_on_machine_idle'

function stripBlockShape(block: any): void {
  if (!block || block.__rfHatApplied) return
  try {
    if (block.previousConnection) block.setPreviousStatement(false)
    if (block.nextConnection) block.setNextStatement(false)
    if (typeof block.setStartHat === 'function') block.setStartHat(true)
    block.__rfHatApplied = true
  } catch (err) {
    console.warn(`[PxtEditor] hat-shape strip(${block?.id}) failed`, err)
  }
}

function walkAndStrip(workspace: any): void {
  if (!workspace || typeof workspace.getAllBlocks !== 'function') return
  try {
    const all: any[] = workspace.getAllBlocks(false) ?? []
    for (const b of all) if (b.type === HAT_BLOCK_TYPE) stripBlockShape(b)
    const flyoutWs = workspace.getFlyout?.()?.getWorkspace?.()
    const flyoutAll: any[] = flyoutWs?.getAllBlocks?.(false) ?? []
    for (const b of flyoutAll) if (b.type === HAT_BLOCK_TYPE) stripBlockShape(b)
  } catch (err) {
    console.warn('[PxtEditor] hat-shape workspace walk failed', err)
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
      if (type === HAT_BLOCK_TYPE && blockly.Events?.isEnabled?.() !== false) {
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
        if (ws) walkAndStrip(ws)
      }
      return result
    }
  }
  wrap('domToWorkspace', 1)
  wrap('appendDomToWorkspace', 1)
  wrap('domToBlock', 1)
}

export function applyOnMachineIdleHatShape(blockly: any, workspace: any): void {
  if (!blockly) return
  patchWorkspaceProto(blockly)
  patchXmlLoad(blockly)
  walkAndStrip(workspace)
}
