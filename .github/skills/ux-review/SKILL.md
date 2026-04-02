---
name: ux-review
description: "Use when visually reviewing the running Robot Factory application with Playwright. Covers browser automation for navigating the app, taking screenshots, inspecting 3D canvas rendering, verifying UI overlays, and producing visual review reports. Includes domain knowledge for grid coordinates, machine placement, belt drawing, and all UI screens."
---

# UX Review — Playwright Visual Inspection

## Purpose

The ux-reviewer agent uses Playwright to interact with the running Robot Factory application, take screenshots, and verify visual correctness. This skill provides the domain knowledge and automation patterns needed to navigate every screen, perform factory-building actions, and capture evidence of visual issues.

**Why Playwright**: Unit tests use mocked Three.js (BufferGeometry, materials are all stubs), so they CANNOT catch visual/geometry bugs. Only Playwright-based screenshot inspection against the real browser can verify that 3D rendering, textures, UV mapping, mesh positioning, and visual continuity are correct.

## Prerequisites

The dev server must be running at `http://localhost:5173/`. Start it with `npm run dev` if not already running. Check `Terminal: dev` in the terminal list.

## Application Structure

### DOM Layout
```
div#app
├── div#canvas-container          ← Three.js canvas lives here
│   └── canvas[data-engine="three.js r183"]
├── div#ui-overlay                ← All HTML UI overlays (pointer-events: none on container)
│   ├── .ui-main-menu             ← Title screen (z-index: 100)
│   ├── .ui-level-select          ← Level selection grid
│   ├── .ui-toolbar               ← Top toolbar (z-index: 10)
│   ├── .ui-hud                   ← Simulation metrics panel (top-left, z-index: 15)
│   ├── .ui-machine-panel         ← Machine properties (bottom-left, z-index: 15)
│   ├── .ui-belt-panel            ← Belt properties (bottom-left, z-index: 15)
│   ├── .ui-score-screen          ← Post-level star ratings
│   └── .ui-tutorial              ← Tutorial overlay
└── div#editor-container          ← PXT editor panel (right 40%, z-index: 20)
    └── iframe.pxt-editor-iframe  ← PXT editor iframe
```

### Application States (GameManager)
```
main_menu → level_select → build_phase → play_phase → score_screen
                         → sandbox (from main menu)
```

## Navigation Recipes

### Start the app and wait for ready
```typescript
await page.goto('/')
await page.waitForSelector('canvas')
await page.waitForFunction(() => {
  const c = document.querySelector('canvas')
  return c && c.width > 0 && c.height > 0
})
```

### Main Menu → Level Select
```typescript
await page.locator('.ui-main-menu-btn--primary').click()  // "Start Game"
await expect(page.locator('.ui-level-select')).toBeVisible()
```

### Main Menu → Sandbox
```typescript
await page.locator('.ui-main-menu-btn').last().click()  // "Sandbox" (2nd button)
await expect(page.locator('.ui-toolbar')).toBeVisible()
await page.waitForTimeout(1200)  // camera zoom-to-fit animation
```

### Level Select → Level (build phase)
```typescript
await page.locator('.ui-level-card:not(.ui-level-card--locked)').first().click()
await expect(page.locator('.ui-toolbar')).toBeVisible()
await page.waitForTimeout(1200)
```

### Level Select → Back to Main Menu
```typescript
await page.locator('.ui-level-select-back').click()
await expect(page.locator('.ui-main-menu')).toBeVisible()
```

### Build Phase → Play Phase (start simulation)
```typescript
await page.locator('.ui-toolbar-btn--start').click()  // "Start"
await expect(page.locator('.ui-hud')).toBeVisible()
```

### Play Phase → Build Phase (stop simulation)
```typescript
await page.locator('.ui-toolbar-btn--restart').click()  // "Restart"
```

### Toggle PXT Editor
```typescript
await page.locator('.ui-toolbar-btn--editor').click()  // "Open Editor"
await expect(page.locator('#editor-container')).toHaveClass(/open/)
// Close:
await page.locator('.ui-toolbar-btn--editor').click()
```

### Switch Language (EN ↔ CS)
```typescript
await page.locator('.ui-lang-btn').click()
```

## Grid Interaction — 3D Canvas

### Coordinate System
- Grid: 20×20, coordinates `(x, z)` where `0 ≤ x < 20`, `0 ≤ z < 20`
- Cell center in world space: `(x - 10 + 0.5, 0, z - 10 + 0.5)`
- Grid cell (10, 10) is roughly at the center of the viewport

### Converting Grid Coordinates to Screen Pixels
Use this helper to map grid cell `(gx, gz)` to canvas pixel coordinates:

```typescript
async function gridCellToScreenPos(page: Page, gx: number, gz: number) {
  return page.evaluate(
    ({ gx, gz }) => {
      // Use the actual Three.js camera to project
      const sm = (window as any).__sceneManager
      if (sm) {
        const camera = sm.getCamera()
        const W = 20, H = 20
        const worldX = gx - W / 2 + 0.5
        const worldZ = gz - H / 2 + 0.5
        const vec = new (window as any).THREE.Vector3(worldX, 0, worldZ)
        vec.project(camera)
        const canvas = document.querySelector('canvas')!
        const rect = canvas.getBoundingClientRect()
        return {
          x: Math.round((vec.x + 1) / 2 * rect.width),
          y: Math.round((1 - vec.y) / 2 * rect.height),
        }
      }
      // Fallback: approximate projection
      const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement
      const rect = canvas!.getBoundingClientRect()
      const W = 20, H = 20
      const worldX = gx - W / 2 + 0.5, worldZ = gz - H / 2 + 0.5
      const fov = 50 * Math.PI / 180
      const d = Math.max(W, H) / (2 * Math.tan(fov / 2)) * 1.2
      const cx = d * 0.7, cy = d * 0.7, cz = d * 0.7
      const fl = Math.sqrt(cx * cx + cy * cy + cz * cz)
      const fx = -cx / fl, fy = -cy / fl, fz = -cz / fl
      let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0
      const rl = Math.sqrt(rx * rx + ry * ry + rz * rz)
      rx /= rl; ry /= rl; rz /= rl
      const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx
      const dx = worldX - cx, dy = -cy, dz = worldZ - cz
      const vx = dx * rx + dy * ry + dz * rz
      const vy = dx * ux + dy * uy + dz * uz
      const vz = dx * fx + dy * fy + dz * fz
      const thf = Math.tan(fov / 2), asp = rect.width / rect.height
      const nx = vx / (-vz * thf * asp), ny = vy / (-vz * thf)
      return { x: Math.round((nx + 1) / 2 * rect.width), y: Math.round((1 - ny) / 2 * rect.height) }
    },
    { gx, gz },
  )
}
```

### Place a Machine (double-click on empty cell)
```typescript
const pos = await gridCellToScreenPos(page, gx, gz)
await page.locator('canvas').dblclick({ position: { x: pos.x, y: pos.y } })
await page.waitForTimeout(200)
// Machine panel should appear:
await expect(page.locator('.ui-machine-panel')).toBeVisible()
```

### Select a Machine (single-click)
```typescript
const pos = await gridCellToScreenPos(page, gx, gz)
await page.locator('canvas').click({ position: { x: pos.x, y: pos.y } })
await page.waitForTimeout(200)
```

### Rotate a Machine (double-click on existing machine)
```typescript
const pos = await gridCellToScreenPos(page, gx, gz)
await page.locator('canvas').dblclick({ position: { x: pos.x, y: pos.y } })
await page.waitForTimeout(200)
```

### Change Machine Type
```typescript
// After selecting/placing a machine:
await page.locator('.ui-machine-panel-select').selectOption('assembler')
await page.waitForTimeout(200)
```

### Draw a Belt (drag from slot to target machine)
```typescript
const fromPos = await gridCellToScreenPos(page, fromX, fromZ)
const toPos = await gridCellToScreenPos(page, toX, toZ)
const canvas = page.locator('canvas')

// Drag from output slot area toward target
// Output slot is on the +Z side of the machine (below in screen space)
// Offset the start position slightly toward the output direction
await canvas.hover({ position: { x: fromPos.x, y: fromPos.y + 15 } })
await page.mouse.down()
await page.mouse.move(toPos.x, toPos.y, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(300)
```

### Delete Selected Machine / Belt
```typescript
await page.keyboard.press('Delete')
await page.waitForTimeout(200)
```

### Deselect Everything (click empty cell)
```typescript
const emptyPos = await gridCellToScreenPos(page, 0, 0)  // corner cell, likely empty
await page.locator('canvas').click({ position: { x: emptyPos.x, y: emptyPos.y } })
```

## Screenshot Techniques

### Output paths — MUST be gitignored
All ad-hoc screenshots produced during a UX review MUST be written under a gitignored folder so they never reach a commit. Use `test-results/screenshots/<descriptive-name>.png` as the canonical location. The `test-results/` folder is gitignored. The ONLY acceptable parent directory is `test-results/` — exact name, no variants. NEVER write screenshots to the repo root or any other tracked folder. NEVER create a sibling or look-alike folder such as `test-results-log/`, `screenshots/` (at the repo root), `ux-captures/`, `review-captures/`, or anything else ending in `-log`, `-logs`, `-output`, or `-captures` — these violate this rule even if untracked. Self-check before every `page.screenshot({ path: ... })`: the path MUST start with the exact prefix `test-results/`.

#### Mandatory pre/post-review guard — RUN THIS, do not skip

Prose rules above have repeatedly been ignored by agents. The following PowerShell guard is MANDATORY around every UX review session that takes screenshots or captures console output. Run the pre-flight block BEFORE you start the review, and the post-flight block AFTER you finish.

```powershell
$forbidden = @('test-results-log','test-results-logs','test-results_log','test-logs','vitest-logs','e2e-logs','playwright-logs','ux-captures','review-captures')
# PRE-FLIGHT: clean any stale violation left by a previous run.
$forbidden | ForEach-Object { if (Test-Path $_) { Remove-Item -Recurse -Force $_; Write-Host "Removed stale forbidden capture folder: $_" } }

# === RUN YOUR UX REVIEW HERE — every page.screenshot({ path: ... }) MUST start with 'test-results/' ===

# POST-FLIGHT: fail loudly if the review just created a forbidden folder.
$violations = $forbidden | Where-Object { Test-Path $_ }
if ($violations) { throw "VIOLATION: this review created forbidden capture folder(s): $($violations -join ', '). Re-take screenshots into test-results/screenshots/ only and report this failure to the orchestrator." }
```

The pre-flight `Remove-Item` is safe: these folder names are reserved-forbidden by this skill, so nothing in the repo legitimately uses them. If the post-flight `throw` fires, you wrote a screenshot or capture to a forbidden path — fix the path (it MUST start with `test-results/`) and re-take it. Do NOT suppress or weaken the guard.

### Full-page screenshot
```typescript
await page.screenshot({ path: 'test-results/screenshots/review-fullpage.png', fullPage: true })
```

### Canvas-only screenshot (3D scene)
```typescript
const canvas = page.locator('canvas')
await canvas.screenshot({ path: 'test-results/screenshots/review-3d-scene.png' })
```

### Specific UI element screenshot
```typescript
await page.locator('.ui-toolbar').screenshot({ path: 'test-results/screenshots/review-toolbar.png' })
await page.locator('.ui-machine-panel').screenshot({ path: 'test-results/screenshots/review-machine-panel.png' })
```

### Screenshot with highlight annotation
Take a screenshot then describe what's wrong — the screenshot IS the evidence.

### Wait for rendering to settle before screenshots
```typescript
// Wait at least 2 frames for Three.js to render
await page.waitForTimeout(100)
await page.screenshot({ path: 'test-results/screenshots/screenshot.png' })
```

## Accessing Three.js State from Playwright

The app exposes debugging hooks on `window`:
```typescript
// Available globals (set in main.ts for E2E tests):
(window as any).__gameManager    // GameManager instance
(window as any).__sceneManager   // SceneManager instance  
(window as any).__getFactoryRenderer  // () => FactoryRenderer | null
```

### Inspect game state
```typescript
const state = await page.evaluate(() => {
  const gm = (window as any).__gameManager
  return {
    state: gm.getCurrentState(),
    levelId: gm.currentLevel?.id ?? null,
    machineCount: gm.factory?.getMachines().length ?? 0,
    beltCount: gm.factory?.getBelts().length ?? 0,
  }
})
```

### Check simulation metrics
```typescript
const stats = await page.evaluate(() => {
  const gm = (window as any).__gameManager
  return gm.simulation?.getStats() ?? null
})
```

### Count scene objects (for geometry verification)
```typescript
const meshCount = await page.evaluate(() => {
  const sm = (window as any).__sceneManager
  let count = 0
  sm.getScene().traverse((obj: any) => { if (obj.isMesh) count++ })
  return count
})
```

### Read a specific mesh's geometry info
```typescript
const geoInfo = await page.evaluate(() => {
  const fr = (window as any).__getFactoryRenderer()
  // Access internal state for debugging
  const scene = (window as any).__sceneManager.getScene()
  const meshes: any[] = []
  scene.traverse((obj: any) => {
    if (obj.isMesh && obj.geometry) {
      meshes.push({
        name: obj.name,
        vertexCount: obj.geometry.getAttribute('position')?.count ?? 0,
        hasUV: !!obj.geometry.getAttribute('uv'),
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      })
    }
  })
  return meshes
})
```

## Machine Types and Visual Identity

| Type | Color (hex) | Icon | CSS class in panel |
|------|-------------|------|--------------------|
| `part_fabricator` | `0x4488ff` (blue) | ⚙ gear | Default on placement |
| `assembler` | `0x44cc44` (green) | ⊕ circled plus | 3 inputs, 1 output |
| `quality_checker` | `0xcccc44` (yellow-green) | ✔ check mark | |
| `painter` | `0xcc44cc` (magenta) | ◐ half circle | |
| `recycler` | `0xff8844` (orange) | ♻ recycling | |
| `splitter` | `0x44cccc` (cyan) | ⋔ pitchfork | 1 input, 3 outputs |

## Belt Visual Elements

| Element | Description | Appearance |
|---------|-------------|------------|
| Straight segment | Full cell-width box | Dark gray with animated chevron arrows |
| Corner segment | Quarter-ring at turn cells | Should match straight segment appearance |
| Endpoint segment | Half-cell box near machines | Same texture, half length |
| Ghost belt (drag) | Preview during belt drag | Transparent blue-gray (valid) or red (collision) |
| Highlighted belt | Selected belt chain | Cyan emissive glow |
| Slot indicator | I/O slot pads on machines | Green (input), Orange (output) |

## Visual Review Checklist

When reviewing the 3D scene, check these items:

### Belt Rendering
- [ ] Straight segments have visible animated chevron arrows.
- [ ] Corner segments connect flush with adjacent straight segments (no gaps).
- [ ] Corner segments have the same color/brightness as straight segments.
- [ ] Corner segments are at the same height as straight segments (no floating/sinking).
- [ ] No z-fighting (flickering) at connections between corners and straights.
- [ ] Endpoint segments near machines don't overlap with the machine box.
- [ ] Ghost belt preview appears during belt drag (even over empty cells).
- [ ] Ghost belt shows red when path would collide.

### Machine Rendering
- [ ] Each machine type has a distinct color.
- [ ] Machine icon (⚙, ⊕, ✔, etc.) visible on top face.
- [ ] Input slot (green) and output slot (orange) visible on correct faces.
- [ ] Input/output arrows visible on slot faces.
- [ ] Selected machine has highlight.
- [ ] Machine panel appears when machine is selected.

### Grid and Camera
- [ ] Grid lines visible on the floor.
- [ ] Camera provides clear isometric-ish view.
- [ ] Camera orbit controls work (mouse drag to rotate).
- [ ] Grid cells are 1:1 aspect ratio (not distorted).

### UI Overlays
- [ ] Toolbar buttons have correct colors (Start=green, Pause=yellow, Restart=red).
- [ ] HUD panel appears during simulation with metrics.
- [ ] Score screen shows after level completion.
- [ ] PXT editor opens on right side when "Open Editor" clicked.
- [ ] Language toggle switches all visible text.

## Producing the Review Report

After inspecting the app, produce a structured report:

```markdown
## UX Review — [Feature/Area]

### Screenshots
[Attach or reference screenshot files taken during review]

### Issues Found
| # | Severity | Area | Finding | Screenshot | Recommendation |
|---|----------|------|---------|------------|----------------|
| 1 | 🔴 Critical | Belt corners | Corner geometry broken — appears as flat rectangle, not quarter-ring | review-corner-1.png | Fix createCornerBeltGeometry() UV mapping |
| 2 | 🟡 Moderate | ... | ... | ... | ... |

### Verified OK
- [List items from the checklist that look correct]
```

## Common Pitfalls

1. **Don't trust unit test results for visual correctness** — Three.js is fully mocked in Vitest. A geometry with wrong vertices, broken UVs, or incorrect indices will pass all tests but render as garbage.

2. **Always take screenshots** — don't describe what you think you see; capture the actual rendering as evidence.

3. **Wait for animations** — after camera transitions or belt placement, wait 200-500ms before taking screenshots.

4. **Use wide viewports** — set viewport to at least `1280×720` for proper 3D scene rendering:
   ```typescript
   await page.setViewportSize({ width: 1680, height: 900 })
   ```

5. **Check at different zoom levels** — orbit the camera closer to inspect fine details like UV mapping and edge alignment.
