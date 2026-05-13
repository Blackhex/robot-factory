/**
 * Drag-and-drop + keyboard reorder controller for the Projects panel.
 *
 * Owns the HTML5 drag listeners (delegated on the list element), the
 * pointer-event drag fallback used for touch + Playwright synthetic
 * mouse drags, the live in-list preview that physically reorders the
 * dragged row(s) under the pointer, and the Alt+ArrowUp /
 * Alt+ArrowDown keyboard reorder on focused slot rows.
 *
 * Live-preview contract:
 *   - On `dragstart` the original visual order is snapshotted so any
 *     cancel can restore it byte-for-byte.
 *   - Each `dragover` recomputes the would-be drop order and reorders
 *     the existing row DOM nodes in place (no re-creation, no separate
 *     indicator line) so listeners / focus / `is-dragging` styling on
 *     the dragged rows survive.
 *   - `drop` commits the previewed order via `deps.onReorder` (called
 *     exactly once); `dragend` without a preceding drop, pointer
 *     release outside the panel, and `cancelInFlightDrag()` all revert
 *     the DOM to the snapshot.
 *
 * Pure UI behaviour: the controller never mutates panel state directly
 * — it computes the new ordering and forwards it via `deps.onReorder`.
 */
export interface ReorderControllerDeps {
  /** Root list element that contains every slot row + the placeholder. */
  listEl: HTMLElement
  /** Current visual order of REAL slots (placeholder excluded). */
  getOrderedSlotIds: () => string[]
  /** Currently-selected real slot ids (for multi-row drag). */
  getSelectedSlotIds: () => string[]
  /** Identify the placeholder/empty row inside the list. */
  isPlaceholderRow: (el: HTMLElement) => boolean
  /**
   * Emit the new ordered slot ids. `focusSlotId`, when provided, is the
   * slot id that should regain focus after the panel re-renders (used
   * by keyboard reorder so the moved row stays focused).
   */
  onReorder: (newOrderedIds: string[], focusSlotId?: string) => void
}

interface PointerDragState {
  pointerId: number
  grip: HTMLElement
  startX: number
  startY: number
  committed: boolean
  slotId: string
}

export class ProjectsPanelReorderController {
  private static readonly POINTER_DRAG_THRESHOLD = 6

  private readonly deps: ReorderControllerDeps
  private originalOrderIds: string[] = []
  private draggedIds: string[] = []
  private currentPreviewOrder: string[] = []
  private isDragActive = false
  private pointerDragState: PointerDragState | null = null

  constructor(deps: ReorderControllerDeps) {
    this.deps = deps
    this.attachListListeners()
  }

  /** Attach per-row drag / keyboard listeners. Called from `makeSlotRow`. */
  attachToSlotRow(row: HTMLElement, slotId: string): void {
    row.draggable = true
    row.addEventListener('keydown', (ev) => this.handleRowKeyDown(ev, slotId))
    const grip = row.querySelector<HTMLElement>('.ui-projects-slot-grip')
    if (grip) {
      grip.addEventListener('pointerdown', (ev) =>
        this.handleGripPointerDown(ev, slotId),
      )
    }
  }

  /**
   * Hook the placeholder row. The list-level dragover handler already
   * routes drops on the placeholder to the end of the real-slot list,
   * so this is currently a no-op kept for API symmetry.
   */
  attachToPlaceholderRow(_row: HTMLElement): void {
    // intentionally empty
  }

  cancelInFlightDrag(): void {
    if (this.isDragActive) {
      this.applyDomOrder(this.originalOrderIds)
    }
    this.markDraggingRows(false)
    this.resetState()
    this.releasePointerDrag()
  }

  dispose(): void {
    this.cancelInFlightDrag()
  }

  // -------- list-level HTML5 drag listeners ----------------------------

  private attachListListeners(): void {
    const list = this.deps.listEl
    list.addEventListener('dragstart', (ev) =>
      this.handleDragStart(ev as DragEvent),
    )
    list.addEventListener('dragover', (ev) =>
      this.handleDragOver(ev as DragEvent),
    )
    list.addEventListener('drop', (ev) => this.handleDrop(ev as DragEvent))
    list.addEventListener('dragend', () => this.handleDragEnd())
    list.addEventListener('dragleave', () => {
      // Leaving one row often means entering an adjacent row — clearing
      // anything here would cause flicker. Cleanup happens on drop /
      // dragend / cancel.
    })
  }

  private handleDragStart(event: DragEvent): void {
    const target = event.target as HTMLElement | null
    const grip = target?.closest<HTMLElement>('.ui-projects-slot-grip') ?? null
    if (!grip) {
      event.preventDefault()
      return
    }
    const row = grip.closest<HTMLElement>('.ui-projects-slot')
    if (!row || this.deps.isPlaceholderRow(row)) {
      event.preventDefault()
      return
    }
    const slotId = row.dataset.slotId
    if (!slotId) {
      event.preventDefault()
      return
    }
    // If the pointer fallback already started this drag (real-desktop
    // browsers fire pointerdown → pointermove → dragstart in that
    // order), keep its snapshot intact. Re-running beginDrag here
    // would re-read getOrderedSlotIds() AFTER the live preview has
    // already mutated the DOM, corrupting originalOrderIds and making
    // commitDrop's changed-check return false → no persistence.
    if (!this.isDragActive) {
      this.beginDrag(slotId)
    }
    // Native HTML5 drag wins over the pointer fallback when both fire
    // (real desktop browsers). Suppress the in-flight pointer drag so
    // we don't double-handle.
    if (this.pointerDragState) {
      this.releasePointerDrag()
    }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      try {
        event.dataTransfer.setData('text/plain', JSON.stringify(this.draggedIds))
      } catch {
        // some browsers throw if called outside a real dragstart; ignore
      }
    }
  }

  private handleDragOver(event: DragEvent): void {
    if (!this.isDragActive) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const targetRow = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '.ui-projects-slot',
    )
    if (!targetRow) return
    this.updatePreviewFromTarget(targetRow, event.clientY)
  }

  private handleDrop(event: DragEvent): void {
    if (!this.isDragActive) return
    event.preventDefault()
    const targetRow = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '.ui-projects-slot',
    )
    if (targetRow) this.updatePreviewFromTarget(targetRow, event.clientY)
    this.commitDrop()
  }

  private handleDragEnd(): void {
    // Fires after both drop (state already cleared by commitDrop) and
    // user cancel. Only the cancel path needs to revert.
    if (!this.isDragActive) return
    this.cancelInFlightDrag()
  }

  // -------- shared insertion math --------------------------------------

  private beginDrag(slotId: string): void {
    this.originalOrderIds = [...this.deps.getOrderedSlotIds()]
    this.draggedIds = this.computeDraggedSet(slotId)
    this.currentPreviewOrder = [...this.originalOrderIds]
    this.isDragActive = true
    this.markDraggingRows(true)
  }

  private resetState(): void {
    this.originalOrderIds = []
    this.draggedIds = []
    this.currentPreviewOrder = []
    this.isDragActive = false
  }

  /** Find the dragged set, preserving relative order in the current list. */
  private computeDraggedSet(slotId: string): string[] {
    const ids = this.deps.getOrderedSlotIds()
    const selected = new Set(this.deps.getSelectedSlotIds())
    if (selected.has(slotId) && selected.size >= 2) {
      return ids.filter((id) => selected.has(id))
    }
    return [slotId]
  }

  /**
   * Compute the would-be drop order from `(targetRow, clientY)`, then
   * — only if it differs from the current preview — physically move
   * the row nodes in the DOM to match.
   */
  private updatePreviewFromTarget(targetRow: HTMLElement, clientY: number): void {
    const draggedSet = new Set(this.draggedIds)
    const filtered = this.originalOrderIds.filter((id) => !draggedSet.has(id))
    const insertion = this.computeInsertionIndex(targetRow, clientY, filtered)
    if (insertion === null) return

    const newOrder = [
      ...filtered.slice(0, insertion),
      ...this.draggedIds,
      ...filtered.slice(insertion),
    ]
    if (arraysEqual(newOrder, this.currentPreviewOrder)) return
    this.currentPreviewOrder = newOrder
    this.applyDomOrder(newOrder)
  }

  /**
   * Pure: where the dragged set would land if released over `targetRow`
   * at `clientY`. Returns `null` when the hover is on a dragged row or
   * an unknown row (preview should be unchanged).
   */
  private computeInsertionIndex(
    targetRow: HTMLElement,
    clientY: number,
    filtered: string[],
  ): number | null {
    if (this.deps.isPlaceholderRow(targetRow)) {
      return filtered.length
    }
    const targetId = targetRow.dataset.slotId
    if (!targetId) return null
    // Hovering one of the dragged rows: keep the current preview as-is.
    if (this.draggedIds.includes(targetId)) return null
    const targetIdx = filtered.indexOf(targetId)
    if (targetIdx < 0) return null
    const rect = targetRow.getBoundingClientRect()
    const isBottomHalf = clientY >= rect.top + rect.height / 2
    return targetIdx + (isBottomHalf ? 1 : 0)
  }

  private commitDrop(): void {
    const orderToCommit = [...this.currentPreviewOrder]
    const changed = !arraysEqual(orderToCommit, this.originalOrderIds)
    this.markDraggingRows(false)
    this.resetState()
    this.releasePointerDrag()
    if (changed) this.deps.onReorder(orderToCommit)
  }

  /**
   * Reorder the existing slot row nodes in the list so they match
   * `orderIds`. Nodes are MOVED (insertBefore preserves identity), so
   * event listeners, focus, and the `is-dragging` class survive. The
   * placeholder is always kept last by inserting every real row before
   * it.
   */
  private applyDomOrder(orderIds: string[]): void {
    const list = this.deps.listEl
    const placeholder = list.querySelector<HTMLElement>('.ui-projects-slot--empty')
    const rowById = new Map<string, HTMLElement>()
    for (const row of list.querySelectorAll<HTMLElement>('.ui-projects-slot')) {
      const id = row.dataset.slotId
      if (id) rowById.set(id, row)
    }
    for (const id of orderIds) {
      const row = rowById.get(id)
      if (!row) continue
      if (placeholder) list.insertBefore(row, placeholder)
      else list.appendChild(row)
    }
  }

  // -------- visual feedback --------------------------------------------

  private markDraggingRows(on: boolean): void {
    if (on) {
      const draggedSet = new Set(this.draggedIds)
      for (const row of this.deps.listEl.querySelectorAll<HTMLElement>(
        '.ui-projects-slot',
      )) {
        const id = row.dataset.slotId
        if (id && draggedSet.has(id)) row.classList.add('is-dragging')
      }
    } else {
      // On cleanup, clear the class from EVERY row so we never leak it
      // even if the dragged set was reset early.
      for (const row of this.deps.listEl.querySelectorAll<HTMLElement>(
        '.ui-projects-slot.is-dragging',
      )) {
        row.classList.remove('is-dragging')
      }
    }
  }

  // -------- keyboard reorder -------------------------------------------

  private handleRowKeyDown(event: KeyboardEvent, slotId: string): void {
    if (!event.altKey) return
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    const ids = this.deps.getOrderedSlotIds()
    const idx = ids.indexOf(slotId)
    if (idx < 0) return
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const targetIdx = idx + delta
    if (targetIdx < 0 || targetIdx >= ids.length) return
    event.preventDefault()
    const newOrder = [...ids]
    const [moved] = newOrder.splice(idx, 1)
    newOrder.splice(targetIdx, 0, moved!)
    this.deps.onReorder(newOrder, slotId)
  }

  // -------- pointer-drag fallback (touch + synthetic mouse) ------------

  private handleGripPointerDown(event: PointerEvent, slotId: string): void {
    // Track every pointer type. On desktops the native HTML5 dragstart
    // fires shortly after this and `handleDragStart` clears the pointer
    // state so the pointer fallback no-ops. In environments where the
    // browser does NOT promote a mousedown into a real drag (e.g.
    // Playwright/Chromium headless mouse simulation), the pointer
    // fallback takes over once movement exceeds the threshold.
    const grip = event.currentTarget as HTMLElement
    this.pointerDragState = {
      pointerId: event.pointerId,
      grip,
      startX: event.clientX,
      startY: event.clientY,
      committed: false,
      slotId,
    }
    try {
      grip.setPointerCapture(event.pointerId)
    } catch {
      // jsdom / older browsers may throw — ignore
    }
    // Listen on `document` instead of the grip so synthetic mouse
    // events (Playwright's `Input.dispatchMouseEvent`) and any move
    // that exits the grip's geometry still reach us. Pointer events
    // bubble, so direct dispatches on the grip in unit tests are
    // caught here too.
    document.addEventListener('pointermove', this.handleGripPointerMove)
    document.addEventListener('pointerup', this.handleGripPointerUp)
    document.addEventListener('pointercancel', this.handleGripPointerCancel)
  }

  private handleGripPointerMove = (event: PointerEvent): void => {
    const state = this.pointerDragState
    if (!state || event.pointerId !== state.pointerId) return
    if (!state.committed) {
      const dx = event.clientX - state.startX
      const dy = event.clientY - state.startY
      if (Math.hypot(dx, dy) < ProjectsPanelReorderController.POINTER_DRAG_THRESHOLD) return
      state.committed = true
      this.beginDrag(state.slotId)
    }
    if (!this.isDragActive) return
    const targetRow = this.rowAtPoint(event.clientX, event.clientY)
    if (!targetRow) return
    this.updatePreviewFromTarget(targetRow, event.clientY)
  }

  private handleGripPointerUp = (event: PointerEvent): void => {
    const state = this.pointerDragState
    if (!state || event.pointerId !== state.pointerId) {
      this.releasePointerDrag()
      return
    }
    if (!state.committed || !this.isDragActive) {
      this.releasePointerDrag()
      return
    }
    const targetRow = this.rowAtPoint(event.clientX, event.clientY)
    if (targetRow) {
      this.updatePreviewFromTarget(targetRow, event.clientY)
      this.commitDrop()
    } else {
      // Released outside the list — cancel and restore the original
      // order. cancelInFlightDrag also releases the pointer.
      this.cancelInFlightDrag()
    }
  }

  private handleGripPointerCancel = (event: PointerEvent): void => {
    const state = this.pointerDragState
    if (!state || event.pointerId !== state.pointerId) return
    this.cancelInFlightDrag()
  }

  private rowAtPoint(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    return el?.closest<HTMLElement>('.ui-projects-slot') ?? null
  }

  private releasePointerDrag(): void {
    const state = this.pointerDragState
    if (!state) return
    try {
      state.grip.releasePointerCapture(state.pointerId)
    } catch {
      // ignore
    }
    document.removeEventListener('pointermove', this.handleGripPointerMove)
    document.removeEventListener('pointerup', this.handleGripPointerUp)
    document.removeEventListener('pointercancel', this.handleGripPointerCancel)
    this.pointerDragState = null
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
