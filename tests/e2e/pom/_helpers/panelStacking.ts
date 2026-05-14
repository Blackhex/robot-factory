import type { Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Assert that the element under `root`'s on-screen centroid is
 * `root` itself (or one of its descendants) — i.e. nothing else is
 * stacked above the panel at that point.
 *
 * Used by the visual-stacking E2E tests: when an overlapping overlay
 * (e.g. the sandbox Projects panel) is open, the three left-anchored
 * game-area panels (HUD, Machine panel, Belt panel) must still own
 * their own pixels.
 *
 * `panelSelector` is the canonical class selector for the panel
 * (e.g. `.ui-hud`); we use `closest()` to walk up from
 * `document.elementFromPoint(cx, cy)` and report which panel — if
 * any — owns the point. The diagnostic on failure includes the
 * offending element's tagName + class list.
 */
export async function expectPanelStaysOnTopAtCenter(
  root: Locator,
  panelSelector: string,
): Promise<void> {
  const box = await root.boundingBox()
  if (box === null || box.width <= 0 || box.height <= 0) {
    throw new Error(
      `expectPanelStaysOnTopAtCenter(${panelSelector}): root has no bounding box (panel not rendered?)`,
    )
  }
  const cx = Math.round(box.x + box.width / 2)
  const cy = Math.round(box.y + box.height / 2)
  const probe = await root.page().evaluate(
    ({ x, y, sel }: { x: number; y: number; sel: string }) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      if (el === null) {
        return { hits: false, tag: '(none)', classList: '', hostMatches: false }
      }
      const host = el.closest(sel)
      return {
        hits: true,
        tag: el.tagName.toLowerCase(),
        classList: el.className || '',
        hostMatches: host !== null,
      }
    },
    { x: cx, y: cy, sel: panelSelector },
  )
  expect(
    probe.hostMatches,
    `expected document.elementFromPoint(${cx}, ${cy}) to be inside "${panelSelector}", ` +
      `but it was <${probe.tag} class="${probe.classList}">`,
  ).toBe(true)
}
