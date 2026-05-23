/**
 * @vitest-environment jsdom
 *
 * RED tests for the not-yet-implemented `PxtEditor.compileBlocksToTsAsync`
 * deterministic compile/echo API. All seven cases below must FAIL until the
 * method exists and behaves per the task contract:
 *
 *   compileBlocksToTsAsync(options?: {
 *     blocksMustContain?: string[]
 *     timeoutMs?: number
 *   }): Promise<string>
 *
 * Mechanism (per the GREEN-step spec): register a transient workspacesave
 * listener, post `saveproject` with a unique id, resolve with `main.ts` only
 * when an echoed workspacesave's `main.blocks` contains EVERY substring in
 * `blocksMustContain` AND `main.ts` is a non-empty string; re-post on each
 * id-keyed pxteditor ack that arrives without satisfying the predicate;
 * reject on `timeoutMs` (default 5000); reject immediately if `!pxtReady`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PxtEditor } from '../../../src/editor/PxtEditor'

function dispatchPxtMessage(data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data }))
}

function findSaveProjectCalls(spy: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((args: unknown[]) => args[0] as Record<string, unknown> | null)
    .filter((msg): msg is Record<string, unknown> => {
      return !!msg && msg.type === 'pxteditor' && msg.action === 'saveproject'
    })
}

function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now()
    const tick = (): void => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'))
      setTimeout(tick, 5)
    }
    tick()
  })
}

interface MaybeCompileable {
  compileBlocksToTsAsync?: (options?: { blocksMustContain?: string[]; tsMustContain?: string[]; timeoutMs?: number }) => Promise<string>
}

describe('PxtEditor.compileBlocksToTsAsync (deterministic compile/echo)', () => {
  let editor: PxtEditor
  let container: HTMLDivElement
  let postSpy: ReturnType<typeof vi.fn>

  function bringEditorToReady(): void {
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const doc = iframe.contentWindow!.document
    doc.open()
    doc.write('<!doctype html><html><head></head><body></body></html>')
    doc.close()

    dispatchPxtMessage({ type: 'pxthost', action: 'workspacesync', id: 'sync-1' })

    postSpy = vi.fn()
    ;(iframe.contentWindow as unknown as { postMessage: unknown }).postMessage = postSpy
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    editor = new PxtEditor()
    editor.mount(container)
    postSpy = vi.fn()
  })

  afterEach(() => {
    editor.dispose()
    if (container.parentNode) container.parentNode.removeChild(container)
    vi.restoreAllMocks()
  })

  it('rejects immediately when pxtReady=false', async () => {
    // Do NOT call bringEditorToReady — pxtReady stays false.
    const compileable = editor as unknown as MaybeCompileable
    expect(typeof compileable.compileBlocksToTsAsync).toBe('function')

    await expect(
      compileable.compileBlocksToTsAsync!({ timeoutMs: 1000 }),
    ).rejects.toThrow(/not ready/i)
  })

  it('resolves with main.ts when a workspacesave echoes matching blocks', async () => {
    bringEditorToReady()
    const compileable = editor as unknown as MaybeCompileable
    expect(typeof compileable.compileBlocksToTsAsync).toBe('function')

    const expectedTs =
      'events.onItemArrives(machines.pickMachine(Machine.A), function () { })'

    const promise = compileable.compileBlocksToTsAsync!({
      blocksMustContain: ['factory_on_item_arrives'],
      timeoutMs: 2000,
    })

    // The implementation must post a `saveproject` request with a string id.
    await waitFor(() => findSaveProjectCalls(postSpy).length >= 1)
    const saveCalls = findSaveProjectCalls(postSpy)
    expect(saveCalls.length).toBeGreaterThanOrEqual(1)
    expect(saveCalls[0]?.response).toBe(true)
    expect(typeof saveCalls[0]?.id).toBe('string')

    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks':
            '<xml xmlns="https://developers.google.com/blockly/xml">' +
            '<block type="factory_on_item_arrives"/></xml>',
          'main.ts': expectedTs,
        },
      },
    })

    await expect(promise).resolves.toBe(expectedTs)
  })

  it('ignores workspacesave whose blocks lack required substring', async () => {
    bringEditorToReady()
    const compileable = editor as unknown as MaybeCompileable
    const promise = compileable.compileBlocksToTsAsync!({
      blocksMustContain: ['factory_on_item_arrives'],
      timeoutMs: 2000,
    })

    await waitFor(() => findSaveProjectCalls(postSpy).length >= 1)

    // First echo lacks the marker — must be ignored.
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks': '<xml><block type="pxt-on-start"/></xml>',
          'main.ts': 'function () { }',
        },
      },
    })

    // Sentinel race: settle either ms; the promise must NOT resolve.
    let settled: 'resolved' | 'rejected' | null = null
    promise.then(
      () => { settled = 'resolved' },
      () => { settled = 'rejected' },
    )
    await new Promise((r) => setTimeout(r, 80))
    expect(settled).toBeNull()

    // Second echo carries the marker — must resolve.
    const winningTs = 'events.onItemArrives(/* matched */)'
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks':
            '<xml><block type="factory_on_item_arrives"/></xml>',
          'main.ts': winningTs,
        },
      },
    })

    await expect(promise).resolves.toBe(winningTs)
  })

  it('ignores workspacesave with empty main.ts even when blocks match', async () => {
    bringEditorToReady()
    const compileable = editor as unknown as MaybeCompileable
    const promise = compileable.compileBlocksToTsAsync!({
      blocksMustContain: ['factory_on_item_arrives'],
      timeoutMs: 2000,
    })

    await waitFor(() => findSaveProjectCalls(postSpy).length >= 1)

    // Empty main.ts — must be ignored.
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks': '<xml><block type="factory_on_item_arrives"/></xml>',
          'main.ts': '',
        },
      },
    })

    // Whitespace-only main.ts — must also be ignored.
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks': '<xml><block type="factory_on_item_arrives"/></xml>',
          'main.ts': '\n',
        },
      },
    })

    // Missing main.ts entirely — must also be ignored.
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks': '<xml><block type="factory_on_item_arrives"/></xml>',
        },
      },
    })

    let settled: 'resolved' | 'rejected' | null = null
    promise.then(
      () => { settled = 'resolved' },
      () => { settled = 'rejected' },
    )
    await new Promise((r) => setTimeout(r, 80))
    expect(settled).toBeNull()

    const winningTs = 'events.onItemArrives(/* non-empty */)'
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks': '<xml><block type="factory_on_item_arrives"/></xml>',
          'main.ts': winningTs,
        },
      },
    })

    await expect(promise).resolves.toBe(winningTs)
  })

  it('re-posts saveproject on each id-keyed acknowledgement', async () => {
    bringEditorToReady()
    const compileable = editor as unknown as MaybeCompileable
    const promise = compileable.compileBlocksToTsAsync!({
      blocksMustContain: ['factory_on_item_arrives'],
      timeoutMs: 2000,
    })

    // Catch the absence of resolution after re-posts in the trailing assertion;
    // suppress UnhandledRejection noise here.
    promise.catch(() => { /* noop — resolution not under test for this case */ })

    await waitFor(() => findSaveProjectCalls(postSpy).length >= 1)
    const firstCalls = findSaveProjectCalls(postSpy)
    const firstId = firstCalls[0]?.id as string
    expect(typeof firstId).toBe('string')
    const beforeAckCount = firstCalls.length

    // Dispatch the id-keyed ack — the nudge loop must re-post `saveproject`.
    dispatchPxtMessage({
      type: 'pxteditor',
      id: firstId,
      success: true,
    })

    await waitFor(() => findSaveProjectCalls(postSpy).length > beforeAckCount, 400)
    const afterCalls = findSaveProjectCalls(postSpy)
    expect(afterCalls.length).toBeGreaterThan(beforeAckCount)
    // Re-post should use a fresh id.
    expect(afterCalls[afterCalls.length - 1]?.id).not.toBe(firstId)
  })

  it('rejects on timeout with a message mentioning the timeout', async () => {
    bringEditorToReady()
    const compileable = editor as unknown as MaybeCompileable
    const promise = compileable.compileBlocksToTsAsync!({
      blocksMustContain: ['factory_on_item_arrives'],
      timeoutMs: 100,
    })

    // Provide a non-satisfying echo so "last seen" state exists, but never
    // dispatch a satisfying one — the promise must reject on the deadline.
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks': '<xml/>',
          'main.ts': '',
        },
      },
    })

    await expect(promise).rejects.toThrow(/tim(ed )?out/i)
  })

  it('accepts any non-empty main.ts when blocksMustContain is omitted', async () => {
    bringEditorToReady()
    const compileable = editor as unknown as MaybeCompileable
    const promise = compileable.compileBlocksToTsAsync!({ timeoutMs: 1000 })

    await waitFor(() => findSaveProjectCalls(postSpy).length >= 1)

    const anyTs = '// anything non-empty\nfactory.noop()'
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks': '<xml><block type="anything"/></xml>',
          'main.ts': anyTs,
        },
      },
    })

    await expect(promise).resolves.toBe(anyTs)
  })

  it('ignores workspacesave whose main.ts lacks every tsMustContain substring', async () => {
    bringEditorToReady()
    const compileable = editor as unknown as MaybeCompileable
    const promise = compileable.compileBlocksToTsAsync!({
      blocksMustContain: ['factory_on_item_arrives'],
      tsMustContain: ['events.onItemArrives(machines.pickMachine(Machine.A)'],
      timeoutMs: 2000,
    })

    await waitFor(() => findSaveProjectCalls(postSpy).length >= 1)

    // Non-empty ts, blocks marker present, but ts lacks required substring.
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks': '<xml><block type="factory_on_item_arrives"/></xml>',
          'main.ts': 'events.onItemArrives(null, function () { })',
        },
      },
    })

    let settled: 'resolved' | 'rejected' | null = null
    promise.then(
      () => { settled = 'resolved' },
      () => { settled = 'rejected' },
    )
    await new Promise((r) => setTimeout(r, 80))
    expect(settled).toBeNull()

    const winningTs = 'events.onItemArrives(machines.pickMachine(Machine.A), function () { })'
    dispatchPxtMessage({
      type: 'pxthost',
      action: 'workspacesave',
      project: {
        text: {
          'main.blocks': '<xml><block type="factory_on_item_arrives"/></xml>',
          'main.ts': winningTs,
        },
      },
    })

    await expect(promise).resolves.toBe(winningTs)
  })
})

describe('performCompileBlocksToTs Blockly nudge', () => {
  it('fires a real BlockMove (moveBy +1/-1) on the first non-shadow top block before each saveproject post', async () => {
    const { performCompileBlocksToTs } = await import('../../../src/editor/PxtEditorCompileBlocks')

    const moveBy = vi.fn()
    const isShadow = vi.fn(() => false)
    const block = { moveBy, isShadow }
    const getTopBlocks = vi.fn(() => [block])
    const workspace = { getTopBlocks }

    const listeners = new Set<(blocks: string | undefined, ts: string | undefined) => void>()
    const pending = new Map<string, () => void>()
    const postToEditor = vi.fn()
    let nextId = 0

    const winningTs = 'events.onItemArrives(machines.pickMachine(Machine.A), function () { })'
    const promise = performCompileBlocksToTs(
      {
        pxtReady: true,
        workspaceSaveListeners: listeners,
        pendingResponses: pending,
        allocateId: () => `nudge-${nextId++}`,
        postToEditor: (msg) => postToEditor(msg),
        getBlockly: () => ({}),
        getBlocklyWorkspace: () => workspace,
      },
      {
        blocksMustContain: ['factory_on_item_arrives'],
        tsMustContain: ['events.onItemArrives(machines.pickMachine(Machine.A)'],
        timeoutMs: 2000,
      },
    )

    // The nudge must have fired before/at the first saveproject post.
    expect(getTopBlocks).toHaveBeenCalledWith(false)
    expect(moveBy).toHaveBeenNthCalledWith(1, 1, 0)
    expect(moveBy).toHaveBeenNthCalledWith(2, -1, 0)

    // Satisfy the predicate so the promise resolves cleanly.
    for (const listener of Array.from(listeners)) {
      listener(
        '<xml><block type="factory_on_item_arrives"/></xml>',
        winningTs,
      )
    }
    await expect(promise).resolves.toBe(winningTs)
  })

  it('skips the nudge when the workspace has no top blocks', async () => {
    const { performCompileBlocksToTs } = await import('../../../src/editor/PxtEditorCompileBlocks')

    const getTopBlocks = vi.fn(() => [])
    const workspace = { getTopBlocks }

    const listeners = new Set<(blocks: string | undefined, ts: string | undefined) => void>()
    const pending = new Map<string, () => void>()
    let nextId = 0

    const promise = performCompileBlocksToTs(
      {
        pxtReady: true,
        workspaceSaveListeners: listeners,
        pendingResponses: pending,
        allocateId: () => `nudge-empty-${nextId++}`,
        postToEditor: () => { /* noop */ },
        getBlocklyWorkspace: () => workspace,
      },
      { timeoutMs: 500 },
    )

    expect(getTopBlocks).toHaveBeenCalledWith(false)

    for (const listener of Array.from(listeners)) {
      listener('<xml/>', '// non-empty')
    }
    await expect(promise).resolves.toBe('// non-empty')
  })

  it('skips shadow blocks when picking the nudge target', async () => {
    const { performCompileBlocksToTs } = await import('../../../src/editor/PxtEditorCompileBlocks')

    const shadowMove = vi.fn()
    const realMove = vi.fn()
    const shadow = { moveBy: shadowMove, isShadow: () => true }
    const real = { moveBy: realMove, isShadow: () => false }
    const workspace = { getTopBlocks: vi.fn(() => [shadow, real]) }

    const listeners = new Set<(blocks: string | undefined, ts: string | undefined) => void>()
    const pending = new Map<string, () => void>()
    let nextId = 0

    const promise = performCompileBlocksToTs(
      {
        pxtReady: true,
        workspaceSaveListeners: listeners,
        pendingResponses: pending,
        allocateId: () => `nudge-shadow-${nextId++}`,
        postToEditor: () => { /* noop */ },
        getBlocklyWorkspace: () => workspace,
      },
      { timeoutMs: 500 },
    )

    expect(shadowMove).not.toHaveBeenCalled()
    expect(realMove).toHaveBeenNthCalledWith(1, 1, 0)
    expect(realMove).toHaveBeenNthCalledWith(2, -1, 0)

    for (const listener of Array.from(listeners)) {
      listener('<xml/>', '// ok')
    }
    await expect(promise).resolves.toBe('// ok')
  })
})
