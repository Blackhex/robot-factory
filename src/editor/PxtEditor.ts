import type { SimulationCommand } from '../game/types'
import { BlockInterpreter } from './BlockInterpreter'
import { getToolboxForLevel } from './FactoryToolbox'

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
 * commands directly. The BlockInterpreter parses whichever source
 * is available.
 */
export class PxtEditor {
  private container: HTMLElement | null = null
  private iframe: HTMLIFrameElement | null = null
  private fallbackEl: HTMLDivElement | null = null
  private fallbackTextarea: HTMLTextAreaElement | null = null
  private interpreter = new BlockInterpreter()
  private currentLevel = 1
  private pxtReady = false
  private lastPxtSource = ''
  private messageHandler: ((ev: MessageEvent) => void) | null = null

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
      '// factory.producePart("press_1", PartType.WheelSmall)\n' +
      '// factory.setRecipe("assembler", "basic_wheel")'
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
    }
  }

  show(): void {
    if (this.container) {
      this.container.style.display = ''
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

  // --- Private: PXT Controller message handling --------------------------

  private handlePxtMessage(ev: MessageEvent): void {
    const msg = ev.data as Record<string, unknown> | null
    if (!msg) return

    // PXT editor sends 'pxthost' messages to the parent frame for requests
    if (msg.type === 'pxthost') {
      switch (msg.action) {
        case 'workspacesync':
          // PXT editor is requesting workspace data — respond with matching id
          console.log('[PxtEditor] PXT workspacesync request received')
          this.pxtReady = true
          if (this.iframe) this.iframe.style.display = ''
          if (this.fallbackEl) this.fallbackEl.style.display = 'none'
          // Respond with correct protocol: same type, same id, projects array
          this.postToEditor({
            type: 'pxthost',
            id: msg.id,
            success: true,
            resp: undefined,
            projects: [],
          })
          // After a short delay to let PXT finish initializing, send toolbox + switch to blocks
          setTimeout(() => {
            this.setLevel(this.currentLevel)
            this.postToEditor({ type: 'pxteditor', action: 'switchblocks' })
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

  /** Post a message to the PXT editor iframe. */
  private postToEditor(msg: Record<string, unknown>): void {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(msg, '*')
    }
  }
}
