import type { PendingDirectLoad } from './PxtEditorDirectLoad'
import type { WorkspaceAccessDeps, PendingDirectLoadDeps } from './PxtEditorWorkspaceLoad'
import type { MessageRouterDeps } from './PxtEditorMessageRouter'

export function createWorkspaceAccessDeps(editor: any): WorkspaceAccessDeps {
  return {
    getBlockly: () => editor.getBlockly(),
    getBlocklyWorkspace: () => editor.getBlocklyWorkspace(),
    getLastPxtBlocks: () => editor.lastPxtBlocks,
  }
}

export function createPendingDirectLoadDeps(editor: any): PendingDirectLoadDeps {
  return {
    getPendingDirectLoad: (): PendingDirectLoad | null => editor.pendingDirectLoad,
    setPendingDirectLoad: (value: PendingDirectLoad | null): void => {
      editor.pendingDirectLoad = value
    },
    loadBlocksDirectly: (blocksXml: string): boolean => editor.loadBlocksDirectly(blocksXml),
  }
}

export function createMessageRouterDeps(editor: any): MessageRouterDeps {
  return {
    getData: () => ({
      iframe: editor.iframe,
      pxtReady: editor.pxtReady,
      currentLevel: editor.currentLevel,
      pendingWorkspaceLoad: editor.pendingWorkspaceLoad,
      pendingPostReadyDirectInject: editor.pendingPostReadyDirectInject,
      pendingMachineUpdate: editor.pendingMachineUpdate,
      pendingBeltUpdate: editor.pendingBeltUpdate,
      lastPxtSource: editor.lastPxtSource,
      lastPxtBlocks: editor.lastPxtBlocks,
    }),
    setPxtReady: (value: boolean) => { editor.pxtReady = value },
    setPendingWorkspaceLoad: (value: { ts: string; blocks: string | undefined } | null) => {
      editor.pendingWorkspaceLoad = value
    },
    setPendingPostReadyDirectInject: (value: string | null) => {
      editor.pendingPostReadyDirectInject = value
    },
    setLastPxtSource: (value: string) => { editor.lastPxtSource = value },
    setLastPxtBlocks: (value: string) => { editor.lastPxtBlocks = value },
    postToEditor: (msg: Record<string, unknown>) => editor.postToEditor(msg),
    styleToolboxRows: () => editor.styleToolboxRows(),
    injectToolboxStyles: () => editor.injectToolboxStyles(),
    fallbackSetValue: (value: string) => editor.fallbackEditor?.setValue(value),
    fallbackHide: () => editor.fallbackEditor?.hide(),
    loadWorkspaceXml: (raw: string) => editor.loadWorkspaceXml(raw),
    loadBlocksWithRegistrationReady: (blocksXml: string, timeoutMs?: number) => editor.loadBlocksWithRegistrationReady(blocksXml, timeoutMs),
    armPendingDirectLoad: (blocksXml: string) => editor.armPendingDirectLoad(blocksXml),
    maybeReapplyPendingDirectLoad: (echoedBlocksXml: string | undefined): boolean => editor.maybeReapplyPendingDirectLoad(echoedBlocksXml),
    updateMachineList: (machines) => editor.updateMachineList(machines),
    updateBeltList: (belts) => editor.updateBeltList(belts),
    notifyWorkspaceSave: (blocks, ts) => {
      const listeners = Array.from(editor.workspaceSaveListeners.values()) as Array<
        (blocks: string | undefined, ts: string | undefined) => void
      >
      for (const listener of listeners) listener(blocks, ts)
    },
    resolvePendingResponse: (id: string | undefined) => {
      if (!id) return
      const callback = editor.pendingResponses.get(id)
      if (!callback) return
      callback()
    },
    applySplittersGate: (iframe, level) => {
      import('./splittersGate').then(({ applySplittersGate }) => applySplittersGate(iframe, level))
    },
  }
}
