import type { CameraController } from './CameraController'
import {
  attachHorizontalResizeDrag,
  type HorizontalResizeDragHandle,
} from '../utils/attachHorizontalResizeDrag'
import { setCanvasInset } from '../utils/setCanvasInset'

/**
 * Returns the current factory grid size, or `null` when no level is active.
 * The controller calls this on every refit so it always reads the live
 * GameManager state without holding a stale reference.
 */
export type GetFactorySize = () => { width: number; height: number } | null

export interface EditorViewportDeps {
  canvasContainer: HTMLElement
  editorContainer: HTMLElement
  resizeHandle: HTMLElement
  cameraController: CameraController
  getFactorySize: GetFactorySize
  /**
   * Optional callback invoked with the LIVE canvas-container dimensions
   * every time {@link EditorViewportController.refitCameraToCurrentLevel}
   * runs. Wire this to `SceneManager.resize(width, height)` so the Three.js
   * renderer/camera aspect stays in sync with the post-reflow CSS layout
   * whenever the editor opens, closes, or is resized via the drag handle.
   *
   * Only fires when a level is active and the canvas has nonzero width —
   * the window-resize handler in `main.ts` covers the inactive-level case
   * (main menu, score screen).
   *
   * Decoupled as a callback (rather than a direct `SceneManager` ref) so the
   * controller stays free of any rendering-layer dependencies beyond
   * `CameraController`.
   */
  onResize?: (width: number, height: number) => void
}

export interface VisibleCanvasWidth {
  canvasWidth: number
  visibleWidth: number
}

/**
 * Owns the DOM-measurement and resize-drag logic for the right-docked PXT
 * editor panel. Extracted from `src/main.ts` to keep the composition root
 * free of layout math.
 *
 * Responsibilities:
 *  - measure the visible canvas region (canvas width minus editor width)
 *  - refit the camera to the current level whenever the visible region
 *    changes (editor open/close, resize drag, window resize)
 *  - drive the editor resize handle (pointer drag updates editor width and
 *    the handle's right offset, and refits the camera in real time)
 */
export class EditorViewportController {
  private readonly canvasContainer: HTMLElement
  private readonly editorContainer: HTMLElement
  private readonly resizeHandle: HTMLElement
  private readonly cameraController: CameraController
  private readonly getFactorySize: GetFactorySize
  private readonly onResize: ((width: number, height: number) => void) | undefined
  private dragHandle: HorizontalResizeDragHandle | null = null

  constructor(deps: EditorViewportDeps) {
    this.canvasContainer = deps.canvasContainer
    this.editorContainer = deps.editorContainer
    this.resizeHandle = deps.resizeHandle
    this.cameraController = deps.cameraController
    this.getFactorySize = deps.getFactorySize
    this.onResize = deps.onResize
  }

  /**
   * Returns the live width of the canvas container. Since the canvas
   * physically reflows around the editor panel (CSS-driven via
   * `--rf-canvas-right`), the visible region equals the canvas width —
   * there is no overlap to subtract.
   */
  getVisibleCanvasWidth(): VisibleCanvasWidth {
    const canvasWidth = this.canvasContainer.clientWidth
    return { canvasWidth, visibleWidth: canvasWidth }
  }

  /**
   * Refit the camera to the current level's grid, biasing the fit to the
   * canvas region not covered by the editor panel. Safe to call even when
   * no level is active (no-ops outside build/play/sandbox).
   */
  refitCameraToCurrentLevel(duration?: number): void {
    const size = this.getFactorySize()
    if (!size) return
    const viewport = this.getVisibleCanvasWidth()
    if (viewport.canvasWidth <= 0) return
    // Sync the renderer/camera aspect to the LIVE container dimensions
    // BEFORE running the camera-fit math so the fit is computed against
    // the post-reflow aspect, not a stale one. This is the chokepoint that
    // every editor-toggle / drag / window-resize / level-transition path in
    // main.ts funnels through, so emitting onResize here makes it
    // impossible to forget when adding new callers.
    const liveWidth = this.canvasContainer.clientWidth
    const liveHeight = this.canvasContainer.clientHeight
    this.onResize?.(liveWidth, liveHeight)
    this.cameraController.zoomToFit(size.width, size.height, viewport, duration)
  }

  /**
   * Attach pointer-event listeners to the resize handle. The handle's CSS
   * `right` offset stays mirrored to the editor's CSS width so the visual
   * alignment is preserved while dragging.
   */
  attachResizeDrag(): void {
    this.dragHandle?.dispose()
    this.dragHandle = attachHorizontalResizeDrag({
      handle: this.resizeHandle,
      panel: this.editorContainer,
      edge: 'right',
      minWidthPx: 500,
      maxWidthFraction: 1,
      onResize: () => {
        // Write the CSS var BEFORE refit so the canvas-container reflows
        // first; refit then observes the post-reflow clientWidth.
        setCanvasInset('right', this.editorContainer.getBoundingClientRect().width)
        this.refitCameraToCurrentLevel(0.1)
      },
    })
  }

  /**
   * Remove all pointer-event listeners attached by {@link attachResizeDrag}.
   */
  dispose(): void {
    this.dragHandle?.dispose()
    this.dragHandle = null
  }
}
