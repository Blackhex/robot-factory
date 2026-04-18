import i18next from 'i18next'
import type { SimulationCommand } from '../game/types'
import { BlockInterpreter } from './BlockInterpreter'
import { getToolboxForLevel } from './FactoryToolbox'
import { buildDropdownOptions, resolveDropdownText, type DropdownItem } from './dropdownOptions'

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
  private fallbackEl: HTMLDivElement | null = null
  private fallbackTextarea: HTMLTextAreaElement | null = null
  readonly interpreter = new BlockInterpreter()
  private currentLevel = 1
  private pxtReady = false
  private lastPxtSource = ''
  private messageHandler: ((ev: MessageEvent) => void) | null = null
  private pendingMachineUpdate: Array<{id: string, name: string, type: string}> | null = null
  private pendingBeltUpdate: Array<{id: string, name: string, sourceName: string, destName: string}> | null = null
  private prototypePatched = false
  private textPatched = false
  private stylesInjected = false
  private toolboxObserver: MutationObserver | null = null

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
    this.fallbackEl = document.createElement('div')
    this.fallbackEl.className = 'pxt-editor-fallback'
    this.fallbackEl.style.width = '100%'
    this.fallbackEl.style.height = '100%'
    this.fallbackEl.style.display = 'flex'
    this.fallbackEl.style.flexDirection = 'column'

    const label = document.createElement('div')
    label.className = 'pxt-editor-fallback-label'
    label.textContent = 'Factory Program (TypeScript)'
    label.style.padding = '8px'
    label.style.fontWeight = 'bold'
    label.style.borderBottom = '1px solid #444'
    this.fallbackEl.appendChild(label)

    this.fallbackTextarea = document.createElement('textarea')
    this.fallbackTextarea.className = 'pxt-editor-fallback-textarea'
    this.fallbackTextarea.spellcheck = false
    this.fallbackTextarea.placeholder =
      '// Type factory commands here:\n' +
      '// factory.startMachine("press_1")\n' +
      '// factory.setRecipe("press_1", Recipe.WheelPressSmall)'
    Object.assign(this.fallbackTextarea.style, {
      flex: '1',
      resize: 'none',
      fontFamily: 'monospace',
      fontSize: '14px',
      padding: '8px',
      border: 'none',
      outline: 'none',
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4',
    })
    this.fallbackEl.appendChild(this.fallbackTextarea)
    container.appendChild(this.fallbackEl)

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
    } else if (this.fallbackTextarea) {
      source = this.fallbackTextarea.value
    }

    if (!source.trim()) return []

    this.interpreter.reset()
    const commands = this.interpreter.interpret(source)

    if (this.interpreter.getOverflowOccurred()) {
      console.warn('[PxtEditor] Interpreter overflow — program too long')
    }

    console.log('[PxtEditor] Generated program:', commands)
    return commands
  }

  /**
   * Trigger a registered event handler and return the commands
   * produced by its body.
   */
  triggerEvent(eventType: string): SimulationCommand[] {
    return this.interpreter.triggerEvent(eventType)
  }

  /** Get the current workspace state for save/load. */
  getWorkspaceXml(): string {
    if (this.pxtReady) {
      return this.lastPxtSource
    }
    return this.fallbackTextarea?.value ?? ''
  }

  /** Restore a previously saved workspace state. */
  loadWorkspaceXml(xml: string): void {
    if (this.pxtReady) {
      this.postToEditor({
        type: 'pxteditor',
        action: 'importproject',
        project: { text: { 'main.ts': xml, 'main.blocks': '' }, name: 'factory' },
        response: true,
      })
    }
    if (this.fallbackTextarea) {
      this.fallbackTextarea.value = xml
    }
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
    if (this.fallbackEl) {
      this.fallbackEl.remove()
      this.fallbackEl = null
    }
    this.fallbackTextarea = null
    this.container = null
  }

  // --- Dynamic machine/belt dropdown updates -----------------------------

  /** Machine block types that use the Machine enum dropdown. */
  private static readonly MACHINE_BLOCK_TYPES = [
    'factory_start_machine', 'factory_stop_machine',
    'factory_set_recipe', 'factory_on_machine_idle',
    'factory_pick_machine',
  ]

  /** Belt block types that use the Belt enum dropdown. */
  private static readonly BELT_BLOCK_TYPES = [
    'factory_set_belt_speed',
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
          if (this.fallbackEl) this.fallbackEl.style.display = 'none'
          this.injectToolboxStyles()
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
            text: {
              'main.ts': '',
              'main.blocks': initialBlocks,
              'pxt.json': JSON.stringify({
                name: 'factory',
                dependencies: { core: '*' },
                files: ['main.blocks', 'main.ts'],
              }),
            },
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
            // Apply any pending machine/belt list updates that arrived before PXT was ready
            if (this.pendingMachineUpdate) {
              this.updateMachineList(this.pendingMachineUpdate)
            }
            if (this.pendingBeltUpdate) {
              this.updateBeltList(this.pendingBeltUpdate)
            }
            // Style toolbox rows after PXT has rendered them.
            setTimeout(() => this.styleToolboxRows(), 300)
            // Override PXT's hardcoded `scrollX/Y = 10` post-load
            // viewport offset with our desired (30, 30) breathing
            // room so the on-start block isn't pressed against the
            // toolbox edge.
            this.pinInitialViewport(30, 30)
          }, 500)
          break

        case 'workspacesave': {
          // PXT sends compiled code when workspace is saved
          const project = msg.project as Record<string, unknown> | undefined
          if (project) {
            const text = project.text as Record<string, string> | undefined
            if (text?.['main.ts']) {
              this.lastPxtSource = text['main.ts']
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
    }
  }

  /**
   * Inject CSS overrides into the PXT iframe to prevent MakeCode's
   * mobile responsive rules from collapsing the toolbox at narrow widths.
   */
  private injectToolboxStyles(): void {
    if (this.stylesInjected || !this.iframe) return
    let doc: Document
    try {
      doc = this.iframe.contentWindow!.document
    } catch { return }
    const style = doc.createElement('style')
    style.textContent = `
      @media only screen and (max-width: 767px) {
        span.blocklyTreeLabel {
          display: inline !important;
          font-size: 1rem;
        }
        div.blocklyToolboxDiv, div.monacoToolboxDiv {
          min-width: 150px;
        }
        div.blocklyTreeRow {
          min-height: 40px;
          border-left-width: 12px !important;
        }
        span.blocklyTreeIcon {
          line-height: 40px;
          min-height: 40px;
        }
        #root:not(.flyoutOnly) #blocklyTrashIcon {
          width: 150px;
        }
      }

      /* === Dark theme to match Robot Factory UI === */

      /* Constrain PXT layout to iframe bounds */
      html, body {
        height: 100% !important;
        width: 100% !important;
        overflow: hidden !important;
        position: relative !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      #allcontent {
        height: 100% !important;
        max-height: 100% !important;
        overflow: hidden !important;
      }

      /* Main editor background */
      #root, #maineditor {
        background: #0f1117 !important;
      }
      svg.blocklySvg {
        background: #0f1117 !important;
      }
      .blocklyMainBackground {
        fill: #0f1117 !important;
      }

      /* Hide PXT chrome we don't use */
      #mainmenu, #editortools, #downloadArea, #filelist,
      #editorSidebar, #simulator, .simView, #boardview,
      .tutorial-container, #tutorialcard {
        display: none !important;
      }

      /* Reclaim space from hidden menu bar, sidebar, and editor tools */
      #maineditor {
        top: 0 !important;
        left: 0 !important;
      }
      #blocksArea, #monacoEditor, #assetEditor, #pxtJsonEditor, #serialEditor {
        bottom: 0 !important;
      }

      /* Toolbox dark styling */
      .blocklyToolboxDiv, .monacoToolboxDiv {
        background: #1a1d27 !important;
        border-right: 1px solid #2e3140 !important;
        color: #e0e0e6 !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      .blocklyToolboxDiv::-webkit-scrollbar,
      .monacoToolboxDiv::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }

      /* Toolbox row styling — match game toolbar buttons.
         --cat-color is set per-row by JS from PXT's category color. */
      div.blocklyTreeRow {
        margin: 8px 6px !important;
        padding: 0 10px !important;
        border-radius: 8px !important;
        border: 1px solid var(--cat-color, #2e3140) !important;
        background-color: #1a1d27 !important;
        color: var(--cat-color, #e0e0e6) !important;
        transition: background-color 150ms ease !important;
        height: 2.5rem !important;
        min-height: 2.5rem !important;
        max-height: 2.5rem !important;
        line-height: 2.5rem !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
        display: flex !important;
        align-items: center !important;
      }

      /* Non-selected row hover — subtle fill, keep text color */
      div.blocklyTreeRow:not(.blocklyTreeSelected):hover {
        background-color: #252836 !important;
        color: var(--cat-color, #e0e0e6) !important;
      }

      /* Selected row — accent tinted background */
      div.blocklyTreeRow.blocklyTreeSelected,
      div.blocklyTreeRow.blocklyTreeSelected:hover {
        background-color: rgba(79, 195, 247, 0.15) !important;
        color: #fff !important;
      }

      /* Toolbox label text — inherit category color from row */
      span.blocklyTreeLabel {
        color: inherit !important;
        font-family: 'Segoe UI', system-ui, Roboto, sans-serif !important;
        font-weight: 500 !important;
        font-size: 0.875rem !important;
        display: inline !important;
      }

      /* Toolbox icon — inherit category color and match row height */
      span.blocklyTreeIcon {
        line-height: 2.5rem !important;
        min-height: 2.5rem !important;
        height: 2.5rem !important;
        color: inherit !important;
      }

      /* Ensure label stays visible on hover — must match PXT's
         specificity for the .blocklyTreeSelected:hover case,
         which uses (0,0,3,2) to set display:none in <=767px. */
      div.blocklyTreeRow:hover span.blocklyTreeLabel {
        display: inline !important;
        color: inherit !important;
      }

      div.blocklyTreeRow.blocklyTreeSelected span.blocklyTreeLabel,
      div.blocklyTreeRow.blocklyTreeSelected:hover span.blocklyTreeLabel {
        display: inline !important;
        color: #fff !important;
      }

      /* Flyout background — higher specificity to beat invertedToolbox */
      svg.blocklyFlyout path.blocklyFlyoutBackground {
        fill: #0f1117 !important;
        fill-opacity: 0.97 !important;
      }

      /* Flyout label text */
      .blocklyFlyoutLabelText {
        fill: #8b8fa3 !important;
      }
      .blocklyFlyoutButton .blocklyText {
        fill: #e0e0e6 !important;
      }
      .blocklyFlyoutButtonBackground {
        fill: #252836 !important;
        stroke: #2e3140 !important;
      }

      /* Scrollbars */
      .blocklyScrollbarHandle {
        fill: #2e3140 !important;
      }
      .blocklyScrollbarBackground:hover + .blocklyScrollbarHandle,
      .blocklyScrollbarHandle:hover {
        fill: #4fc3f7 !important;
      }

      /* Grid pattern — subtle dark dots */
      .blocklyGridLine {
        stroke: #2e3140 !important;
      }

      /* Blockly workspace scrollbar track */
      .blocklyScrollbarBackground {
        fill: transparent !important;
      }

      /* Right-click context menu */
      .blocklyWidgetDiv .blocklyMenu {
        background: #1a1d27 !important;
        border: 1px solid #2e3140 !important;
        border-radius: 8px !important;
        overflow: hidden;
      }
      .blocklyWidgetDiv .blocklyMenuItem {
        color: #e0e0e6 !important;
      }
      .blocklyWidgetDiv .blocklyMenuItemHighlight {
        background: #252836 !important;
      }

      /* Blockly trash icon */
      #blocklyTrashIcon {
        color: #2e3140 !important;
      }

      /* Search input dark styling — margin matches toolbox row margins */
      #blocklySearchArea {
        background: #1a1d27 !important;
        margin: 8px 6px !important;
        box-sizing: border-box !important;
      }
      #blocklySearchInput {
        background: #1a1d27 !important;
      }
      #blocklySearchInputField {
        background: #1a1d27 !important;
        color: #e0e0e6 !important;
        border: 1px solid #2e3140 !important;
        border-radius: 4px !important;
        padding-left: 10px !important;
        padding-right: 10px !important;
      }
      #blocklySearchInputField::placeholder {
        color: #8b8fa3 !important;
      }
      #blocklySearchInput i.icon {
        color: #8b8fa3 !important;
      }

      /* Field dropdown styling */
      .blocklyDropDownDiv {
        border-color: #2e3140 !important;
      }

      /* Ensure block labels are visible on dark background.
         Exclude editable fields (number/text inputs), which render on a
         white input background and need dark text. */
      .blocklyText {
        fill: #fff !important;
      }
      .blocklyEditableText > .blocklyText,
      .blocklyHtmlInput {
        fill: #1a1d27 !important;
        color: #1a1d27 !important;
      }

      /* Make the main workspace div use full space */
      .injectionDiv {
        background: transparent !important;
      }
    `
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
        if (ws.scrollX !== dx || ws.scrollY !== dy) {
          ws.scrollX = dx
          ws.scrollY = dy
          ws.resizeContents?.()
          // Force an SVG matrix redraw so the change is visible.
          ws.translate?.(dx, dy)
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

}
