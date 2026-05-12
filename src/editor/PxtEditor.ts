import i18next from 'i18next'
import type { SimulationCommand } from '../game/types'
import { BlockInterpreter } from './BlockInterpreter'
import { getToolboxForLevel } from './FactoryToolbox'
import { buildDropdownOptions, resolveDropdownText, type DropdownItem } from './dropdownOptions'
import { PxtFallbackEditor } from './PxtFallbackEditor'
import { applyOnMachineIdleHatShape } from './hatBlockShape'
import { PLUGGABLE_CONSUMER_BLOCK_TYPES } from './pluggableConsumerBlockTypes'
import toolboxOverridesCss from './pxt-toolbox-overrides.css?raw'

/**
 * Manages the PXT (MakeCode) editor, embedded as an iframe.
 *
 * When the PXT target has been built and served from `/pxt-editor/`,
 * the iframe loads the full MakeCode blocks+TypeScript dual editor.
 * Communication uses PXT's postMessage-based Controller API
 * (`#controller=1` URL fragment).
 *
 * **Fallback mode**: If the PXT editor does not respond within a
 * short timeout (i.e. the target hasn't been built yet), a simple
 * `<textarea>` is shown where the user can type TypeScript factory
 * commands directly. The BlockInterpreter executes whichever source
 * is available.
 */
export class PxtEditor {
  private container: HTMLElement | null = null
  private iframe: HTMLIFrameElement | null = null
  private fallbackEditor: PxtFallbackEditor | null = null
  readonly interpreter = new BlockInterpreter()
  private currentLevel = 1
  private pxtReady = false
  private lastPxtSource = ''
  private lastPxtBlocks = ''
  private pendingWorkspaceLoad: { ts: string; blocks: string | undefined } | null = null
  /** Blocks XML queued by `loadWorkspaceXml` while pxtReady was false; consumed by the workspacesync handler's post-init setTimeout to perform an initial direct Blockly injection (the watchdog handles subsequent clobbers). */
  private pendingPostReadyDirectInject: string | null = null
  private messageHandler: ((ev: MessageEvent) => void) | null = null
  private pendingMachineUpdate: Array<{id: string, name: string, type: string}> | null = null
  private pendingBeltUpdate: Array<{id: string, name: string, sourceName: string, destName: string}> | null = null
  private prototypePatched = false
  private textPatched = false
  private stylesInjected = false
  private toolboxObserver: MutationObserver | null = null
  private nextRequestId = 1
  private pendingResponses = new Map<string, () => void>()
  /** Tracks an in-flight direct-load. PXT's `loadHeaderAsync` re-decompiles `main.ts` after install and may clobber injected blocks. Watchdog re-injects on every clobbered `workspacesave`. `protectPluggableConsumer` (saves containing any of the {@link PLUGGABLE_CONSUMER_BLOCK_TYPES}) re-applies until the 4 s deadline AND signals broken echoes back so the cache stays pinned. See `maybeReapplyPendingDirectLoad`. */
  private pendingDirectLoad: { expectedBlockTypes: string[]; blocksXml: string; deadline: number; attempts: number; protectPluggableConsumer: boolean } | null = null
  private static readonly DIRECT_LOAD_DEADLINE_MS = 4000
  private static readonly DIRECT_LOAD_MAX_ATTEMPTS = 5

  /**
   * Mount the editor into the given container.
   * Creates both the PXT iframe and the fallback textarea.
   */
  mount(container: HTMLElement): void {
    this.container = container

    // --- PXT iframe (hidden until PXT responds) ---
    this.iframe = document.createElement('iframe')
    this.iframe.className = 'pxt-editor-iframe'
    this.iframe.src = '/pxt-editor/index.html#controller=1'
    this.iframe.style.width = '100%'
    this.iframe.style.height = '100%'
    this.iframe.style.border = 'none'
    this.iframe.style.display = 'none'
    container.appendChild(this.iframe)

    // --- postMessage listener for PXT Controller API ---
    this.messageHandler = (ev: MessageEvent) => this.handlePxtMessage(ev)
    window.addEventListener('message', this.messageHandler)

    // --- Fallback textarea editor ---
    this.fallbackEditor = new PxtFallbackEditor(container)

    // If PXT hasn't replied within 3 s, keep the fallback visible
    setTimeout(() => {
      if (!this.pxtReady) {
        console.log('[PxtEditor] PXT editor not available, using fallback textarea')
      }
    }, 3000)
  }

  /** Update the toolbox to show blocks available for the given level. */
  setLevel(level: number): void {
    this.currentLevel = level
    if (this.pxtReady) {
      const toolbox = getToolboxForLevel(level)
      this.postToEditor({
        type: 'pxteditor',
        action: 'setToolboxDefinition',
        toolbox,
      })
      // Re-apply toolbar button styles after PXT re-renders the toolbox
      setTimeout(() => this.styleToolboxRows(), 300)
    }
  }

  show(): void {
    if (this.container) {
      this.container.style.display = ''
    }
    // After hide/show cycles, Blockly inside the iframe can keep
    // stale (often zero) SVG metrics, occasionally leaving the
    // on-start block scrolled off-viewport — looking like an empty
    // area. Force a metrics refresh and re-pin the viewport.
    if (this.pxtReady) {
      const ws = this.getBlocklyWorkspace()
      const Blockly = this.getBlockly()
      if (ws) Blockly?.svgResize?.(ws)
      this.pinInitialViewport(30, 30)
    }
  }

  hide(): void {
    if (this.container) {
      this.container.style.display = 'none'
    }
  }

  /**
   * Interpret the current program and return simulation commands.
   * Reads from PXT (if ready) or from the fallback textarea.
   */
  getProgram(): SimulationCommand[] {
    let source = ''

    if (this.pxtReady && this.lastPxtSource.trim()) {
      source = this.lastPxtSource
    } else if (this.fallbackEditor) {
      source = this.fallbackEditor.getValue()
    }

    if (!source.trim()) return []

    this.interpreter.reset()
    const commands = this.interpreter.interpret(source)

    if (this.interpreter.getOverflowOccurred()) {
      console.warn('[PxtEditor] Interpreter overflow — program too long')
    }

    console.log('[PxtEditor] Generated program:', JSON.stringify(commands))
    return commands
  }

  /**
   * Trigger a registered event handler and return the commands
   * produced by its body.
   */
  triggerEvent(eventType: string): SimulationCommand[] {
    return this.interpreter.triggerEvent(eventType)
  }

  /**
   * Read the live Blockly workspace XML directly from the embedded editor.
   * Returns '' if Blockly is not available or serialization fails so that
   * callers can fall back to the cached `lastPxtBlocks` value.
   */
  private readLiveBlocksXml(): string {
    try {
      const Blockly: any = this.getBlockly()
      const ws: any = this.getBlocklyWorkspace()
      if (!Blockly?.Xml || !ws) return ''
      const dom = Blockly.Xml.workspaceToDom(ws)
      if (!dom) return ''
      const xml = Blockly.Xml.domToText(dom)
      return typeof xml === 'string' ? xml : ''
    } catch {
      return ''
    }
  }

  /** Get the current workspace state for save/load. */
  getWorkspaceXml(): string {
    const fallbackValue = this.fallbackEditor?.getValue() ?? ''
    if (this.pxtReady) {
      // Prefer the live Blockly XML at save time; fall back to the cached
      // value captured from `workspacesave` (which PXT only sometimes echoes).
      const liveBlocks = this.readLiveBlocksXml()
      const blocks = liveBlocks !== '' ? liveBlocks : this.lastPxtBlocks
      // Preserve AutoSave's empty-XML guard: if nothing has been captured
      // yet from PXT and the fallback is empty too, return '' so AutoSave
      // skips persisting an empty envelope.
      if (this.lastPxtSource === '' && blocks === '' && fallbackValue === '') {
        return ''
      }
      return JSON.stringify({ ts: this.lastPxtSource, blocks })
    }
    return fallbackValue
  }

  /** Restore a previously saved workspace state. */
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
      // Legacy plain TS string — fall through with `ts = xml`, blocks undefined.
    }

    if (!this.pxtReady) {
      // Queue for the workspacesync handler; seed cache so an immediate
      // re-save still produces a faithful envelope. `importproject` would
      // be silently dropped by the not-yet-listening iframe.
      this.pendingWorkspaceLoad = { ts, blocks: parsedEnvelope ? (blocks ?? '') : undefined }
      this.lastPxtSource = ts
      this.lastPxtBlocks = parsedEnvelope ? (blocks ?? '') : ''
      this.fallbackEditor?.setValue(ts)
      return
    }

    // Direct Blockly injection > `importproject` for orphan blocks: PXT's
    // `loadHeaderAsync` re-derives `main.blocks` from `main.ts`, dropping
    // anything without a TS counterpart. The watchdog handles subsequent
    // post-init clobbers (see `maybeReapplyPendingDirectLoad`).
    const blocksXml = typeof blocks === 'string' ? blocks : ''
    void this.loadBlocksWithRegistrationReady(blocksXml).then((loaded) => {
      if (loaded) {
        this.armPendingDirectLoad(blocksXml)
        return
      }
      this.postImportProject(blocksXml, ts)
    })

    // Seed cache so a re-save before PXT echoes still produces a faithful
    // envelope; reset on the non-envelope branch so stale values can't leak.
    this.lastPxtSource = ts
    this.lastPxtBlocks = parsedEnvelope ? (blocks ?? '') : ''

    this.fallbackEditor?.setValue(ts)
  }

  /**
   * Force PXT to flush its debounced internal save and resolve once the
   * controller acknowledges. Necessary before reading `getWorkspaceXml()`
   * for a save/export. Resolves immediately if not ready, on the matching
   * `pxteditor` response, or after `timeoutMs` to guarantee no hang.
   */
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

  dispose(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }
    if (this.iframe) {
      this.iframe.remove()
      this.iframe = null
    }
    this.fallbackEditor?.dispose()
    this.fallbackEditor = null
    this.container = null
  }

  // --- Dynamic machine/belt dropdown updates -----------------------------

  /** Machine block types that use the Machine enum dropdown. */
  private static readonly MACHINE_BLOCK_TYPES = [
    'factory_start_machine', 'factory_stop_machine',
    'factory_set_recipe', 'factory_on_machine_idle',
    'factory_pick_machine', 'factory_set_machine_speed',
  ]

  /** Belt block types that use the Belt enum dropdown. */
  private static readonly BELT_BLOCK_TYPES = [
    'factory_set_belt_speed',
    'factory_pick_belt',
  ]

  /** Maximum number of machine/belt slots exposed in the dropdown enum. */
  private static readonly MAX_SLOTS = 64

  /**
   * Update the machine list used by block dropdowns and the interpreter.
   * Assigns each machine to a slot (0..MAX_SLOTS-1) in order.
   */
  updateMachineList(machines: Array<{id: string, name: string, type: string}>): void {
    this.pendingMachineUpdate = machines
    const slotted = machines.slice(0, PxtEditor.MAX_SLOTS).map((m, i) => ({
      slotIndex: i,
      id: m.id,
      name: m.name,
    }))
    this.interpreter.setMachineList(slotted)
    this.patchBlocklyDropdowns('machine', slotted)
  }

  /**
   * Update the belt list used by block dropdowns and the interpreter.
   * Assigns each belt to a slot (0..MAX_SLOTS-1) in order.
   */
  updateBeltList(belts: Array<{id: string, name: string, sourceName: string, destName: string}>): void {
    this.pendingBeltUpdate = belts
    const slotted = belts.slice(0, PxtEditor.MAX_SLOTS).map((b, i) => ({
      slotIndex: i,
      id: b.id,
      name: b.name,
    }))
    this.interpreter.setBeltList(slotted)

    const labeled = belts.slice(0, PxtEditor.MAX_SLOTS).map((b, i) => ({
      slotIndex: i,
      id: b.id,
      name: b.name,
      label: `${b.sourceName} → ${b.destName}`,
    }))
    this.patchBlocklyDropdowns('belt', labeled)
  }

  /**
   * Patch Blockly FieldDropdown menuGenerator_ for machine or belt blocks
   * inside the PXT iframe. Fails silently if iframe is not accessible.
   */
  private patchBlocklyDropdowns(
    kind: 'machine' | 'belt',
    items: Array<{slotIndex: number, id: string, name?: string, label?: string}>,
  ): void {
    if (!this.pxtReady || !this.iframe) return

    let iframeWindow: any
    try {
      iframeWindow = this.iframe.contentWindow
    } catch { return }
    const blockly = iframeWindow?.Blockly
    if (!blockly?.mainWorkspace) return

    const enumName = kind === 'machine' ? 'Machine' : 'Belt'
    // Slots 0..7 use original names (A..H, Belt1..Belt8) for save compatibility.
    // Slots 8..63 use M9..M64 / Belt9..Belt64 (the visible label is patched
    // dynamically to the user's machine/belt name regardless).
    const machineMembers = [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
      ...Array.from({ length: PxtEditor.MAX_SLOTS - 8 }, (_, i) => `M${i + 9}`),
    ]
    const beltMembers = Array.from({ length: PxtEditor.MAX_SLOTS }, (_, i) => `Belt${i + 1}`)
    const enumMembers = kind === 'machine' ? machineMembers : beltMembers
    const labelStorageKey = `__rf_${kind}Labels`
    const itemsStorageKey = `__rf_${kind}Items`
    const membersStorageKey = `__rf_${kind}Members`

    // Build and store label map on iframe window (for getText lookups).
    const labelMap: Record<string, string> = {}
    for (let i = 0; i < PxtEditor.MAX_SLOTS; i++) {
      const enumValue = `${enumName}.${enumMembers[i]}`
      const item = items.find(it => it.slotIndex === i)
      if (item) {
        labelMap[enumValue] = item.name ?? item.label ?? item.id
      }
    }
    iframeWindow[labelStorageKey] = labelMap
    iframeWindow[itemsStorageKey] = items
    iframeWindow[membersStorageKey] = enumMembers

    // Patch FieldDropdown.prototype.getOptions ONCE
    if (!this.prototypePatched) {
      this.prototypePatched = true
      const origGetOptions = blockly.FieldDropdown.prototype.getOptions
      const machineBlockTypes = PxtEditor.MACHINE_BLOCK_TYPES
      const beltBlockTypes = PxtEditor.BELT_BLOCK_TYPES

      blockly.FieldDropdown.prototype.getOptions = function(this: any, opt_useCache?: boolean) {
        const block = this.sourceBlock_
        const fieldName = this.name

        if (block && fieldName === 'machine' && machineBlockTypes.includes(block.type)) {
          const items: DropdownItem[] = iframeWindow.__rf_machineItems || []
          const members: string[] = iframeWindow.__rf_machineMembers || []
          const emptyLabel = i18next.t('blocks.no_machines')
          return buildDropdownOptions('machine', items, members, emptyLabel)
        }

        if (block && fieldName === 'belt' && beltBlockTypes.includes(block.type)) {
          const items: DropdownItem[] = iframeWindow.__rf_beltItems || []
          const members: string[] = iframeWindow.__rf_beltMembers || []
          const emptyLabel = i18next.t('blocks.no_belts')
          return buildDropdownOptions('belt', items, members, emptyLabel)
        }

        return origGetOptions.call(this, opt_useCache)
      }
    }

    // Patch FieldDropdown.prototype.getText ONCE so block face text is dynamic
    if (!this.textPatched) {
      this.textPatched = true
      const origGetText = blockly.FieldDropdown.prototype.getText
      const machineBlockTypes2 = PxtEditor.MACHINE_BLOCK_TYPES
      const beltBlockTypes2 = PxtEditor.BELT_BLOCK_TYPES

      blockly.FieldDropdown.prototype.getText = function(this: any) {
        const block = this.sourceBlock_
        const fieldName = this.name
        const value = this.value_ ?? ''

        if (block) {
          if (fieldName === 'machine' && machineBlockTypes2.includes(block.type)) {
            const map: Record<string, string> = iframeWindow.__rf_machineLabels || {}
            const emptyLabel = i18next.t('blocks.no_machines')
            const resolved = resolveDropdownText(value, map, emptyLabel)
            if (resolved !== null) return resolved
          }
          if (fieldName === 'belt' && beltBlockTypes2.includes(block.type)) {
            const map: Record<string, string> = iframeWindow.__rf_beltLabels || {}
            const emptyLabel = i18next.t('blocks.no_belts')
            const resolved = resolveDropdownText(value, map, emptyLabel)
            if (resolved !== null) return resolved
          }
        }

        return origGetText.call(this)
      }
    }

    // Force re-render of all blocks with machine/belt fields so getText() updates
    // take effect. Blockly caches the field's rendered SVG text, so calling
    // block.render() alone is not enough; we must invalidate the field display
    // via forceRerender() (Blockly v9+) or setValue(getValue()) as fallback.
    const blockTypeToFieldName: Record<string, string> = {}
    for (const t of PxtEditor.MACHINE_BLOCK_TYPES) blockTypeToFieldName[t] = 'machine'
    for (const t of PxtEditor.BELT_BLOCK_TYPES) blockTypeToFieldName[t] = 'belt'

    const workspace = blockly.mainWorkspace
    const refreshBlocks = (blocks: any[]): void => {
      for (const block of blocks) {
        const fieldName = blockTypeToFieldName[block.type]
        if (!fieldName) continue
        const field = block.getField?.(fieldName)
        if (field) this.refreshFieldDisplay(field)
        block.render?.()
      }
    }

    refreshBlocks(workspace.getAllBlocks?.(false) ?? [])

    const flyout = workspace.getFlyout?.()
    const flyoutWs = flyout?.getWorkspace?.()
    refreshBlocks(flyoutWs?.getAllBlocks?.(false) ?? [])

    // Most robust fix: ask the toolbox to rebuild the open category's flyout,
    // sidestepping any stale block caching inside PXT/Blockly.
    workspace.getToolbox?.()?.refreshSelection?.()
  }

  /**
   * Invalidate a Blockly field's cached SVG text. Prefers forceRerender()
   * (Blockly v9+); falls back to setValue(getValue()) on older versions.
   */
  private refreshFieldDisplay(field: any): void {
    if (typeof field.forceRerender === 'function') {
      field.forceRerender()
      return
    }
    if (typeof field.setValue === 'function' && typeof field.getValue === 'function') {
      field.setValue(field.getValue())
    }
  }

  // --- Private: PXT Controller message handling --------------------------

  private handlePxtMessage(ev: MessageEvent): void {
    const msg = ev.data as Record<string, unknown> | null
    if (!msg) return

    // PXT editor sends 'pxthost' messages to the parent frame for requests
    if (msg.type === 'pxthost') {
      switch (msg.action) {
        case 'workspacesync':
          // PXT editor is requesting workspace data — respond with matching id
          this.pxtReady = true
          if (this.iframe) this.iframe.style.display = ''
          this.fallbackEditor?.hide()
          this.injectToolboxStyles()
          applyOnMachineIdleHatShape(this.getBlockly(), this.getBlocklyWorkspace())
          // Respond with a default project containing an on-start
          // block. This is required: returning an empty
          // `projects: []` array causes PXT to synthesize its own
          // default project with an empty `main.blocks` string,
          // which then fails `textToDom` parsing during the
          // subsequent `loadWorkspaceXml` call.
          // The x/y attrs on the block do NOT determine its final
          // position: PXT's `initLayout()` (in webapp/src/blocks.tsx)
          // normalizes top blocks by translating them so the one
          // closest to origin sits at (0, 0), then sets
          // editor.scrollX/Y = 10. We compensate for this in
          // `pinInitialViewport()` after init completes.
          const initialBlocks =
            '<xml xmlns="https://developers.google.com/blockly/xml">' +
            '<block type="pxt-on-start" x="0" y="0"></block>' +
            '</xml>'
          const projectText: Record<string, string> = {
            'main.ts': '',
            'main.blocks': initialBlocks,
            'pxt.json': JSON.stringify({
              name: 'factory',
              dependencies: { core: '*' },
              files: ['main.blocks', 'main.ts'],
            }),
          }
          if (this.pendingWorkspaceLoad) {
            const pending = this.pendingWorkspaceLoad
            projectText['main.ts'] = pending.ts
            if (typeof pending.blocks === 'string' && pending.blocks.length > 0) {
              projectText['main.blocks'] = pending.blocks
              this.armPendingDirectLoad(pending.blocks)
              // Defer initial direct Blockly inject until after PXT init
              // (the not-ready load path can't run it before pxtReady).
              this.pendingPostReadyDirectInject = pending.blocks
            } else {
              // Omit so PXT decompiles the TS back into blocks instead of
              // clobbering the canvas with empty/default XML.
              delete projectText['main.blocks']
            }
            this.pendingWorkspaceLoad = null
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
          this.postToEditor({
            type: 'pxthost',
            id: msg.id,
            success: true,
            resp: undefined,
            projects: [defaultProject],
          })
          // After a short delay to let PXT finish initializing, send toolbox + switch to blocks
          setTimeout(() => {
            this.setLevel(this.currentLevel)
            this.postToEditor({ type: 'pxteditor', action: 'switchblocks' })
            applyOnMachineIdleHatShape(this.getBlockly(), this.getBlocklyWorkspace())
            // Apply any pending machine/belt list updates that arrived before PXT was ready
            if (this.pendingMachineUpdate) this.updateMachineList(this.pendingMachineUpdate)
            if (this.pendingBeltUpdate) this.updateBeltList(this.pendingBeltUpdate)
            // Style toolbox rows after PXT has rendered them.
            setTimeout(() => this.styleToolboxRows(), 300)
            // Fire deferred direct Blockly inject for any load queued
            // before pxtReady (watchdog handles subsequent clobbers).
            if (this.pendingPostReadyDirectInject) {
              const xml = this.pendingPostReadyDirectInject
              this.pendingPostReadyDirectInject = null
              void this.loadBlocksWithRegistrationReady(xml)
            }
            // Override PXT's hardcoded `scrollX/Y = 10` post-load
            // viewport offset with our desired (30, 30) breathing
            // room so the on-start block isn't pressed against the
            // toolbox edge.
            this.pinInitialViewport(30, 30)
          }, 500)
          break

        case 'workspacesave': {
          const project = msg.project as Record<string, unknown> | undefined
          if (project) {
            const text = project.text as Record<string, string> | undefined
            const echoedBlocks = typeof text?.['main.blocks'] === 'string' ? text['main.blocks'] : undefined
            // Returns false on a decompile-clobbered echo for a protectPluggableConsumer load; skip the cache update so the migrated truth survives.
            if (this.maybeReapplyPendingDirectLoad(echoedBlocks)) {
              if (text?.['main.ts']) this.lastPxtSource = text['main.ts']
              if (echoedBlocks !== undefined) this.lastPxtBlocks = echoedBlocks
            }
          }
          // Respond to acknowledge
          if (msg.response) {
            this.postToEditor({
              type: 'pxthost',
              id: msg.id,
              success: true,
            })
          }
          break
        }

        case 'event':
          // Telemetry events — ignore silently
          break

        default:
          // Handle any other pxthost requests that require a response
          if (msg.response) {
            this.postToEditor({
              type: 'pxthost',
              id: msg.id,
              success: true,
            })
          }
          break
      }
    }

    // PXT editor can also send 'pxteditor' responses (response to our requests)
    if (msg.type === 'pxteditor' && msg.response) {
      const resp = msg.resp as Record<string, unknown> | undefined
      if (resp?.main) {
        this.lastPxtSource = resp.main as string
      }
      if (resp) {
        // Defensively capture any blocks XML PXT sends back. The exact key
        // varies between PXT controller versions ('main.blocks', 'blocks',
        // or a generic *.blocks file entry), so accept any string field
        // whose key ends in '.blocks' or equals 'blocks'.
        for (const [key, value] of Object.entries(resp)) {
          if (typeof value === 'string' && value.length > 0 && (key === 'blocks' || key.endsWith('.blocks'))) {
            this.lastPxtBlocks = value
            break
          }
        }
      }
    }

    // Resolve any pending flushPendingSaveAsync() awaiter keyed by id.
    // PXT controller responses to our `saveproject` may arrive in several
    // shapes (e.g. `{type:'pxteditor', response:true, id, ...}` or
    // `{type:'pxteditor', id, success:true}`), so match on type+id and
    // ignore the `response` flag here.
    if (msg.type === 'pxteditor') {
      const id = msg.id
      if (typeof id === 'string') {
        const resolver = this.pendingResponses.get(id)
        if (resolver) resolver()
      }
    }
  }

  /**
   * Inject CSS overrides into the PXT iframe to prevent MakeCode's
   * mobile responsive rules from collapsing the toolbox at narrow widths,
   * and to apply the Robot Factory dark theme. CSS rules live in
   * `./pxt-toolbox-overrides.css` and are imported as a raw string.
   */
  private injectToolboxStyles(): void {
    if (this.stylesInjected || !this.iframe) return
    let doc: Document
    try {
      doc = this.iframe.contentWindow!.document
    } catch { return }
    const style = doc.createElement('style')
    style.textContent = toolboxOverridesCss
    doc.head.appendChild(style)
    this.stylesInjected = true
  }

  /** Post a message to the PXT editor iframe. */
  private postToEditor(msg: Record<string, unknown>): void {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(msg, '*')
    }
  }

  /**
   * Style toolbox category rows to match the game's toolbar button design.
   * PXT's invertedToolbox sets background-color inline to the category color.
   * We read that color once, store it as a CSS custom property (--cat-color),
   * then clear all inline styles so our CSS !important rules take full control.
   */
  private styleToolboxRows(): void {
    if (!this.iframe) return
    let doc: Document
    try {
      doc = this.iframe.contentWindow!.document
    } catch { return }

    const cleanRow = (el: HTMLElement) => {
      // Preserve --cat-color if already set
      const existing = el.style.getPropertyValue('--cat-color')
      const catColor = el.style.backgroundColor
      if (!existing && catColor && catColor !== 'rgb(26, 29, 39)') {
        el.style.setProperty('--cat-color', catColor)
      }
      // Clear all inline styles that PXT sets so our CSS !important wins
      el.style.removeProperty('background-color')
      el.style.removeProperty('color')
      el.style.removeProperty('border-color')
      el.style.removeProperty('border-width')
      el.style.removeProperty('border-style')
      el.style.removeProperty('padding-left')
      el.style.removeProperty('padding-right')
    }

    // Initial pass
    const rows = doc.querySelectorAll('div.blocklyTreeRow')
    rows.forEach((row) => cleanRow(row as HTMLElement))

    // Watch for PXT re-applying inline styles (hover, click, category switch)
    if (this.toolboxObserver) {
      this.toolboxObserver.disconnect()
    }
    const toolboxDiv = doc.querySelector('.blocklyToolboxDiv')
    if (toolboxDiv) {
      this.toolboxObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'style') {
            const el = m.target as HTMLElement
            if (el.classList.contains('blocklyTreeRow')) {
              cleanRow(el)
            }
          }
        }
      })
      this.toolboxObserver.observe(toolboxDiv, {
        attributes: true,
        attributeFilter: ['style'],
        subtree: true,
      })
    }
  }

  /**
   * Pin the workspace viewport so the on-start block (which PXT's
   * `initLayout()` normalizes to workspace coords (0, 0)) appears
   * at viewport coords (dx, dy) — giving it visible breathing room
   * from the toolbox edge.
   *
   * PXT's `webapp/src/blocks.tsx::initLayout(xml)` does:
   *   1. translate every top block so the closest-to-origin sits
   *      at workspace (0, 0)
   *   2. `editor.scrollX = 10; editor.scrollY = 10;`
   *   3. `editor.resizeContents()` to commit
   *
   * This bypasses `WorkspaceSvg.scroll()` (which clamps to content
   * bounds), so we use the same direct property assignment.
   *
   * Strategy: poll briefly. PXT may run initLayout one or more
   * times during init (after toolbox switch, after switchblocks),
   * so we re-pin until the viewport stays at (dx, dy) for several
   * consecutive ticks, then stop.
   */
  private pinInitialViewport(dx: number, dy: number): void {
    const MAX_ATTEMPTS = 120 // ~3 seconds @ 25 ms
    const STABLE_TICKS_TO_STOP = 8
    const RETRY_MS = 25
    let stableTicks = 0
    const tryPin = (attempt: number): void => {
      const ws = this.getBlocklyWorkspace()
      const topBlocks: any[] = ws?.getTopBlocks?.(false) ?? []
      if (ws && topBlocks.length > 0) {
        // The (dx, dy) offset is relative to the workspace area
        // (the region to the right of the toolbox, below any top
        // chrome). Add the toolbox width (`absoluteLeft`) and any
        // top padding (`absoluteTop`) so the resulting SVG translate
        // places the on-start block to the RIGHT of the toolbox
        // instead of behind it.
        const m = ws.getMetrics?.() ?? { absoluteLeft: 0, absoluteTop: 0 }
        const absX = (m.absoluteLeft ?? 0) + dx
        const absY = (m.absoluteTop ?? 0) + dy
        if (ws.scrollX !== absX || ws.scrollY !== absY) {
          ws.scrollX = absX
          ws.scrollY = absY
          ws.resizeContents?.()
          // Force an SVG matrix redraw so the change is visible.
          ws.translate?.(absX, absY)
          stableTicks = 0
        } else {
          stableTicks++
        }
      }
      if (stableTicks >= STABLE_TICKS_TO_STOP) return
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => tryPin(attempt + 1), RETRY_MS)
      }
    }
    tryPin(0)
  }

  /** Return Blockly object inside the PXT iframe, or undefined. */
  private getBlockly(): any {
    const win = this.iframe?.contentWindow as any
    return win?.Blockly
  }

  /** Return the main Blockly workspace inside the PXT iframe, or undefined. */
  private getBlocklyWorkspace(): any {
    return this.getBlockly()?.getMainWorkspace?.()
  }

  private loadBlocksDirectly(blocksXml: string): boolean {
    if (!blocksXml) return false
    try {
      const Blockly: any = this.getBlockly()
      const ws: any = this.getBlocklyWorkspace()
      if (!Blockly?.Xml || !ws) return false
      const textToDom = Blockly.Xml.textToDom ?? Blockly.utils?.xml?.textToDom
      const domToWorkspace = Blockly.Xml.domToWorkspace ?? Blockly.Xml.appendDomToWorkspace
      if (typeof textToDom !== 'function' || typeof domToWorkspace !== 'function') return false
      const dom = textToDom(blocksXml)
      if (!dom) return false
      applyOnMachineIdleHatShape(Blockly, ws)
      ws.clear?.()
      domToWorkspace(dom, ws)
      return true
    } catch {
      return false
    }
  }

  /**
   * Replace the embedded Blockly workspace contents with the given XML.
   * PXT registers block definitions asynchronously after the
   * `workspacesync` handshake (it loads the initial project and only then
   * registers `pxt-on-start` and the `factory_*` blocks). If we try to
   * inject XML before that registration completes, `Blockly.Xml.domToWorkspace`
   * throws "Unknown block type" and silently aborts.
   *
   * This wrapper polls until every block type referenced in the XML has a
   * registered constructor in `Blockly.Blocks`, then calls
   * `loadBlocksDirectly`. Returns true on success, false on timeout.
   */
  private async loadBlocksWithRegistrationReady(
    blocksXml: string,
    timeoutMs = 5000,
  ): Promise<boolean> {
    if (!blocksXml) return false
    const uniqueTypes = this.extractBlockTypes(blocksXml)
    const start = Date.now()
    const POLL_MS = 50
    while (Date.now() - start < timeoutMs) {
      const Blockly: any = this.getBlockly()
      const registry = Blockly?.Blocks
      if (registry && uniqueTypes.every((t) => registry[t])) {
        return this.loadBlocksDirectly(blocksXml)
      }
      await new Promise<void>((r) => setTimeout(r, POLL_MS))
    }
    return false
  }

  /** Extract every `<block ... type="...">` type referenced in an XML string. */
  private extractBlockTypes(blocksXml: string): string[] {
    const matches = Array.from(blocksXml.matchAll(/<block[^>]*\stype="([^"]+)"/g)).map((m) => m[1])
    return Array.from(new Set(matches))
  }

  /** Extract every `<field name="X">VALUE</field>` pair (whitespace-tolerant). */
  private extractFieldOverrides(blocksXml: string): Array<{ name: string; value: string }> {
    const out: Array<{ name: string; value: string }> = []
    const re = /<field\s+name="([^"]+)"\s*>([^<]*)<\/field>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(blocksXml)) !== null) out.push({ name: m[1], value: m[2] })
    return out
  }

  /** Matches any `<block type="...">` whose type is one of the {@link PLUGGABLE_CONSUMER_BLOCK_TYPES} (slot carries a `factory_pick_*` reporter shadow that PXT's decompile clobber may drop on round-trip). The 6 IDs are `[a-z_]`-only so a bare `.join('|')` needs no per-char regex escaping. */
  private static readonly PLUGGABLE_CONSUMER_BLOCK_RE = new RegExp(
    `<block\\s[^>]*type\\s*=\\s*["'](?:${PLUGGABLE_CONSUMER_BLOCK_TYPES.join('|')})["']`,
  )

  /** Build/assign the `pendingDirectLoad` envelope. Used by both load entry points. */
  private armPendingDirectLoad(blocksXml: string): void {
    this.pendingDirectLoad = { expectedBlockTypes: this.extractBlockTypes(blocksXml), blocksXml, deadline: Date.now() + PxtEditor.DIRECT_LOAD_DEADLINE_MS, attempts: 0, protectPluggableConsumer: PxtEditor.PLUGGABLE_CONSUMER_BLOCK_RE.test(blocksXml) }
  }

  /** Post an `importproject` controller message carrying the given blocks XML and TS source. */
  private postImportProject(blocksXml: string, ts: string): void {
    const text: Record<string, string> = { 'main.ts': ts }
    if (blocksXml.length > 0) text['main.blocks'] = blocksXml
    this.postToEditor({ type: 'pxteditor', action: 'importproject', project: { text, name: 'factory' }, response: true })
  }

  /**
   * Re-inject the pending load on every PXT echo whose `main.blocks` is
   * missing an expected block type or `<field>` override (PXT's post-install
   * `loadHeaderAsync` decompiles `main.ts` and may drop orphan blocks AND
   * the `factory_pick_*` shadow on any of the 6 pluggable consumer blocks).
   * Generic loads honor `DIRECT_LOAD_MAX_ATTEMPTS=5` (PXT's clobber there is
   * one-shot). `protectPluggableConsumer` loads run only against the 4 s deadline
   * \u2014 the saved TS (`<fn>(N, \u2026)`) is invariant so PXT keeps clobbering;
   * re-injection is the only path that converges the live workspace back
   * to the loaded XML and the cache is also pinned (return false) so
   * `lastPxtSource` keeps the load-time good TS.
   */
  private maybeReapplyPendingDirectLoad(echoedBlocksXml: string | undefined): boolean {
    const pending = this.pendingDirectLoad
    if (!pending) return true
    if (Date.now() > pending.deadline) { this.pendingDirectLoad = null; return true }
    const echoed = typeof echoedBlocksXml === 'string' ? echoedBlocksXml : ''
    const echoedTypes = new Set(this.extractBlockTypes(echoed))
    const missingTypes = pending.expectedBlockTypes.filter((t) => !echoedTypes.has(t))
    const echoedFieldKeys = new Set(this.extractFieldOverrides(echoed).map((f) => `${f.name}=${f.value}`))
    const missingFields = this.extractFieldOverrides(pending.blocksXml).filter((f) => !echoedFieldKeys.has(`${f.name}=${f.value}`))
    if (missingTypes.length === 0 && missingFields.length === 0) { this.pendingDirectLoad = null; return true }
    if (!pending.protectPluggableConsumer && pending.attempts >= PxtEditor.DIRECT_LOAD_MAX_ATTEMPTS) { this.pendingDirectLoad = null; return true }
    pending.attempts++
    setTimeout(() => {
      const current = this.pendingDirectLoad
      if (!current) return
      if (!this.loadBlocksDirectly(current.blocksXml) && !current.protectPluggableConsumer) {
        this.postImportProject(current.blocksXml, this.lastPxtSource)
      }
      if (!current.protectPluggableConsumer) {
        this.lastPxtBlocks = current.blocksXml
        this.lastPxtSource = ''
      }
      this.postToEditor({ type: 'pxteditor', action: 'saveproject', response: false })
    }, 0)
    return !pending.protectPluggableConsumer
  }

  // --- DEV diagnostics seam (consumed by `__test` in main.ts) ----------
  /** DEV-only: snapshot of editor load-pipeline state. */
  getDevDiagnostics(): { pxtReady: boolean; hasPendingLoad: boolean; protectPluggableConsumer: boolean; lastPxtBlocks: string } {
    return { pxtReady: this.pxtReady, hasPendingLoad: this.pendingDirectLoad !== null, protectPluggableConsumer: this.pendingDirectLoad?.protectPluggableConsumer ?? false, lastPxtBlocks: this.lastPxtBlocks }
  }
  /** DEV-only: serialize the live Blockly main workspace XML, or null if PXT iframe isn't ready. */
  getLiveWorkspaceXml(): string | null {
    if (!this.pxtReady) return null
    const xml = this.readLiveBlocksXml()
    return xml === '' ? null : xml
  }

}
