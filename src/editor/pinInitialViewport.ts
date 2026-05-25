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
export function pinInitialViewport(
  getBlocklyWorkspace: () => any,
  dx: number,
  dy: number,
): void {
  const MAX_ATTEMPTS = 200 // ~5 seconds @ 25 ms
  const STABLE_TICKS_TO_STOP = 8
  // The toolbox is rendered asynchronously over postMessage, so
  // `absoluteLeft` (toolbox width) can grow/shrink for several
  // ticks after init. Require it to stay the same across this
  // many consecutive polls before trusting it for a pin — a stale
  // metric here leaves Blockly's `.blocklyHtmlInput` overlay
  // mounted at the wrong coordinates relative to its SVG field.
  const METRIC_STABLE_TICKS_REQUIRED = 8
  const RETRY_MS = 25
  let stableTicks = 0
  let lastAbsoluteLeft: number | null = null
  let lastAbsoluteTop: number | null = null
  let metricStableTicks = 0
  const tryPin = (attempt: number): void => {
    const ws = getBlocklyWorkspace()
    const topBlocks: any[] = ws?.getTopBlocks?.(false) ?? []
    if (ws && topBlocks.length > 0) {
      const m = ws.getMetrics?.() ?? { absoluteLeft: 0, absoluteTop: 0 }
      const absoluteLeft = m.absoluteLeft ?? 0
      const absoluteTop = m.absoluteTop ?? 0
      if (
        lastAbsoluteLeft === absoluteLeft &&
        lastAbsoluteTop === absoluteTop
      ) {
        metricStableTicks++
      } else {
        metricStableTicks = 0
        lastAbsoluteLeft = absoluteLeft
        lastAbsoluteTop = absoluteTop
      }
      if (metricStableTicks >= METRIC_STABLE_TICKS_REQUIRED) {
        // The (dx, dy) offset is relative to the workspace area
        // (the region to the right of the toolbox, below any top
        // chrome). Add the toolbox width (`absoluteLeft`) and any
        // top padding (`absoluteTop`) so the resulting SVG translate
        // places the on-start block to the RIGHT of the toolbox
        // instead of behind it.
        const absX = absoluteLeft + dx
        const absY = absoluteTop + dy
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
    }
    if (stableTicks >= STABLE_TICKS_TO_STOP) return
    if (attempt < MAX_ATTEMPTS) {
      setTimeout(() => tryPin(attempt + 1), RETRY_MS)
    }
    // If we time out without ever finding a stable metric, do
    // nothing — Blockly's `initLayout` defaults win, which is
    // strictly safer than pinning to a stale toolbox width.
  }
  tryPin(0)
}
