import type { Page } from '@playwright/test'

/**
 * Read/inspect the per-machine recipe-status icon meshes that the renderer
 * exposes via `factoryRenderer.recipeIcons: Map<machineId, THREE.Mesh>`.
 *
 * The icon floats above each machine that has a recipe set. Its material
 * color reflects whether the recipe's required inputs are currently
 * satisfied:
 *   - white (0xffffff) → all required inputs present
 *   - red   (0xff3333) → at least one required input missing
 *
 * Tests use this probe to assert the icon's existence, color, and world
 * position WITHOUT touching the renderer internals from spec files.
 */
export type RecipeIconState = {
  exists: boolean
  visible: boolean
  colorHex: number
  worldY: number
}

export type BuildPhasePreviewResult = {
  ok: boolean
  /** Reason for failure when `ok === false`. Lets tests fail with an actionable message. */
  reason?: string
}

export class RecipeIconProbe {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Read the recipe-icon state for the machine at the given grid cell. */
  async readForMachineAt(x: number, z: number): Promise<RecipeIconState> {
    return this.page.evaluate(({ x, z }) => {
      const gm = (window as any).__gameManager
      const machine = gm?.factory?.getMachineAt?.(x, z)
      const renderer = (window as any).__getFactoryRenderer?.()
      if (!machine || !renderer) {
        return { exists: false, visible: false, colorHex: 0, worldY: 0 }
      }
      const icons: Map<string, any> | undefined = renderer.recipeIcons
      if (!icons) {
        return { exists: false, visible: false, colorHex: 0, worldY: 0 }
      }
      const mesh = icons.get(machine.id)
      if (!mesh) {
        return { exists: false, visible: false, colorHex: 0, worldY: 0 }
      }
      mesh.updateMatrixWorld?.(true)
      const worldY = mesh.matrixWorld?.elements?.[13] ?? mesh.position?.y ?? 0
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const colorHex = mat?.color?.getHex?.() ?? 0
      return { exists: true, visible: mesh.visible !== false, colorHex, worldY }
    }, { x, z })
  }

  /**
   * Test seam: set a recipe on the machine at (x, z) by dispatching a
   * SET_RECIPE command directly through the simulation's command
   * dispatcher (bypassing the queue/tick loop). The simulation does not
   * need to be running.
   */
  async setRecipeAt(x: number, z: number, recipeId: string): Promise<boolean> {
    return this.page.evaluate(({ x, z, recipeId }) => {
      const gm = (window as any).__gameManager
      const info = gm?.factory?.getMachineAt?.(x, z)
      const sim = gm?.simulation
      if (!info || !sim || typeof sim.executeCommand !== 'function') return false
      // In build / sandbox phases the simulation may not yet have Machine
      // instances mirroring the factory. Populate it so the SET_RECIPE
      // command can find the live Machine.
      if (!sim.getMachine?.(info.id) && typeof gm.populateSimulation === 'function') {
        gm.populateSimulation()
      }
      sim.executeCommand({ type: 'SET_RECIPE', machineId: info.id, recipeId })
      const simMachine = sim.getMachine?.(info.id)
      return !!simMachine?.currentRecipe
    }, { x, z, recipeId })
  }

  /**
   * Test seam: push a single input Item of the given type directly into
   * the machine's `inputSlots`. Bypasses belt transport so tests can
   * stage "all required inputs present" without programming a full
   * supply chain.
   */
  async pushInputItemAt(x: number, z: number, itemType: string): Promise<boolean> {
    return this.page.evaluate(({ x, z, itemType }) => {
      const gm = (window as any).__gameManager
      const info = gm?.factory?.getMachineAt?.(x, z)
      const sim = gm?.simulation
      const machine = info ? sim?.getMachine?.(info.id) : null
      if (!machine) return false
      const slots: any[] = machine.inputSlots
      if (!Array.isArray(slots)) return false
      slots.push({
        id: `test_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: itemType,
        quality: 80,
        positionOnBelt: 0,
        isDefective: false,
      })
      return true
    }, { x, z, itemType })
  }

  /**
   * Enable processing on the machine at (x, z) by dispatching a
   * START_MACHINE command. Required for assemblers/fabricators to
   * leave the disabled state and consume inputs.
   */
  async enableMachineAt(x: number, z: number): Promise<boolean> {
    return this.page.evaluate(({ x, z }) => {
      const gm = (window as any).__gameManager
      const info = gm?.factory?.getMachineAt?.(x, z)
      const sim = gm?.simulation
      if (!info || !sim || typeof sim.executeCommand !== 'function') return false
      sim.executeCommand({ type: 'START_MACHINE', machineId: info.id })
      const m = sim.getMachine?.(info.id)
      return !!m?.enabled
    }, { x, z })
  }

  /** Force the renderer to re-sync its meshes (recipe-icon color refresh). */
  async forceSync(): Promise<void> {
    await this.page.evaluate(() => {
      const r = (window as any).__getFactoryRenderer?.()
      r?.syncMeshes?.()
    })
  }

  /**
   * Read the recipe's primary output `ItemType` that the renderer has
   * associated with this machine's recipe-icon mesh.
   *
   * Reads via the typed `FactoryRenderer.getRecipeBadgeOutputType`
   * accessor (no direct mesh/userData inspection).
   */
  async readRecipeOutputTypeAt(x: number, z: number): Promise<string | null> {
    return this.page.evaluate(({ x, z }) => {
      const gm = (window as any).__gameManager
      const machine = gm?.factory?.getMachineAt?.(x, z)
      const renderer = (window as any).__getFactoryRenderer?.()
      if (!machine || !renderer) return null
      const t = renderer.getRecipeBadgeOutputType?.(machine.id)
      return typeof t === 'string' ? t : null
    }, { x, z })
  }

  /**
   * Read a stable identifier of the `.material.map` (THREE texture) of
   * the recipe-icon mesh at (x, z). Used to assert that two machines
   * with DIFFERENT recipes render DIFFERENT badge textures.
   *
   * Returns `null` when there is no icon mesh or the material has no map.
   */
  async readTextureKeyAt(x: number, z: number): Promise<string | null> {
    return this.page.evaluate(({ x, z }) => {
      const gm = (window as any).__gameManager
      const machine = gm?.factory?.getMachineAt?.(x, z)
      const renderer = (window as any).__getFactoryRenderer?.()
      const icons: Map<string, any> | undefined = renderer?.recipeIcons
      const mesh = machine && icons ? icons.get(machine.id) : null
      if (!mesh) return null
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const map = mat?.map
      if (!map) return null
      return map.uuid ?? null
    }, { x, z })
  }

  /**
   * Test seam for Bug 2: apply a build-phase "configuration preview"
   * that mirrors what the editor-close hook will do once GREEN lands.
   * The preview is expected to push SET_RECIPE through the same code
   * path the real editor-close hook uses so the icon appears in
   * build_phase without the simulation running.
   *
   * GREEN contract: `gameManager.applyBuildPhaseConfigPreview(machineId, recipeId)`
   * (or a similarly-named public method) takes a machine id + recipe id
   * and updates the live `Machine` instance + recipe-icon mesh.
   *
   * Returns `{ ok: false, reason: '...' }` until that seam exists, so
   * test assertions get an actionable failure message.
   */
  async applyBuildPhaseRecipePreview(
    x: number, z: number, recipeId: string,
  ): Promise<BuildPhasePreviewResult> {
    return this.page.evaluate(({ x, z, recipeId }) => {
      const gm = (window as any).__gameManager
      const info = gm?.factory?.getMachineAt?.(x, z)
      if (!info) return { ok: false, reason: `no machine at (${x},${z})` }
      const fn = gm?.applyBuildPhaseConfigPreview
      if (typeof fn !== 'function') {
        return {
          ok: false,
          reason:
            'gameManager.applyBuildPhaseConfigPreview is not implemented yet. ' +
            'GREEN must add a build-phase preview hook that applies SET_RECIPE ' +
            'commands from the program to live Machine instances.',
        }
      }
      const sim = gm?.simulation
      if (sim && typeof sim.getMachine === 'function' && !sim.getMachine(info.id)
        && typeof gm.populateSimulation === 'function') {
        gm.populateSimulation()
      }
      try {
        fn.call(gm, [{ type: 'SET_RECIPE', machineId: info.id, recipeId }])
      } catch (err) {
        return { ok: false, reason: `applyBuildPhaseConfigPreview threw: ${(err as Error).message}` }
      }
      const m = sim?.getMachine?.(info.id)
      if (!m?.currentRecipe) {
        return { ok: false, reason: 'preview applied but currentRecipe not set on machine' }
      }
      const renderer = (window as any).__getFactoryRenderer?.()
      renderer?.syncMeshes?.()
      return { ok: true }
    }, { x, z, recipeId })
  }

  /**
   * Start the simulation ticking. In sandbox mode this drives the same
   * code path the toolbar Start button uses for sandbox state, EXCEPT
   * that `populateSimulation` is only invoked when no Machine instances
   * exist yet. Re-populating would wipe `currentRecipe` and `inputSlots`
   * set up earlier by `setRecipeAt` / `pushInputItemAt`, so tests that
   * stage state via the probe and then call `startSimulation()` would
   * otherwise lose that state.
   */
  async startSimulation(): Promise<void> {
    await this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      const sim = gm?.simulation
      if (!sim) return
      const alreadyPopulated = (sim.machines?.size ?? sim.getMachines?.().size ?? 0) > 0
      const state = typeof gm.getCurrentState === 'function' ? gm.getCurrentState() : null
      if (state === 'sandbox') {
        if (!sim.running) {
          if (!alreadyPopulated && typeof gm.populateSimulation === 'function') gm.populateSimulation()
          sim.start()
        }
      } else if (state === 'build_phase') {
        if (!alreadyPopulated && typeof gm.populateSimulation === 'function') gm.populateSimulation()
        gm.startSimulation?.()
      }
    })
  }

  /** Set the simulation tick rate (ticks/sec). Used to compress the ~1s grace window. */
  async setTickRate(rate: number): Promise<void> {
    await this.page.evaluate((rate) => {
      const gm = (window as any).__gameManager
      gm?.simulation?.setTickRate?.(rate)
    }, rate)
  }

  /** Read the simulation's current tick counter. */
  async getCurrentTick(): Promise<number> {
    return this.page.evaluate(() => {
      const gm = (window as any).__gameManager
      return Number(gm?.simulation?.currentTick ?? 0)
    })
  }

  /**
   * Push `count` copies of `itemType` directly into a machine's
   * `inputSlots`. Convenience wrapper around `pushInputItemAt`.
   */
  async pushInputItemsAt(x: number, z: number, itemType: string, count: number): Promise<boolean> {
    for (let i = 0; i < count; i++) {
      const ok = await this.pushInputItemAt(x, z, itemType)
      if (!ok) return false
    }
    return true
  }

  /**
   * Sample the recipe-icon color over a wall-clock window. Returns
   * `colorHex` for every sample, in order. Used to assert that the
   * badge does NOT flash red↔white during steady-state production
   * (Bug 3 positive case).
   *
   * Calls `forceSync()` before each read so the sample reflects the
   * renderer's authoritative state, not interpolated visual frames.
   */
  async sampleColorOverTime(
    x: number, z: number, samples: number, intervalMs: number,
  ): Promise<number[]> {
    const out: number[] = []
    for (let i = 0; i < samples; i++) {
      await this.forceSync()
      const s = await this.readForMachineAt(x, z)
      out.push(s.colorHex)
      if (i < samples - 1) {
        await new Promise((r) => setTimeout(r, intervalMs))
      }
    }
    return out
  }

  /**
   * Sample a single RGBA pixel on the badge texture at normalized
   * (sampleU, sampleV) ∈ [0, 1]. Reads the CanvasTexture's backing
   * canvas directly (or copies into a scratch canvas if the image is
   * not a canvas). Returns `null` when there is no badge mesh / map.
   *
   * Used by the glyph-shape tests to assert that a per-item-type glyph
   * is actually drawn on top of the colored tile.
   */
  async readGlyphSampleAt(
    x: number, z: number, sampleU: number, sampleV: number,
  ): Promise<{ r: number; g: number; b: number; a: number } | null> {
    return this.page.evaluate(({ x, z, sampleU, sampleV }) => {
      const gm = (window as any).__gameManager
      const machine = gm?.factory?.getMachineAt?.(x, z)
      const renderer = (window as any).__getFactoryRenderer?.()
      const icons: Map<string, any> | undefined = renderer?.recipeIcons
      const mesh = machine && icons ? icons.get(machine.id) : null
      if (!mesh) return null
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const tex = mat?.map
      const img = tex?.image
      if (!img || !img.width || !img.height) return null
      let ctx: CanvasRenderingContext2D | null = null
      if (typeof (img as any).getContext === 'function') {
        ctx = (img as HTMLCanvasElement).getContext('2d')
      } else {
        const scratch = document.createElement('canvas')
        scratch.width = img.width
        scratch.height = img.height
        const sctx = scratch.getContext('2d')
        if (!sctx) return null
        sctx.drawImage(img, 0, 0)
        ctx = sctx
      }
      if (!ctx) return null
      const px = Math.max(0, Math.min(img.width - 1, Math.floor(sampleU * img.width)))
      const py = Math.max(0, Math.min(img.height - 1, Math.floor(sampleV * img.height)))
      const d = ctx.getImageData(px, py, 1, 1).data
      return { r: d[0], g: d[1], b: d[2], a: d[3] }
    }, { x, z, sampleU, sampleV })
  }

  /**
   * Read ~4 inner-tile samples on the badge as `delta-from-base`
   * fingerprints. Each sample is `(sampleRgb - baseRgb)` where `base`
   * is a point well inside the tile-fill area but away from any
   * centered glyph (top-left inside the rounded rect).
   *
   * If the badge has NO glyph (uniform tile fill), every delta is
   * `[0, 0, 0]` — so the fingerprint is all-zero. This lets tests
   * assert "a glyph was drawn" (non-zero fingerprint) AND "different
   * recipes draw different glyph shapes" (different fingerprints
   * regardless of the underlying tile color).
   *
   * Returns an array of length 12 (`4 samples × 3 channels`) or `null`
   * when the badge / texture is missing.
   */
  async readGlyphFingerprintAt(x: number, z: number): Promise<number[] | null> {
    const base = await this.readGlyphSampleAt(x, z, 0.18, 0.18)
    if (!base) return null
    const innerUVs: Array<[number, number]> = [
      [0.5, 0.5],
      [0.4, 0.5],
      [0.6, 0.5],
      [0.5, 0.65],
    ]
    const out: number[] = []
    for (const [u, v] of innerUVs) {
      const p = await this.readGlyphSampleAt(x, z, u, v)
      if (!p) return null
      out.push(p.r - base.r, p.g - base.g, p.b - base.b)
    }
    return out
  }

  /**
   * Read the renderer's static "recipe dependencies satisfied" verdict
   * for the machine at (x, z) via the typed
   * `FactoryRenderer.getRecipeBadgeDependenciesSatisfied(machineId)`
   * accessor.
   *
   * The accessor returns:
   *   - `true`  → every required input type has an upstream producer
   *               (Fabricator/Assembler/Recycler) whose currently-set
   *               recipe outputs that type → badge WHITE
   *   - `false` → at least one required input has no upstream producer
   *               → badge RED
   *   - `null`  → accessor not implemented yet (GREEN seam missing)
   */
  async getDependenciesSatisfiedAt(x: number, z: number): Promise<boolean | null> {
    return this.page.evaluate(({ x, z }) => {
      const gm = (window as any).__gameManager
      const machine = gm?.factory?.getMachineAt?.(x, z)
      const renderer = (window as any).__getFactoryRenderer?.()
      if (!machine || !renderer) return null
      const fn = renderer.getRecipeBadgeDependenciesSatisfied
      if (typeof fn !== 'function') return null
      const v = fn.call(renderer, machine.id)
      return typeof v === 'boolean' ? v : null
    }, { x, z })
  }

  /**
   * Apply `applyBuildPhaseRecipePreview` for each (x, z, recipeId)
   * spec in order. Returns the first failed result, or
   * `{ ok: true }` when all succeed.
   */
  async applyBuildPhaseRecipePreviewMulti(
    specs: ReadonlyArray<{ x: number; z: number; recipeId: string }>,
  ): Promise<BuildPhasePreviewResult> {
    for (const s of specs) {
      const r = await this.applyBuildPhaseRecipePreview(s.x, s.z, s.recipeId)
      if (!r.ok) return r
    }
    return { ok: true }
  }

  /**
   * Place a belt chain between two machines via the dev-only
   * `window.__test.placeBelt` seam. Returns `false` when the seam is
   * not available or either machine is missing.
   */
  async placeBeltDirect(
    sx: number, sz: number, dx: number, dz: number,
  ): Promise<boolean> {
    return this.page.evaluate(({ sx, sz, dx, dz }) => {
      const fn = (window as any).__test?.placeBelt
      if (typeof fn !== 'function') return false
      return !!fn(sx, sz, dx, dz)
    }, { sx, sz, dx, dz })
  }

  /**
   * Remove every belt whose path touches the given grid cell. Used by
   * B4 to break a previously-established topology and re-trigger the
   * static dependency analysis without touching the program.
   */
  async removeBeltsTouchingCell(x: number, z: number): Promise<number> {
    return this.page.evaluate(({ x, z }) => {
      const gm = (window as any).__gameManager
      const factory = gm?.factory
      if (!factory?.getBelts || !factory.removeBeltById) return 0
      const belts: Array<{ id: string; path: Array<{ x: number; z: number }> }>
        = factory.getBelts()
      let removed = 0
      for (const b of belts) {
        if (b.path?.some((p) => p.x === x && p.z === z)) {
          if (factory.removeBeltById(b.id)) removed++
        }
      }
      const r = (window as any).__getFactoryRenderer?.()
      r?.syncMeshes?.()
      return removed
    }, { x, z })
  }

  /**
   * Wait until the simulation's tick counter has advanced by at least
   * `ticks` ticks from the current value. Uses real wall-clock polling
   * keyed off `Simulation.currentTick`.
   */
  async waitForTicks(ticks: number, timeoutMs = 10_000): Promise<void> {
    const start = await this.getCurrentTick()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const now = await this.getCurrentTick()
      if (now - start >= ticks) return
      await new Promise((r) => setTimeout(r, 25))
    }
    throw new Error(`waitForTicks: simulation did not advance ${ticks} ticks within ${timeoutMs}ms`)
  }
}
