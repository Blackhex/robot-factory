import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * B-9 god-file split: extract `PerBeltMaterialPool` from `BeltMeshRenderer.ts`.
 *
 * These tests are pure source-string assertions. They MUST fail before the
 * extraction lands and pass after. They do NOT exercise runtime behavior;
 * regression coverage is provided by the existing belt-rendering test suite.
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..')
const POOL_PATH = resolve(PROJECT_ROOT, 'src', 'rendering', 'PerBeltMaterialPool.ts')
const RENDERER_PATH = resolve(PROJECT_ROOT, 'src', 'rendering', 'BeltMeshRenderer.ts')

function readSource(absPath: string): string {
  return readFileSync(absPath, 'utf8')
}

describe('B-9: PerBeltMaterialPool extraction from BeltMeshRenderer', () => {
  it('creates src/rendering/PerBeltMaterialPool.ts', () => {
    expect(
      existsSync(POOL_PATH),
      'Expected new file src/rendering/PerBeltMaterialPool.ts to exist',
    ).toBe(true)
  })

  it('PerBeltMaterialPool exports a class with the expected public methods', async () => {
    if (!existsSync(POOL_PATH)) {
      throw new Error(
        'src/rendering/PerBeltMaterialPool.ts does not exist yet — extraction not done',
      )
    }
    const mod = (await import('../../../src/rendering/PerBeltMaterialPool')) as Record<
      string,
      unknown
    >
    const exported = mod.PerBeltMaterialPool as unknown
    expect(typeof exported, 'PerBeltMaterialPool must be exported').toBe('function')
    const ctor = exported as new (...args: unknown[]) => unknown
    const proto = ctor.prototype as Record<string, unknown>
    for (const method of ['getChevron', 'getHighlight', 'disposeBelt', 'disposeAll']) {
      expect(typeof proto[method], `PerBeltMaterialPool#${method} must be a function`).toBe(
        'function',
      )
    }
  })

  it('BeltMeshRenderer.ts no longer declares chevronMaterialsByBelt as a field', () => {
    const src = readSource(RENDERER_PATH)
    // Match the field declaration form, e.g.
    //   private readonly chevronMaterialsByBelt: Map<...> = new Map()
    const fieldDecl = /chevronMaterialsByBelt\s*:\s*Map\s*</
    expect(
      fieldDecl.test(src),
      'BeltMeshRenderer.ts must not declare chevronMaterialsByBelt: Map<...> field; delegate to PerBeltMaterialPool',
    ).toBe(false)
  })

  it('BeltMeshRenderer.ts no longer declares chevronHighlightByBelt as a field', () => {
    const src = readSource(RENDERER_PATH)
    const fieldDecl = /chevronHighlightByBelt\s*:\s*Map\s*</
    expect(
      fieldDecl.test(src),
      'BeltMeshRenderer.ts must not declare chevronHighlightByBelt: Map<...> field; delegate to PerBeltMaterialPool',
    ).toBe(false)
  })

  it('BeltMeshRenderer.ts references PerBeltMaterialPool', () => {
    const src = readSource(RENDERER_PATH)
    expect(
      src.includes('PerBeltMaterialPool'),
      'BeltMeshRenderer.ts must reference PerBeltMaterialPool (import + usage)',
    ).toBe(true)
  })

  it('BeltMeshRenderer.ts is strictly less than 380 lines', () => {
    const src = readSource(RENDERER_PATH)
    const lineCount = src.split(/\r?\n/).length
    expect(
      lineCount,
      `BeltMeshRenderer.ts must shrink to <380 lines after extraction (currently ${lineCount})`,
    ).toBeLessThan(380)
  })
})
