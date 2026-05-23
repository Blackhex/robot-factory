/**
 * compileBlocksToTsAsync extracted from PxtEditor to keep PxtEditor.ts
 * within its line budget. See `PxtEditor.compileBlocksToTsAsync` for the
 * contract.
 */

export interface CompileBlocksDeps {
  readonly pxtReady: boolean
  readonly workspaceSaveListeners: Set<(blocks: string | undefined, ts: string | undefined) => void>
  readonly pendingResponses: Map<string, () => void>
  allocateId(): string
  postToEditor(msg: Record<string, unknown>): void
  /** Optional: Blockly global from the PXT iframe (used for type access). */
  getBlockly?(): any
  /** Optional: main Blockly workspace from the PXT iframe. Used to fire a real BlockMove event
   *  that invalidates PXT's TS cache so the next saveproject re-decompiles from blocks. */
  getBlocklyWorkspace?(): any
}

export function performCompileBlocksToTs(
  deps: CompileBlocksDeps,
  options?: { blocksMustContain?: string[]; tsMustContain?: string[]; timeoutMs?: number },
): Promise<string> {
  if (!deps.pxtReady) {
    return Promise.reject(new Error('PxtEditor.compileBlocksToTsAsync: PXT iframe not ready'))
  }
  const blocksMustContain = options?.blocksMustContain ?? []
  const tsMustContain = options?.tsMustContain ?? []
  const timeoutMs = options?.timeoutMs ?? 15000

  return new Promise<string>((resolve, reject) => {
    const ownedIds = new Set<string>()
    let lastBlocks: string | undefined
    let lastTs: string | undefined
    let settled = false
    let lastPostAt = 0
    let scheduledPostTimer: ReturnType<typeof setTimeout> | null = null
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = (): void => {
      deps.workspaceSaveListeners.delete(listener)
      for (const id of ownedIds) deps.pendingResponses.delete(id)
      ownedIds.clear()
      if (deadlineTimer) { clearTimeout(deadlineTimer); deadlineTimer = null }
      if (scheduledPostTimer) { clearTimeout(scheduledPostTimer); scheduledPostTimer = null }
    }

    const listener = (blocks: string | undefined, ts: string | undefined): void => {
      if (settled) return
      lastBlocks = blocks
      lastTs = ts
      if (typeof ts !== 'string' || ts.trim().length === 0) return
      if (blocksMustContain.length > 0) {
        if (typeof blocks !== 'string' || blocks.length === 0) return
        for (const needle of blocksMustContain) {
          if (!blocks.includes(needle)) return
        }
      }
      for (const needle of tsMustContain) {
        if (!ts.includes(needle)) return
      }
      settled = true
      cleanup()
      resolve(ts)
    }
    deps.workspaceSaveListeners.add(listener)

    const postSave = (): void => {
      if (settled) return
      lastPostAt = Date.now()
      try {
        const ws = deps.getBlocklyWorkspace?.()
        const tops: any[] = ws?.getTopBlocks?.(false) ?? []
        const target = tops.find((b) => (typeof b?.isShadow === 'function' ? !b.isShadow() : true))
        if (target && typeof target.moveBy === 'function') {
          target.moveBy(1, 0)
          target.moveBy(-1, 0)
        }
      } catch { /* best-effort — real BlockMove tells PXT to re-decompile from blocks */ }
      const id = deps.allocateId()
      ownedIds.add(id)
      deps.pendingResponses.set(id, () => onAck(id))
      deps.postToEditor({ type: 'pxteditor', action: 'saveproject', id, response: true })
    }

    const onAck = (id: string): void => {
      deps.pendingResponses.delete(id)
      ownedIds.delete(id)
      if (settled || scheduledPostTimer) return
      const wait = Math.max(0, 300 - (Date.now() - lastPostAt))
      scheduledPostTimer = setTimeout(() => {
        scheduledPostTimer = null
        if (!settled) postSave()
      }, wait)
    }

    deadlineTimer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      const missing = tsMustContain.filter((needle) => typeof lastTs !== 'string' || !lastTs.includes(needle))
      const missingPart = missing.length > 0 ? `, missingTsSubstrings=${JSON.stringify(missing)}` : ''
      reject(new Error(`PxtEditor.compileBlocksToTsAsync: timed out after ${timeoutMs}ms (lastBlocks=${lastBlocks?.length ?? 0} chars, lastTs=${lastTs?.length ?? 0} chars${missingPart})`))
    }, timeoutMs)

    postSave()
  })
}
