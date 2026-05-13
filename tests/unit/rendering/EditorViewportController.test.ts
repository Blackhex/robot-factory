/**
 * @vitest-environment jsdom
 *
 * RED-step regression test for the editor-toggle viewport-sync bug.
 *
 * BUG: When the PXT editor opens or closes, the canvas container's
 * `clientWidth` reflows (CSS-driven), but neither a `window.resize` event
 * fires nor does `SceneManager.resize(width, height)` get called. As a
 * result the Three.js camera/renderer aspect ratio becomes stale relative
 * to the live canvas rect, causing world→screen projection drift and
 * pointer→cell raycast inconsistency (clicks resolve to adjacent cells).
 *
 * EXPECTED FIX (locked by these tests):
 *   `EditorViewportController` gains an `onResize(width, height)` callback
 *   dep. Whenever `refitCameraToCurrentLevel()` runs, the controller also
 *   invokes `onResize` with the live container dimensions so the renderer
 *   and camera stay in sync with the post-reflow CSS layout.
 *
 * The callback dep was chosen over a direct `SceneManager` dep so the
 * controller stays decoupled from Three.js (the renderer layer) and so
 * tests can spy on the side effect without instantiating WebGL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EditorViewportController,
  type EditorViewportDeps,
} from '../../../src/rendering/EditorViewportController'

interface MockCameraController {
  zoomToFit: ReturnType<typeof vi.fn>
}

interface ResizeFake {
  canvasContainer: HTMLElement
  editorContainer: HTMLElement
  resizeHandle: HTMLElement
  cameraController: MockCameraController
  onResize: ReturnType<typeof vi.fn<(width: number, height: number) => void>>
  setContainerSize: (width: number, height: number) => void
  setEditorWidth: (width: number) => void
}

function makeFake(): ResizeFake {
  const canvasContainer = document.createElement('div')
  const editorContainer = document.createElement('div')
  const resizeHandle = document.createElement('div')
  document.body.appendChild(canvasContainer)
  document.body.appendChild(editorContainer)
  document.body.appendChild(resizeHandle)

  // jsdom returns 0 for clientWidth/Height by default. Install live-mutable
  // getters so the test can simulate CSS reflow on editor toggle.
  let cw = 0
  let ch = 0
  Object.defineProperty(canvasContainer, 'clientWidth', {
    configurable: true,
    get: () => cw,
  })
  Object.defineProperty(canvasContainer, 'clientHeight', {
    configurable: true,
    get: () => ch,
  })

  // jsdom returns a 0×0 DOMRect by default. Install a live-mutable rect so
  // the test can simulate the editor panel taking up part of the viewport.
  let editorRectWidth = 0
  editorContainer.getBoundingClientRect = (): DOMRect => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: editorRectWidth,
    bottom: 0,
    width: editorRectWidth,
    height: 0,
    toJSON: () => ({}),
  })

  return {
    canvasContainer,
    editorContainer,
    resizeHandle,
    cameraController: { zoomToFit: vi.fn() },
    onResize: vi.fn<(width: number, height: number) => void>(),
    setContainerSize: (width, height) => {
      cw = width
      ch = height
    },
    setEditorWidth: (width) => {
      editorRectWidth = width
    },
  }
}

function buildController(fake: ResizeFake): EditorViewportController {
  const deps: EditorViewportDeps = {
    canvasContainer: fake.canvasContainer,
    editorContainer: fake.editorContainer,
    resizeHandle: fake.resizeHandle,
    // The controller only ever reads `cameraController.zoomToFit`, so the
    // structural mock is sufficient.
    cameraController: fake.cameraController as unknown as EditorViewportDeps['cameraController'],
    getFactorySize: () => ({ width: 10, height: 10 }),
    onResize: fake.onResize,
  }
  return new EditorViewportController(deps)
}

describe('EditorViewportController — editor-toggle viewport sync (BUG)', () => {
  let fake: ResizeFake
  let controller: EditorViewportController

  beforeEach(() => {
    fake = makeFake()
    controller = buildController(fake)
  })

  afterEach(() => {
    controller.dispose()
    document.body.innerHTML = ''
  })

  it('should notify onResize with new container dimensions when the editor OPENS', () => {
    // GIVEN a 1600×900 canvas with the editor closed, the controller starts
    // in "no editor" state. We seed an initial refit so any baseline call
    // is recorded, then clear the spy.
    fake.setContainerSize(1600, 900)
    fake.setEditorWidth(0)
    controller.refitCameraToCurrentLevel()
    fake.onResize.mockClear()

    // WHEN the editor opens, CSS reflow narrows the visible canvas region.
    // (In production the canvas container's clientWidth shrinks because the
    // editor panel docks to the right of the layout.) main.ts reacts by
    // calling editorViewport.refitCameraToCurrentLevel().
    fake.setContainerSize(960, 900) // 1600 - 40% editor (~640px)
    fake.setEditorWidth(640)
    controller.refitCameraToCurrentLevel()

    // THEN the controller must propagate the new container dimensions to
    // the SceneManager via the onResize callback so the Three.js
    // renderer/camera aspect stays in sync with the live canvas rect.
    expect(fake.onResize).toHaveBeenCalledTimes(1)
    expect(fake.onResize).toHaveBeenCalledWith(960, 900)
  })

  it('should notify onResize with new container dimensions when the editor CLOSES', () => {
    // GIVEN the editor is open: canvas region narrowed, editor panel at 640px.
    fake.setContainerSize(960, 900)
    fake.setEditorWidth(640)
    controller.refitCameraToCurrentLevel()
    fake.onResize.mockClear()

    // WHEN the editor closes, CSS reflow expands the canvas back to full width
    // and main.ts calls editorViewport.refitCameraToCurrentLevel().
    fake.setContainerSize(1600, 900)
    fake.setEditorWidth(0)
    controller.refitCameraToCurrentLevel()

    // THEN the controller must notify the renderer of the new full-canvas
    // dimensions so subsequent raycasts hit the correct grid cells.
    expect(fake.onResize).toHaveBeenCalledTimes(1)
    expect(fake.onResize).toHaveBeenCalledWith(1600, 900)
  })

  it('should always pass the LIVE container dimensions (not stale ones) to onResize', () => {
    // GIVEN repeated toggles with different sizes (open/close/open/close)
    const sequence: Array<{ canvas: [number, number]; editor: number }> = [
      { canvas: [1600, 900], editor: 0 }, // closed
      { canvas: [960, 900], editor: 640 }, // open
      { canvas: [1280, 720], editor: 0 }, // closed (window also resized)
      { canvas: [768, 720], editor: 512 }, // open at the new viewport
    ]

    // WHEN each toggle triggers a refit
    for (const step of sequence) {
      fake.setContainerSize(step.canvas[0], step.canvas[1])
      fake.setEditorWidth(step.editor)
      controller.refitCameraToCurrentLevel()
    }

    // THEN onResize was called once per refit with the matching dimensions,
    // never with a previous or cached size.
    expect(fake.onResize).toHaveBeenCalledTimes(sequence.length)
    for (let i = 0; i < sequence.length; i++) {
      expect(fake.onResize).toHaveBeenNthCalledWith(
        i + 1,
        sequence[i].canvas[0],
        sequence[i].canvas[1],
      )
    }
  })
})

/**
 * RED-step tests for the new "canvas physically reflows around the editor
 * panel" contract.
 *
 * EXPECTED FIX:
 *   The canvas container's CSS switches from `inset: 0` to using the
 *   `--rf-canvas-right` variable for its right inset, so when the editor is
 *   open the canvas physically shrinks rather than being overlapped by the
 *   editor panel. As a consequence the controller no longer needs to
 *   subtract the editor width when computing the visible region —
 *   `canvasContainer.clientWidth` IS the visible region.
 *
 *   New contract: `visibleWidth === canvasWidth` always.
 *   Old contract was: `visibleWidth = max(0, canvasWidth - editorWidth)`.
 */
describe('EditorViewportController — getVisibleCanvasWidth (canvas physically shrinks, no overlap)', () => {
  let fake: ResizeFake
  let controller: EditorViewportController

  beforeEach(() => {
    fake = makeFake()
    controller = buildController(fake)
  })

  afterEach(() => {
    controller.dispose()
    document.body.innerHTML = ''
  })

  it('returns visibleWidth === canvasWidth when the editor panel is OPEN (post-shrink: canvas physically reflows so no overlap subtraction is needed)', () => {
    fake.setContainerSize(960, 720)
    fake.setEditorWidth(640)

    const result = controller.getVisibleCanvasWidth()

    expect(result.canvasWidth).toBe(960)
    expect(result.visibleWidth).toBe(960)
  })

  it('returns visibleWidth === canvasWidth when the editor panel is CLOSED (editor width = 0)', () => {
    fake.setContainerSize(1600, 900)
    fake.setEditorWidth(0)

    const result = controller.getVisibleCanvasWidth()

    expect(result.canvasWidth).toBe(1600)
    expect(result.visibleWidth).toBe(1600)
  })

  it('does NOT subtract the editor width even when the editor is wider than the canvas (would have produced 0 under the old contract)', () => {
    // Edge case: under the OLD contract this would clamp to 0. Under the
    // NEW contract the canvas is reflowed by CSS so its clientWidth IS the
    // post-reflow visible region, regardless of editor width.
    fake.setContainerSize(800, 600)
    fake.setEditorWidth(2000)

    const result = controller.getVisibleCanvasWidth()

    expect(result.visibleWidth).toBe(800)
  })
})

/**
 * RED-step test for the new "resize-drag updates --rf-canvas-right" contract.
 *
 * EXPECTED FIX:
 *   The drag onResize callback wired by `attachResizeDrag` writes
 *   `--rf-canvas-right: <editor-rect-width>px` on document.body BEFORE
 *   refitting the camera, so the canvas container's CSS reflow tracks the
 *   editor panel's live width during the drag.
 */
describe('EditorViewportController — attachResizeDrag updates --rf-canvas-right CSS variable', () => {
  let fake: ResizeFake
  let controller: EditorViewportController

  beforeEach(() => {
    fake = makeFake()
    controller = buildController(fake)
    // jsdom does not implement setPointerCapture; stub it so the drag
    // helper does not throw on pointerdown.
    fake.resizeHandle.setPointerCapture = vi.fn() as unknown as Element['setPointerCapture']
    // Pin viewport width for predictable drag math.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
  })

  afterEach(() => {
    controller.dispose()
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
  })

  function dispatchPointer(
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    clientX: number,
  ): void {
    // jsdom doesn't implement PointerEvent in all versions; build a generic
    // Event and attach the handler-relevant fields.
    const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & {
      clientX: number
      pointerId: number
      preventDefault(): void
    }
    Object.defineProperty(ev, 'clientX', { value: clientX })
    Object.defineProperty(ev, 'pointerId', { value: 1 })
    fake.resizeHandle.dispatchEvent(ev)
  }

  it('writes --rf-canvas-right = <editor-rect-width>px on document.body during drag (matches the live editor width)', () => {
    // GIVEN the editor is open at 640px; the controller's drag handle is wired.
    fake.setContainerSize(960, 720)
    fake.setEditorWidth(640)
    controller.attachResizeDrag()

    // WHEN the user starts dragging the resize handle leftward (which would
    // widen the editor panel). The drag helper updates the panel's CSS width;
    // we mirror the post-drag width via our getBoundingClientRect fake so
    // the controller's onResize callback observes a known value.
    dispatchPointer('pointerdown', 960)
    fake.setEditorWidth(720) // simulate post-drag editor rect width
    dispatchPointer('pointermove', 880)
    dispatchPointer('pointerup', 880)

    // THEN the body inline style exposes the editor width as a px string so
    // the canvas container's CSS reflows to match.
    expect(document.body.style.getPropertyValue('--rf-canvas-right')).toBe('720px')
  })

  it('writes the var BEFORE the camera refit observes the post-reflow layout', () => {
    fake.setContainerSize(960, 720)
    fake.setEditorWidth(640)
    controller.attachResizeDrag()

    // Capture the var value at the moment zoomToFit (the camera refit) runs.
    let varAtRefitTime: string | null = null
    fake.cameraController.zoomToFit.mockImplementation(() => {
      varAtRefitTime = document.body.style.getPropertyValue('--rf-canvas-right')
    })

    dispatchPointer('pointerdown', 960)
    fake.setEditorWidth(720)
    dispatchPointer('pointermove', 880)
    dispatchPointer('pointerup', 880)

    // The CSS var must already be '720px' by the time the camera refit runs,
    // so the fit math observes the post-reflow layout, not a stale one.
    expect(varAtRefitTime).toBe('720px')
  })
})
