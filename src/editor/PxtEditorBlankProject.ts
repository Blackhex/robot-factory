/**
 * Blank-project loader extracted from PxtEditor to keep PxtEditor.ts within
 * its line budget. See `PxtEditor.loadBlankProjectAsync` for the contract.
 */

export const BLANK_PROJECT_BLOCKS_XML =
  '<xml xmlns="https://developers.google.com/blockly/xml"><block type="pxt-on-start" x="0" y="0"></block></xml>'

export interface BlankProjectDeps {
  pxtReady: boolean
  fallbackEditor: { setValue(value: string): void } | null
  lastPxtSource: string
  lastPxtBlocks: string
  pendingDirectLoad: unknown
  pendingWorkspaceLoad: { ts: string; blocks: string | undefined } | null
  pendingPostReadyDirectInject: string | null
  loadBlocksWithRegistrationReady(blocksXml: string): Promise<boolean>
  loadBlocksDirectly(blocksXml: string): boolean
  postImportProject(blocksXml: string, ts: string): void
  readLiveBlocksXml(): string
  extractBlockTypes(blocksXml: string): string[]
}

/**
 * Replace the workspace with a blank "on start" program; resolve only once
 * the live Blockly workspace contains exactly that one block. Sends both
 * `main.ts: ''` AND `main.blocks: BLANK` so PXT's stored TS cannot decompile
 * back into the user's prior blocks (the failure mode `loadWorkspaceXml`
 * with bare blocks XML exhibits, since that path treats the input as legacy
 * TS). Polls + re-injects to win against PXT's decompile-echo cycle.
 */
export async function performBlankProjectLoad(
  deps: BlankProjectDeps,
  timeoutMs: number,
): Promise<void> {
  const blank = BLANK_PROJECT_BLOCKS_XML
  deps.fallbackEditor?.setValue('')
  deps.lastPxtSource = ''
  deps.lastPxtBlocks = blank
  deps.pendingDirectLoad = null
  if (!deps.pxtReady) {
    deps.pendingWorkspaceLoad = { ts: '', blocks: blank }
    deps.pendingPostReadyDirectInject = blank
    return
  }
  await deps.loadBlocksWithRegistrationReady(blank)
  deps.postImportProject(blank, '')

  const start = Date.now()
  const STABLE_TICKS = 3
  const POLL_MS = 50
  let stable = 0
  while (Date.now() - start < timeoutMs) {
    const types = deps.extractBlockTypes(deps.readLiveBlocksXml())
    if (types.length === 1 && types[0] === 'pxt-on-start') {
      if (++stable >= STABLE_TICKS) return
    } else {
      stable = 0
      deps.loadBlocksDirectly(blank)
    }
    await new Promise<void>((r) => setTimeout(r, POLL_MS))
  }
}
