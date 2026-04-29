/**
 * @vitest-environment jsdom
 *
 * Save/load round-trip tests for PxtEditor.
 *
 * SCOPE:
 *   These tests cover the JSON envelope contract of `getWorkspaceXml()` /
 *   `loadWorkspaceXml()` plus backward-compatibility for legacy plain-TS
 *   saves on user disks. The "blocks survive page refresh" end-to-end
 *   guarantee is owned by the Playwright `Save / Reload Round-Trip` spec
 *   in `tests/e2e/PxtEditor.spec.ts` — internal mechanism probes
 *   (pre-ready queueing, live Blockly fallback chain, importproject vs.
 *   direct-inject branch selection, flushPendingSaveAsync plumbing) used
 *   to live here as scaffolding during the bug hunt and have been removed
 *   in favour of that single end-to-end assertion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PxtEditor } from '../../../src/editor/PxtEditor'

function dispatchPxtMessage(data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data }))
}

function findImportProjectCall(spy: ReturnType<typeof vi.fn>): Record<string, unknown> | undefined {
  const call = spy.mock.calls.find((args: unknown[]) => {
    const msg = args[0] as Record<string, unknown> | null
    return !!msg && msg.type === 'pxteditor' && msg.action === 'importproject'
  })
  return call ? (call[0] as Record<string, unknown>) : undefined
}

/** Yield to the microtask + setTimeout(0) queue used by load fallbacks. */
function flushAsync(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 80))
}

describe('PxtEditor workspace save/load round-trip', () => {
  let editor: PxtEditor
  let container: HTMLDivElement
  let postSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    editor = new PxtEditor()
    editor.mount(container)

    // jsdom does not actually load the PXT iframe src, so the iframe's
    // document has no <head>/<body>. `injectToolboxStyles()` (called from
    // the workspacesync handler) appends a <style> to `doc.head`, which
    // would crash. Seed a minimal HTML document so the path is exercised
    // safely without affecting any assertion under test.
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const doc = iframe.contentWindow!.document
    doc.open()
    doc.write('<!doctype html><html><head></head><body></body></html>')
    doc.close()

    // Drive PXT into the "ready" state. The workspacesync handler sets
    // `pxtReady = true` and posts a default project response back via the
    // ORIGINAL `iframe.contentWindow.postMessage` — that's why we install
    // the spy AFTER this call.
    dispatchPxtMessage({ type: 'pxthost', action: 'workspacesync', id: 'sync-1' })

    expect(iframe?.contentWindow, 'iframe contentWindow must exist in jsdom').toBeTruthy()

    postSpy = vi.fn()
    ;(iframe.contentWindow as unknown as { postMessage: unknown }).postMessage = postSpy
  })

  afterEach(() => {
    editor.dispose()
    if (container.parentNode) container.parentNode.removeChild(container)
    vi.restoreAllMocks()
  })

  describe('getWorkspaceXml()', () => {
    it('serializes BOTH main.ts and main.blocks after a workspacesave message', () => {
      // GIVEN a workspacesave from PXT carrying both compiled TS and blocks XML.
      const blocksXml =
        '<xml xmlns="https://developers.google.com/blockly/xml">' +
        '<block type="pxt-on-start" x="0" y="0">' +
        '<statement name="HANDLER">' +
        '<block type="factory_set_recipe">' +
        '<field name="machine">Machine.A</field>' +
        '<field name="recipe">Recipe.WheelPressSmall</field>' +
        '</block></statement></block></xml>'
      const tsSource = 'factory.setRecipe("A", "WheelPressSmall")'

      // WHEN
      dispatchPxtMessage({
        type: 'pxthost',
        action: 'workspacesave',
        project: { text: { 'main.ts': tsSource, 'main.blocks': blocksXml } },
      })

      // THEN — the saved string must round-trip via JSON to an envelope
      // containing BOTH fields.
      const saved = editor.getWorkspaceXml()
      expect(saved).not.toBe('')

      const parsed = JSON.parse(saved) as { ts?: string; blocks?: string }
      expect(parsed.ts).toBe(tsSource)
      expect(parsed.blocks).toBe(blocksXml)
    })

    it('returns "" when neither lastPxtSource nor lastPxtBlocks have been populated', () => {
      // No workspacesave dispatched in this test — only the workspacesync
      // from beforeEach. The AutoSave layer relies on '' meaning "nothing
      // to persist"; emitting `{"ts":"","blocks":""}` would defeat that.
      expect(editor.getWorkspaceXml()).toBe('')
    })
  })

  describe('loadWorkspaceXml()', () => {
    it('accepts a legacy plain TS string (non-JSON) without throwing', async () => {
      // Backward compatibility: existing saves on user disks are raw TS
      // strings, not JSON envelopes. They must continue to load.
      const legacy = 'factory.startMachine("press_1")'

      expect(() => editor.loadWorkspaceXml(legacy)).not.toThrow()
      await flushAsync()

      const importMsg = findImportProjectCall(postSpy)
      expect(importMsg, 'no importproject message was posted to the iframe').toBeDefined()

      const project = (importMsg as { project?: { text?: Record<string, string> } }).project
      expect(project?.text?.['main.ts']).toBe(legacy)

      // The spec requires `main.blocks` NOT be the empty string '' (which is
      // exactly the value the buggy implementation sends, and which prevents
      // PXT from decompiling the TS into blocks). The implementation may
      // either omit the key entirely (preferred per the task spec) or fall
      // back to sending the legacy text in both fields. Either is acceptable;
      // the empty string '' is NOT.
      const blocksField = project?.text?.['main.blocks']
      expect(blocksField).not.toBe('')
    })
  })
})
