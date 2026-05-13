/**
 * @vitest-environment jsdom
 *
 * RED-step test for the new "canvas-container physically shrinks when the
 * PXT editor panel is open" contract.
 *
 * EXPECTED FIX (locked by these tests):
 *   `createEditorVisibilityController.open()` writes
 *   `document.body.style.setProperty('--rf-canvas-right', '<editorWidth>px')`
 *   so the canvas container (which switches from `inset:0` to using the var
 *   for its right inset) physically reflows to sit between the editor panel
 *   and the viewport edge.
 *
 *   `close()` writes `--rf-canvas-right: 0px` so the canvas reflows back to
 *   full width.
 *
 *   The CSS variable MUST be written BEFORE `refitCamera()` is invoked so
 *   the camera-fit math observes the post-reflow layout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditorVisibilityController } from '../../../src/ui/createEditorVisibilityController'

interface Fake {
  editorContainer: HTMLElement
  resizeHandle: HTMLElement
  pxtEditor: {
    show: ReturnType<typeof vi.fn<() => void>>
    hide: ReturnType<typeof vi.fn<() => void>>
  }
  refitCamera: ReturnType<typeof vi.fn<() => void>>
  onOpenChange: ReturnType<typeof vi.fn<(open: boolean) => void>>
  setEditorContainerWidth: (width: number) => void
}

function makeFake(initialWidth = 500): Fake {
  const editorContainer = document.createElement('div')
  const resizeHandle = document.createElement('div')
  document.body.appendChild(editorContainer)
  document.body.appendChild(resizeHandle)

  // jsdom returns 0 for clientWidth by default. Install a live-mutable
  // getter so the test can simulate CSS-driven width changes.
  let cw = initialWidth
  Object.defineProperty(editorContainer, 'clientWidth', {
    configurable: true,
    get: () => cw,
  })

  return {
    editorContainer,
    resizeHandle,
    pxtEditor: { show: vi.fn<() => void>(), hide: vi.fn<() => void>() },
    refitCamera: vi.fn<() => void>(),
    onOpenChange: vi.fn<(open: boolean) => void>(),
    setEditorContainerWidth: (width) => {
      cw = width
    },
  }
}

function build(fake: Fake) {
  return createEditorVisibilityController({
    editorContainer: fake.editorContainer,
    resizeHandle: fake.resizeHandle,
    pxtEditor: fake.pxtEditor,
    refitCamera: fake.refitCamera,
    onOpenChange: fake.onOpenChange,
  })
}

describe('createEditorVisibilityController — --rf-canvas-right CSS variable', () => {
  let fake: Fake

  beforeEach(() => {
    fake = makeFake(500)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
  })

  describe('open()', () => {
    it('sets --rf-canvas-right on document.body to the editor container measured width as a px string', () => {
      // GIVEN an editor container with clientWidth = 500
      const ctrl = build(fake)

      // WHEN the editor opens
      ctrl.open()

      // THEN the body inline style exposes the canvas right inset as a px string
      expect(document.body.style.getPropertyValue('--rf-canvas-right')).toBe('500px')
    })

    it('measures the editor width fresh each call (does not cache from construction)', () => {
      // GIVEN the controller was built when the editor was 500 wide
      const ctrl = build(fake)

      // WHEN the editor container's width changes (e.g. CSS rule rewrites or
      // a previous resize-drag) and open() is called afterwards
      fake.setEditorContainerWidth(720)
      ctrl.open()

      // THEN the freshly measured 720px appears in the var, not the
      // construction-time 500px.
      expect(document.body.style.getPropertyValue('--rf-canvas-right')).toBe('720px')
    })

    it('calls pxtEditor.show(), refitCamera, and onOpenChange(true)', () => {
      const ctrl = build(fake)

      ctrl.open()

      expect(fake.pxtEditor.show).toHaveBeenCalledTimes(1)
      expect(fake.refitCamera).toHaveBeenCalledTimes(1)
      expect(fake.onOpenChange).toHaveBeenCalledTimes(1)
      expect(fake.onOpenChange).toHaveBeenCalledWith(true)
    })

    it('writes the CSS variable BEFORE refitCamera runs (post-reflow ordering)', () => {
      // GIVEN refitCamera spies on the live var value at the moment it is invoked
      let varAtRefitTime: string | null = null
      fake.refitCamera = vi.fn<() => void>(() => {
        varAtRefitTime = document.body.style.getPropertyValue('--rf-canvas-right')
      })
      const ctrl = createEditorVisibilityController({
        editorContainer: fake.editorContainer,
        resizeHandle: fake.resizeHandle,
        pxtEditor: fake.pxtEditor,
        refitCamera: fake.refitCamera,
        onOpenChange: fake.onOpenChange,
      })

      // WHEN open() runs
      ctrl.open()

      // THEN refitCamera observed the post-reflow var, not the pre-reflow empty string.
      expect(varAtRefitTime).toBe('500px')
    })
  })

  describe('close()', () => {
    it('sets --rf-canvas-right to "0px" explicitly (not unset/empty) so the canvas reflows back to full width', () => {
      const ctrl = build(fake)
      ctrl.open()

      ctrl.close()

      // The contract requires the explicit "0px" value so any consumer of the
      // var (e.g. CSS calc(...)) gets a defined length, not the fallback path.
      expect(document.body.style.getPropertyValue('--rf-canvas-right')).toBe('0px')
    })

    it('calls pxtEditor.hide(), refitCamera, and onOpenChange(false)', () => {
      const ctrl = build(fake)
      ctrl.open()
      fake.pxtEditor.show.mockClear()
      fake.pxtEditor.hide.mockClear()
      fake.refitCamera.mockClear()
      fake.onOpenChange.mockClear()

      ctrl.close()

      expect(fake.pxtEditor.hide).toHaveBeenCalledTimes(1)
      expect(fake.refitCamera).toHaveBeenCalledTimes(1)
      expect(fake.onOpenChange).toHaveBeenCalledTimes(1)
      expect(fake.onOpenChange).toHaveBeenCalledWith(false)
    })

    it('writes "0px" BEFORE refitCamera runs (post-reflow ordering)', () => {
      // GIVEN open() has already set the var to 500px
      const ctrl = build(fake)
      ctrl.open()

      let varAtRefitTime: string | null = null
      fake.refitCamera.mockImplementation(() => {
        varAtRefitTime = document.body.style.getPropertyValue('--rf-canvas-right')
      })

      // WHEN close() runs
      ctrl.close()

      // THEN refitCamera observed the cleared var, not the still-500px value.
      expect(varAtRefitTime).toBe('0px')
    })
  })

  describe('toggle()', () => {
    it('flips between open and closed and the CSS variable follows', () => {
      const ctrl = build(fake)

      // initially the body has no inline var
      expect(document.body.style.getPropertyValue('--rf-canvas-right')).toBe('')

      ctrl.toggle() // → open
      expect(document.body.style.getPropertyValue('--rf-canvas-right')).toBe('500px')

      ctrl.toggle() // → close
      expect(document.body.style.getPropertyValue('--rf-canvas-right')).toBe('0px')

      ctrl.toggle() // → open again
      expect(document.body.style.getPropertyValue('--rf-canvas-right')).toBe('500px')
    })
  })
})
