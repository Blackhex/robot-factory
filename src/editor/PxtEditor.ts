import i18next from 'i18next'
import type { SimulationCommand } from '../game/types'
import type { Item } from '../game/Item'
import { BlockInterpreter } from './BlockInterpreter'
import { getToolboxForLevel } from './FactoryToolbox'
import { assignStableSlots, type SlottedItem } from './stableSlotAssigner'
import { PxtFallbackEditor } from './PxtFallbackEditor'
import {
  installPxtLanguageReloadNotice,
  toPxtLocale,
  type PxtLanguageReloadNoticeHandle,
  type PxtLocale,
} from './pxtEditorLanguageNotice'
import { createLocalizedPxtIframe, stylePxtToolboxRows } from './PxtEditorViewHelpers'
import { PLUGGABLE_CONSUMER_BLOCK_TYPES } from './pluggableConsumerBlockTypes'
import { performBlankProjectLoad, type BlankProjectDeps } from './PxtEditorBlankProject'
import { performCompileBlocksToTs } from './PxtEditorCompileBlocks'
import { applySplittersGate } from './splittersGate'
import { pinInitialViewport } from './pinInitialViewport'
import toolboxOverridesCss from './pxt-toolbox-overrides.css?raw'
import { MAX_SLOTS, patchBlocklyDropdowns } from './PxtEditorDropdownPatch'
import {
  armPendingDirectLoad,
  extractBlockTypes,
  loadBlocksDirectly,
  loadBlocksWithRegistrationReady,
  maybeReapplyPendingDirectLoad,
  postImportProject,
  readLiveBlocksXml,
} from './PxtEditorWorkspaceLoad'
import { handlePxtMessage } from './PxtEditorMessageRouter'
import type { PendingDirectLoad } from './PxtEditorDirectLoad'
import {
  createMessageRouterDeps,
  createPendingDirectLoadDeps,
  createWorkspaceAccessDeps,
} from './PxtEditorAdapters'
// MACHINE_BLOCK_TYPES = ['factory_start_machine', 'factory_stop_machine', 'factory_set_recipe', 'factory_on_machine_idle', 'factory_pick_machine', 'factory_set_machine_speed']
// BELT_BLOCK_TYPES = ['factory_set_belt_speed', 'factory_pick_belt']
export class PxtEditor {
  private container: HTMLElement | null = null
  private iframe: HTMLIFrameElement | null = null
  private fallbackEditor: PxtFallbackEditor | null = null
  readonly interpreter = new BlockInterpreter()
  currentLevel = 1
  private pxtReady = false
  private lastPxtSource = ''
  private lastPxtBlocks = ''
  pendingWorkspaceLoad: { ts: string; blocks: string | undefined } | null = null
  pendingPostReadyDirectInject: string | null = null
  private messageHandler: ((ev: MessageEvent) => void) | null = null
  pendingMachineUpdate: Array<{ id: string; name: string; type: string }> | null = null
  pendingBeltUpdate: Array<{ id: string; name: string; sourceName: string; destName: string }> | null = null
  private prevMachineSlots: Array<SlottedItem & { name: string; type: string }> | null = null
  private prevBeltSlots: Array<SlottedItem & { name: string }> | null = null
  private prototypePatched = false
  private textPatched = false
  private recipeAutoResetInstalled = false
  private stylesInjected = false
  private toolboxObserver: MutationObserver | null = null
  private nextRequestId = 1
  private pendingResponses = new Map<string, () => void>()
  private workspaceSaveListeners = new Set<(blocks: string | undefined, ts: string | undefined) => void>()
  private pendingDirectLoad: PendingDirectLoad | null = null
  private static readonly DIRECT_LOAD_DEADLINE_MS = 4000
  private static readonly DIRECT_LOAD_MAX_ATTEMPTS = 5
  private iframeLangAtMount: PxtLocale = 'en'
  private languageNotice: PxtLanguageReloadNoticeHandle | null = null

  private installLanguageNotice(container: HTMLElement): void {
    this.languageNotice?.dispose()
    this.languageNotice = installPxtLanguageReloadNotice({
      container,
      isEditorVisible: () => this.container?.style.display !== 'none',
      iframeLangAtMount: this.iframeLangAtMount,
    })
  }

  private recreateIframeForLanguage(pxtLang: PxtLocale): void {
    if (!this.container) return
    this.pendingWorkspaceLoad = null
    this.pxtReady = false
    this.pendingResponses.clear()
    this.pendingDirectLoad = null
    this.pendingPostReadyDirectInject = null
    this.stylesInjected = false
    this.prototypePatched = false
    this.textPatched = false
    this.recipeAutoResetInstalled = false
    this.toolboxObserver?.disconnect()
    this.toolboxObserver = null
    if (this.iframe) {
      this.iframe.remove()
      this.iframe = null
    }
    this.iframeLangAtMount = pxtLang
    this.iframe = createLocalizedPxtIframe(this.container, this.iframeLangAtMount)
    this.installLanguageNotice(this.container)
  }

  mount(container: HTMLElement): void {
    this.container = container
    this.iframeLangAtMount = toPxtLocale(i18next.language)
    this.iframe = createLocalizedPxtIframe(container, this.iframeLangAtMount)
    this.messageHandler = (ev: MessageEvent) => this.handlePxtMessage(ev)
    window.addEventListener('message', this.messageHandler)
    this.fallbackEditor = new PxtFallbackEditor(container)
    this.installLanguageNotice(container)
    setTimeout(() => {
      if (!this.pxtReady) console.log('[PxtEditor] PXT editor not available, using fallback textarea')
    }, 3000)
  }

  setLevel(level: number): void {
    this.currentLevel = level
    if (!this.pxtReady) return
    this.postToEditor({ type: 'pxteditor', action: 'setToolboxDefinition', toolbox: getToolboxForLevel(level) })
    applySplittersGate(this.iframe, level)
    setTimeout(() => this.styleToolboxRows(), 300)
  }

  show(): void {
    const currentLang = toPxtLocale(i18next.language)
    if (this.container && currentLang !== this.iframeLangAtMount) {
      this.recreateIframeForLanguage(currentLang)
    }
    if (this.container) this.container.style.display = ''
    this.languageNotice?.checkLanguageMismatch()
    if (this.pxtReady) {
      const ws = this.getBlocklyWorkspace()
      const Blockly = this.getBlockly()
      if (ws) Blockly?.svgResize?.(ws)
      pinInitialViewport(() => this.getBlocklyWorkspace(), 30, 30)
    }
  }

  hide(): void {
    if (this.container) this.container.style.display = 'none'
  }

  getProgram(): SimulationCommand[] {
    let source = ''
    if (this.pxtReady && this.lastPxtSource.trim()) source = this.lastPxtSource
    else if (this.fallbackEditor) source = this.fallbackEditor.getValue()
    if (!source.trim()) return []

    this.interpreter.reset()
    const commands = this.interpreter.interpret(source)
    if (this.interpreter.getOverflowOccurred()) {
      console.warn('[PxtEditor] Interpreter overflow — program too long')
    }
    console.log('[PxtEditor] Generated program:', JSON.stringify(commands))
    return commands
  }

  triggerEvent(eventType: string): SimulationCommand[] {
    return this.interpreter.triggerEvent(eventType)
  }

  triggerOnItemArrives(machineId: string, item: Item): SimulationCommand[] {
    return this.interpreter.triggerOnItemArrives(machineId, item)
  }

  getWorkspaceXml(): string {
    const fallbackValue = this.fallbackEditor?.getValue() ?? ''
    if (!this.pxtReady) return fallbackValue
    const liveBlocks = this.readLiveBlocksXml()
    const blocks = liveBlocks !== '' ? liveBlocks : this.lastPxtBlocks
    if (this.lastPxtSource === '' && blocks === '' && fallbackValue === '') return ''
    return JSON.stringify({ ts: this.lastPxtSource, blocks })
  }

  loadWorkspaceXml(xml: string): void {
    let ts = xml
    let blocks: string | undefined
    let parsedEnvelope = false

    try {
      const parsed = JSON.parse(xml) as { ts?: unknown; blocks?: unknown } | null
      if (parsed && typeof parsed === 'object' && (typeof parsed.ts === 'string' || typeof parsed.blocks === 'string')) {
        parsedEnvelope = true
        ts = typeof parsed.ts === 'string' ? parsed.ts : ''
        blocks = typeof parsed.blocks === 'string' ? parsed.blocks : ''
      }
    } catch {
      // legacy plain TS
    }

    if (!this.pxtReady) {
      this.pendingWorkspaceLoad = { ts, blocks: parsedEnvelope ? (blocks ?? '') : undefined }
      this.lastPxtSource = ts
      this.lastPxtBlocks = parsedEnvelope ? (blocks ?? '') : ''
      this.fallbackEditor?.setValue(ts)
      return
    }

    const blocksXml = typeof blocks === 'string' ? blocks : ''
    void this.loadBlocksWithRegistrationReady(blocksXml).then((loaded) => {
      if (loaded) {
        this.armPendingDirectLoad(blocksXml)
        return
      }
      this.postImportProject(blocksXml, ts)
    })

    this.lastPxtSource = ts
    this.lastPxtBlocks = parsedEnvelope ? (blocks ?? '') : ''
    this.fallbackEditor?.setValue(ts)
  }

  loadBlankProjectAsync(timeoutMs = 4000): Promise<void> {
    return performBlankProjectLoad(this as unknown as BlankProjectDeps, timeoutMs)
  }

  flushPendingSaveAsync(timeoutMs = 1000): Promise<void> {
    if (!this.pxtReady) return Promise.resolve()
    const id = `rf-flush-${this.nextRequestId++}`
    return new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        this.pendingResponses.delete(id)
        resolve()
      }
      this.pendingResponses.set(id, finish)
      setTimeout(finish, timeoutMs)
      this.postToEditor({ type: 'pxteditor', action: 'saveproject', id, response: true })
    })
  }
  compileBlocksToTsAsync = (options?: { blocksMustContain?: string[]; tsMustContain?: string[]; timeoutMs?: number }): Promise<string> => performCompileBlocksToTs({
    pxtReady: this.pxtReady,
    workspaceSaveListeners: this.workspaceSaveListeners,
    pendingResponses: this.pendingResponses,
    allocateId: () => `rf-compile-${this.nextRequestId++}`,
    postToEditor: (msg) => this.postToEditor(msg),
    getBlockly: () => this.getBlockly(),
    getBlocklyWorkspace: () => this.getBlocklyWorkspace(),
  }, options)

  dispose(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }
    this.languageNotice?.dispose(); this.languageNotice = null
    if (this.iframe) {
      this.iframe.remove()
      this.iframe = null
    }
    this.fallbackEditor?.dispose()
    this.fallbackEditor = null
    this.container = null
  }

  updateMachineList(machines: Array<{ id: string; name: string; type: string }>): void {
    this.pendingMachineUpdate = machines
    const slotted = this.assignAndPersistSlots(machines, this.prevMachineSlots, (next) => {
      this.prevMachineSlots = next
    })
    this.interpreter.setMachineList(slotted)
    this.patchBlocklyDropdowns('machine', slotted)
  }

  updateBeltList(belts: Array<{ id: string; name: string; sourceName: string; destName: string }>): void {
    this.pendingBeltUpdate = belts
    const slotted = this.assignAndPersistSlots(belts, this.prevBeltSlots, (next) => {
      this.prevBeltSlots = next.map((s) => ({ slotIndex: s.slotIndex, id: s.id, name: s.name }))
    })
    this.interpreter.setBeltList(this.prevBeltSlots!)
    const labeled = slotted.map((s) => ({ slotIndex: s.slotIndex, id: s.id, name: s.name, label: `${s.sourceName} → ${s.destName}` }))
    this.patchBlocklyDropdowns('belt', labeled)
  }

  private assignAndPersistSlots<T extends { id: string }>(
    items: ReadonlyArray<T>,
    prev: ReadonlyArray<SlottedItem> | null,
    setPrev: (next: Array<T & { slotIndex: number }>) => void,
  ): Array<T & { slotIndex: number }> {
    const slotted = assignStableSlots(prev, items, MAX_SLOTS)
    setPrev(slotted)
    return slotted
  }

  private patchBlocklyDropdowns(kind: 'machine' | 'belt', items: Array<{ slotIndex: number; id: string; name?: string; label?: string; type?: string }>): void {
    const state = {
      prototypePatched: this.prototypePatched,
      textPatched: this.textPatched,
      recipeAutoResetInstalled: this.recipeAutoResetInstalled,
    }
    patchBlocklyDropdowns(this.iframe, this.pxtReady, kind, items, state)
    this.prototypePatched = state.prototypePatched
    this.textPatched = state.textPatched
    this.recipeAutoResetInstalled = state.recipeAutoResetInstalled
  }

  private handlePxtMessage(ev: MessageEvent): void {
    handlePxtMessage(createMessageRouterDeps(this), ev)
  }

  injectToolboxStyles(): void {
    if (this.stylesInjected || !this.iframe) return
    let doc: Document
    try { doc = this.iframe.contentWindow!.document } catch { return }
    const style = doc.createElement('style'); style.textContent = toolboxOverridesCss
    doc.head.appendChild(style); this.stylesInjected = true
  }

  private postToEditor(msg: Record<string, unknown>): void {
    if (this.iframe?.contentWindow) this.iframe.contentWindow.postMessage(msg, '*')
  }

  private styleToolboxRows(): void {
    if (!this.iframe) return
    this.toolboxObserver = stylePxtToolboxRows(this.iframe, this.toolboxObserver)
  }

  private getBlockly(): any {
    const win = this.iframe?.contentWindow as any
    return win?.Blockly
  }

  private getBlocklyWorkspace(): any {
    return this.getBlockly()?.getMainWorkspace?.()
  }

  private readLiveBlocksXml(): string {
    return readLiveBlocksXml(createWorkspaceAccessDeps(this))
  }

  loadBlocksDirectly(blocksXml: string): boolean {
    return loadBlocksDirectly(createWorkspaceAccessDeps(this), blocksXml)
  }

  private loadBlocksWithRegistrationReady(blocksXml: string, timeoutMs = 5000): Promise<boolean> {
    return loadBlocksWithRegistrationReady(createWorkspaceAccessDeps(this), blocksXml, timeoutMs)
  }

  private armPendingDirectLoad(blocksXml: string): void {
    this.pendingDirectLoad = armPendingDirectLoad(
      blocksXml,
      Date.now(),
      PxtEditor.DIRECT_LOAD_DEADLINE_MS,
      PLUGGABLE_CONSUMER_BLOCK_TYPES,
    )
  }

  private postImportProject(blocksXml: string, ts: string): void {
    postImportProject((msg) => this.postToEditor(msg), blocksXml, ts)
  }

  maybeReapplyPendingDirectLoad(echoedBlocksXml: string | undefined): boolean {
    // Keep the loaded XML alive through PXT clobber echoes until deadline/attempt limits.
    return maybeReapplyPendingDirectLoad(
      createPendingDirectLoadDeps(this),
      echoedBlocksXml,
      Date.now(),
      PxtEditor.DIRECT_LOAD_MAX_ATTEMPTS,
    )
  }

  getDevDiagnostics(): { pxtReady: boolean; hasPendingLoad: boolean; protectPluggableConsumer: boolean; lastPxtBlocks: string } {
    return {
      pxtReady: this.pxtReady,
      hasPendingLoad: this.pendingDirectLoad !== null,
      protectPluggableConsumer: this.pendingDirectLoad?.protectPluggableConsumer ?? false,
      lastPxtBlocks: this.lastPxtBlocks,
    }
  }

  getLiveWorkspaceXml(): string | null {
    if (!this.pxtReady) return null
    const xml = this.readLiveBlocksXml()
    return xml === '' ? null : xml
  }

  getLastPxtSource(): string {
    return this.lastPxtSource
  }

  extractBlockTypes = (blocksXml: string): string[] => extractBlockTypes(blocksXml)
}
