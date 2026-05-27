import { applyHatBlockShape } from './hatBlockShape'
import type { PendingDirectLoad } from './PxtEditorDirectLoad'

export interface WorkspaceAccessDeps {
  getBlockly(): any
  getBlocklyWorkspace(): any
  getLastPxtBlocks(): string
}

export interface PendingDirectLoadDeps {
  getPendingDirectLoad(): PendingDirectLoad | null
  setPendingDirectLoad(value: PendingDirectLoad | null): void
  loadBlocksDirectly(blocksXml: string): boolean
}

function getXmlHelpers(blockly: any): { textToDom: ((xml: string) => any) | null; domToText: ((dom: any) => string) | null } {
  const xml = blockly?.Xml
  const textToDom = xml?.textToDom ?? blockly?.utils?.xml?.textToDom ?? null
  const domToText = xml?.domToText ?? blockly?.utils?.xml?.domToText ?? null
  return { textToDom, domToText }
}

export function extractBlockTypes(blocksXml: string): string[] {
  if (!blocksXml) return []
  const out = new Set<string>()
  const re = /<(?:block|shadow)\b[^>]*\btype="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(blocksXml)) !== null) {
    if (m[1]) out.add(m[1])
  }
  return [...out]
}

export function armPendingDirectLoad(
  blocksXml: string,
  now: number,
  deadlineMs: number,
  protectedTypes: readonly string[],
): PendingDirectLoad | null {
  if (!blocksXml || blocksXml.trim().length === 0) return null
  const blockTypes = extractBlockTypes(blocksXml)
  const expected = new Set(blockTypes)
  return {
    blocksXml,
    expectedBlockTypes: expected,
    deadlineAt: now + Math.max(0, deadlineMs),
    attempts: 0,
    protectPluggableConsumer: blockTypes.some((t) => protectedTypes.includes(t)),
  }
}

function echoContainsExpectedTypes(echoedBlocksXml: string | undefined, pending: PendingDirectLoad): boolean {
  if (typeof echoedBlocksXml !== 'string' || echoedBlocksXml.length === 0) return false
  if (pending.expectedBlockTypes.size === 0) return true
  const present = new Set(extractBlockTypes(echoedBlocksXml))
  for (const type of pending.expectedBlockTypes) {
    if (!present.has(type)) return false
  }
  return true
}

export function maybeReapplyPendingDirectLoad(
  deps: PendingDirectLoadDeps,
  echoedBlocksXml: string | undefined,
  now: number,
  maxAttempts: number,
): boolean {
  const pending = deps.getPendingDirectLoad()
  if (!pending) return true

  if (echoContainsExpectedTypes(echoedBlocksXml, pending)) {
    deps.setPendingDirectLoad(null)
    return true
  }

  if (now >= pending.deadlineAt) {
    deps.setPendingDirectLoad(null)
    return true
  }

  pending.attempts += 1
  deps.loadBlocksDirectly(pending.blocksXml)

  if (!pending.protectPluggableConsumer && pending.attempts >= maxAttempts) {
    deps.setPendingDirectLoad(null)
    return true
  }

  deps.setPendingDirectLoad(pending)
  return false
}

export function readLiveBlocksXml(deps: WorkspaceAccessDeps): string {
  const blockly = deps.getBlockly()
  const workspace = deps.getBlocklyWorkspace()
  if (!blockly || !workspace) return ''

  const workspaceToDom = blockly?.Xml?.workspaceToDom
  const { domToText } = getXmlHelpers(blockly)
  if (typeof workspaceToDom !== 'function' || typeof domToText !== 'function') return ''

  try {
    const dom = workspaceToDom(workspace, true)
    return typeof domToText(dom) === 'string' ? domToText(dom) : ''
  } catch {
    return ''
  }
}

export function loadBlocksDirectly(deps: WorkspaceAccessDeps, blocksXml: string): boolean {
  if (!blocksXml || blocksXml.trim().length === 0) return false

  const blockly = deps.getBlockly()
  const workspace = deps.getBlocklyWorkspace()
  if (!blockly || !workspace) return false

  const { textToDom } = getXmlHelpers(blockly)
  if (typeof textToDom !== 'function') return false

  try {
    const dom = textToDom(blocksXml)
    if (!dom) return false

    blockly.Xml?.clearWorkspaceAndLoadFromXml?.(dom, workspace)
    if (typeof blockly.Xml?.clearWorkspaceAndLoadFromXml !== 'function') {
      workspace.clear?.()
      if (typeof blockly.Xml?.domToWorkspace === 'function') {
        blockly.Xml.domToWorkspace(dom, workspace)
      } else if (typeof blockly.Xml?.appendDomToWorkspace === 'function') {
        blockly.Xml.appendDomToWorkspace(dom, workspace)
      } else {
        return false
      }
    }

    applyHatBlockShape(blockly, workspace)
    return true
  } catch {
    return false
  }
}

export async function loadBlocksWithRegistrationReady(
  deps: WorkspaceAccessDeps,
  blocksXml: string,
  timeoutMs = 5000,
): Promise<boolean> {
  if (!blocksXml || blocksXml.trim().length === 0) return false
  const expectedTypes = extractBlockTypes(blocksXml)
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const blockly = deps.getBlockly()
    const blocks = blockly?.Blocks
    if (blocks && expectedTypes.every((t) => typeof blocks[t] !== 'undefined')) {
      return loadBlocksDirectly(deps, blocksXml)
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
  }

  return false
}

export function postImportProject(
  postToEditor: (msg: Record<string, unknown>) => void,
  blocksXml: string,
  ts: string,
): void {
  const text: Record<string, string> = { 'main.ts': ts }
  if (blocksXml.trim().length > 0) text['main.blocks'] = blocksXml
  else if (ts.trim().length > 0) text['main.blocks'] = ts

  postToEditor({
    type: 'pxteditor',
    action: 'importproject',
    project: { text },
  })
}
