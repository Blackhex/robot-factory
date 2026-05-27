import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handlePxtMessage } from '../../../src/editor/PxtEditorMessageRouter'
import type { MessageRouterDeps } from '../../../src/editor/PxtEditorMessageRouter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<MessageRouterDeps> = {}): MessageRouterDeps {
  const defaultState = {
    iframe: null,
    pxtReady: false,
    currentLevel: 1,
    pendingWorkspaceLoad: null,
    pendingPostReadyDirectInject: null,
    pendingMachineUpdate: null,
    pendingBeltUpdate: null,
    lastPxtSource: '',
    lastPxtBlocks: '',
  }

  return {
    getData: vi.fn(() => defaultState),
    setPxtReady: vi.fn(),
    setPendingWorkspaceLoad: vi.fn(),
    setPendingPostReadyDirectInject: vi.fn(),
    setLastPxtSource: vi.fn(),
    setLastPxtBlocks: vi.fn(),
    postToEditor: vi.fn(),
    styleToolboxRows: vi.fn(),
    injectToolboxStyles: vi.fn(),
    fallbackSetValue: vi.fn(),
    fallbackHide: vi.fn(),
    loadWorkspaceXml: vi.fn(),
    loadBlocksWithRegistrationReady: vi.fn().mockResolvedValue(true),
    armPendingDirectLoad: vi.fn(),
    maybeReapplyPendingDirectLoad: vi.fn().mockReturnValue(true),
    updateMachineList: vi.fn(),
    updateBeltList: vi.fn(),
    notifyWorkspaceSave: vi.fn(),
    resolvePendingResponse: vi.fn(),
    applySplittersGate: vi.fn(),
    ...overrides,
  }
}

/** Wrap a plain object in a minimal MessageEvent-shaped value. */
function makeEvent(data: unknown): MessageEvent {
  return { data } as unknown as MessageEvent
}

// ---------------------------------------------------------------------------
// Bug 1 — workspacesync response must include a projects array
// ---------------------------------------------------------------------------

describe('Bug 1 — workspacesync response includes projects array', () => {
  it('posts workspacesync acknowledgement with a projects array containing header and text', () => {
    const deps = makeDeps()

    handlePxtMessage(deps, makeEvent({ type: 'pxthost', action: 'workspacesync', id: 'sync-1' }))

    const postToEditor = vi.mocked(deps.postToEditor)
    // Find the pxthost acknowledgement (the one with id matching the request)
    const syncAck = postToEditor.mock.calls
      .map(([msg]) => msg)
      .find(msg => msg['type'] === 'pxthost' && msg['id'] === 'sync-1' && msg['success'] === true)

    expect(syncAck).toBeDefined()
    // Must include a projects array
    expect(Array.isArray(syncAck!['projects'])).toBe(true)
    const projects = syncAck!['projects'] as unknown[]
    expect(projects.length).toBeGreaterThan(0)
    // Each project must have header and text
    const project = projects[0] as Record<string, unknown>
    expect(project).toHaveProperty('header')
    expect(project).toHaveProperty('text')
  })
})

// ---------------------------------------------------------------------------
// Bug 2 — switchblocks must be deferred in setTimeout, not synchronous
// ---------------------------------------------------------------------------

describe('Bug 2 — switchblocks deferred into setTimeout after workspacesync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does NOT call postToEditor with switchblocks synchronously during workspacesync handling', () => {
    const deps = makeDeps()

    handlePxtMessage(deps, makeEvent({ type: 'pxthost', action: 'workspacesync', id: 'sync-2' }))

    // Only check calls that happened BEFORE any timers advance
    const postToEditor = vi.mocked(deps.postToEditor)
    const synchronousSwitchBlocksCall = postToEditor.mock.calls
      .map(([msg]) => msg)
      .find(msg => msg['type'] === 'pxteditor' && msg['action'] === 'switchblocks')

    expect(synchronousSwitchBlocksCall).toBeUndefined()
  })

  it('calls postToEditor with switchblocks after setTimeout fires (≥500ms)', () => {
    const deps = makeDeps()

    handlePxtMessage(deps, makeEvent({ type: 'pxthost', action: 'workspacesync', id: 'sync-2b' }))

    vi.advanceTimersByTime(500)

    const postToEditor = vi.mocked(deps.postToEditor)
    const deferredSwitchBlocksCall = postToEditor.mock.calls
      .map(([msg]) => msg)
      .find(msg => msg['type'] === 'pxteditor' && msg['action'] === 'switchblocks')

    expect(deferredSwitchBlocksCall).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Bug 3 — pxteditor response must update lastPxtSource and lastPxtBlocks
// ---------------------------------------------------------------------------

describe('Bug 3 — pxteditor response updates lastPxtSource and lastPxtBlocks', () => {
  it('calls setLastPxtSource with main.ts content from resp', () => {
    const deps = makeDeps()

    handlePxtMessage(deps, makeEvent({
      type: 'pxteditor',
      response: true,
      id: 'resp-3',
      resp: { main: 'let x = 1', 'main.blocks': '<xml/>' },
    }))

    expect(vi.mocked(deps.setLastPxtSource)).toHaveBeenCalledWith('let x = 1')
  })

  it('calls setLastPxtBlocks with main.blocks content from resp', () => {
    const deps = makeDeps()

    handlePxtMessage(deps, makeEvent({
      type: 'pxteditor',
      response: true,
      id: 'resp-3b',
      resp: { main: 'let x = 1', 'main.blocks': '<xml/>' },
    }))

    expect(vi.mocked(deps.setLastPxtBlocks)).toHaveBeenCalledWith('<xml/>')
  })
})

// ---------------------------------------------------------------------------
// Bug 4 — unknown pxthost action must be acknowledged with success response
// ---------------------------------------------------------------------------

describe('Bug 4 — unknown pxthost action is acknowledged with success', () => {
  it('calls postToEditor with type pxthost, id, and success:true for unknown actions', () => {
    const deps = makeDeps()

    handlePxtMessage(deps, makeEvent({
      type: 'pxthost',
      action: 'someUnknownAction',
      response: true,
      id: 'unknown-4',
    }))

    expect(vi.mocked(deps.postToEditor)).toHaveBeenCalledWith({
      type: 'pxthost',
      id: 'unknown-4',
      success: true,
    })
  })
})

// ---------------------------------------------------------------------------
// Bug 5 — workspacesave with response:true must acknowledge the caller
// ---------------------------------------------------------------------------

describe('Bug 5 — workspacesave with response:true sends success acknowledgement', () => {
  it('calls postToEditor with type pxthost, id, success:true on workspacesave', () => {
    const deps = makeDeps()

    handlePxtMessage(deps, makeEvent({
      type: 'pxthost',
      action: 'workspacesave',
      response: true,
      id: 'save-5',
      project: {
        text: {
          'main.ts': 'let a = 1',
          'main.blocks': '<xml/>',
        },
      },
    }))

    expect(vi.mocked(deps.postToEditor)).toHaveBeenCalledWith({
      type: 'pxthost',
      id: 'save-5',
      success: true,
    })
  })
})
