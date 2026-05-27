import { getToolboxForLevel } from './FactoryToolbox'

const INITIAL_BLOCKS =
  '<xml xmlns="https://developers.google.com/blockly/xml">'
  + '<block type="pxt-on-start" x="0" y="0"></block>'
  + '</xml>'

interface MessageData {
  type?: unknown
  action?: unknown
  id?: unknown
  project?: unknown
  success?: unknown
}

interface ProjectText {
  'main.ts'?: unknown
  'main.blocks'?: unknown
}

export interface MessageRouterDeps {
  getData(): {
    iframe: HTMLIFrameElement | null
    pxtReady: boolean
    currentLevel: number
    pendingWorkspaceLoad: { ts: string; blocks: string | undefined } | null
    pendingPostReadyDirectInject: string | null
    pendingMachineUpdate: Array<{ id: string; name: string; type: string }> | null
    pendingBeltUpdate: Array<{ id: string; name: string; sourceName: string; destName: string }> | null
    lastPxtSource: string
    lastPxtBlocks: string
  }
  setPxtReady(value: boolean): void
  setPendingWorkspaceLoad(value: { ts: string; blocks: string | undefined } | null): void
  setPendingPostReadyDirectInject(value: string | null): void
  setLastPxtSource(value: string): void
  setLastPxtBlocks(value: string): void
  postToEditor(msg: Record<string, unknown>): void
  styleToolboxRows(): void
  injectToolboxStyles(): void
  fallbackSetValue(value: string): void
  fallbackHide(): void
  loadWorkspaceXml(raw: string): void
  loadBlocksWithRegistrationReady(blocksXml: string, timeoutMs?: number): Promise<boolean>
  armPendingDirectLoad(blocksXml: string): void
  maybeReapplyPendingDirectLoad(echoedBlocksXml: string | undefined): boolean
  updateMachineList(machines: Array<{ id: string; name: string; type: string }>): void
  updateBeltList(belts: Array<{ id: string; name: string; sourceName: string; destName: string }>): void
  notifyWorkspaceSave(blocks: string | undefined, ts: string | undefined): void
  resolvePendingResponse(id: string | undefined): void
  applySplittersGate(iframe: HTMLIFrameElement | null, level: number): void
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function extractProjectText(data: Record<string, unknown>): { ts: string | undefined; blocks: string | undefined } {
  const project = asRecord(data.project)
  const text = asRecord(project?.text) as ProjectText | null
  const ts = typeof text?.['main.ts'] === 'string' ? text?.['main.ts'] : undefined
  const blocks = typeof text?.['main.blocks'] === 'string' ? text?.['main.blocks'] : undefined
  return { ts, blocks }
}

function acknowledgeIfRequested(data: MessageData, id: string | undefined, deps: MessageRouterDeps): void {
  if (asRecord(data as unknown)?.['response']) {
    deps.postToEditor({ type: 'pxthost', id, success: true })
  }
}

function replayPendingSlotUpdates(deps: MessageRouterDeps): void {
  const state = deps.getData()
  if (state.pendingMachineUpdate) deps.updateMachineList(state.pendingMachineUpdate)
  if (state.pendingBeltUpdate) deps.updateBeltList(state.pendingBeltUpdate)
}

export function handlePxtMessage(deps: MessageRouterDeps, ev: MessageEvent): void {
  const data = asRecord((ev as MessageEvent<{ data?: unknown }>).data) as MessageData | null
  if (!data) return

  const type = typeof data.type === 'string' ? data.type : ''
  const action = typeof data.action === 'string' ? data.action : ''
  const id = typeof data.id === 'string' ? data.id : undefined

  if (type === 'pxteditor') {
    // Bug 3: extract resp and update source/blocks before resolving
    const resp = asRecord((data as unknown as Record<string, unknown>)['resp'])
    if (resp) {
      if (typeof resp['main'] === 'string') {
        deps.setLastPxtSource(resp['main'])
      }
      for (const [key, value] of Object.entries(resp)) {
        if (typeof value === 'string' && value.length > 0 && (key === 'blocks' || key.endsWith('.blocks'))) {
          deps.setLastPxtBlocks(value)
          break
        }
      }
    }
    deps.resolvePendingResponse(id)
    return
  }

  if (type !== 'pxthost') return

  if (action === 'workspacesync') {
    deps.setPxtReady(true)
    deps.fallbackHide()
    deps.injectToolboxStyles()

    // Bug 1: build the projects array for the workspacesync response
    const projectText: Record<string, string> = {
      'main.ts': '',
      'main.blocks': INITIAL_BLOCKS,
      'pxt.json': JSON.stringify({
        name: 'factory',
        dependencies: { core: '*' },
        files: ['main.blocks', 'main.ts'],
      }),
    }
    const pendingLoad = deps.getData().pendingWorkspaceLoad
    if (pendingLoad) {
      projectText['main.ts'] = pendingLoad.ts
      if (typeof pendingLoad.blocks === 'string' && pendingLoad.blocks.length > 0) {
        projectText['main.blocks'] = pendingLoad.blocks
        deps.armPendingDirectLoad(pendingLoad.blocks)
        deps.setPendingPostReadyDirectInject(pendingLoad.blocks)
      } else {
        delete projectText['main.blocks']
      }
      deps.setPendingWorkspaceLoad(null)
    }
    const defaultProject = {
      header: {
        id: 'factory-default',
        name: 'factory',
        meta: {},
        editor: 'blocksprj',
        pubId: '',
        pubCurrent: false,
        target: 'robot-factory',
        recentUse: Date.now(),
        modificationTime: Date.now(),
        path: 'factory',
      },
      text: projectText,
    }
    deps.postToEditor({
      type: 'pxthost',
      id,
      success: true,
      resp: undefined,
      projects: [defaultProject],
    })

    // Bug 2: all post-ready init calls go inside a single setTimeout(500)
    setTimeout(() => {
      deps.postToEditor({ type: 'pxteditor', action: 'setToolboxDefinition', toolbox: getToolboxForLevel(deps.getData().currentLevel) })
      deps.applySplittersGate(deps.getData().iframe, deps.getData().currentLevel)
      deps.postToEditor({ type: 'pxteditor', action: 'switchblocks' })
      replayPendingSlotUpdates(deps)
      const pendingDirect = deps.getData().pendingPostReadyDirectInject
      if (pendingDirect && pendingDirect.trim().length > 0) {
        deps.setPendingPostReadyDirectInject(null)
        void deps.loadBlocksWithRegistrationReady(pendingDirect).then((loaded) => {
          if (loaded) deps.armPendingDirectLoad(pendingDirect)
        })
      }
      setTimeout(() => deps.styleToolboxRows(), 300)
    }, 500)
    return
  }

  if (action === 'workspacesave') {
    const { ts, blocks } = extractProjectText(data as unknown as Record<string, unknown>)
    deps.notifyWorkspaceSave(blocks, ts)

    const acceptEcho = deps.maybeReapplyPendingDirectLoad(blocks)
    if (acceptEcho) {
      if (typeof ts === 'string') {
        deps.setLastPxtSource(ts)
        deps.fallbackSetValue(ts)
      }
      if (typeof blocks === 'string') {
        deps.setLastPxtBlocks(blocks)
      }
    }

    // Bug 5: acknowledge if the caller requested a response
    acknowledgeIfRequested(data, id, deps)
    return
  }

  // Bug 4: default catch-all — acknowledge any pxthost request that expects a response
  acknowledgeIfRequested(data, id, deps)
}
