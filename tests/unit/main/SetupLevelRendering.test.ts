import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Source-string tests pinning that `setupBuildPhase` and `setupSandbox` in
 * `src/main.ts` no longer duplicate the level-rendering boilerplate:
 *
 *   cleanupLevelRendering()
 *   new FactoryRenderer(...)
 *   factoryRenderer.renderGrid()
 *   new ItemRenderer(...)
 *   new ParticleEffects(...)
 *   new GridInteraction(...)
 *   wireGridInteractionCallbacks(...)
 *   gridInteraction.enable()
 *   pxtEditor.setLevel(...)
 *   hud.setLevelName(...)
 *   machinePanel.setAvailableMachineTypes(...)
 *   autoRestoreFactory()
 *   factoryRenderer.syncMeshes()
 *   syncFactoryToEditor()
 *   cameraController.zoomToFit(...)
 *
 * These tests assert the boilerplate has been extracted into a single helper
 * (e.g. `setupLevelRendering(config)`) and that both call sites now invoke
 * the helper instead of repeating the sequence.
 */

const MAIN_TS_PATH = resolve(__dirname, '..', '..', '..', 'src', 'main.ts')

function readMainTs(): string {
  return readFileSync(MAIN_TS_PATH, 'utf-8')
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let idx = 0
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++
    idx += needle.length
  }
  return count
}

/**
 * Find the body line count of a top-level function declaration named `name`.
 * Returns the number of lines strictly between the opening `{` line and the
 * matching closing `}` line (i.e. excludes both brace lines).
 *
 * Uses a simple brace counter starting from the `{` on the function's
 * signature line. Throws if the function is not found or unbalanced.
 */
function functionBodyLineCount(source: string, name: string): number {
  const lines = source.split(/\r?\n/)
  // Match: `function NAME(` or `  function NAME(` (allow leading whitespace),
  // anywhere on the line, with the opening `{` somewhere on the same line.
  const signaturePattern = new RegExp(
    String.raw`\bfunction\s+${name}\s*\(`,
  )

  let startLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (signaturePattern.test(lines[i]!)) {
      startLine = i
      break
    }
  }
  if (startLine === -1) {
    throw new Error(`Function ${name} not found in source`)
  }

  // Find the opening `{` — assume it's on the signature line (true for both
  // setupBuildPhase and setupSandbox today). If not, walk forward.
  let braceDepth = 0
  let openLine = -1
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]!
    for (const ch of line) {
      if (ch === '{') {
        if (openLine === -1) openLine = i
        braceDepth++
      } else if (ch === '}') {
        braceDepth--
        if (braceDepth === 0 && openLine !== -1) {
          // i is the closing brace line; body is (openLine+1 .. i-1)
          return Math.max(0, i - openLine - 1)
        }
      }
    }
  }
  throw new Error(`Unbalanced braces while scanning function ${name}`)
}

describe('main.ts level-rendering boilerplate is extracted into a helper', () => {
  it('contains exactly one `new FactoryRenderer(` call site', () => {
    const source = readMainTs()
    const count = countOccurrences(source, 'new FactoryRenderer(')
    expect(
      count,
      `Expected exactly 1 \`new FactoryRenderer(\` in src/main.ts, ` +
        `found ${count}. The duplicate construction in setupBuildPhase ` +
        `and setupSandbox should be moved into a shared helper ` +
        `(e.g. setupLevelRendering).`,
    ).toBe(1)
  })

  it('contains exactly one `new ItemRenderer(` call site', () => {
    const source = readMainTs()
    const count = countOccurrences(source, 'new ItemRenderer(')
    expect(
      count,
      `Expected exactly 1 \`new ItemRenderer(\` in src/main.ts, ` +
        `found ${count}. Move the duplicated construction into the ` +
        `shared level-rendering helper.`,
    ).toBe(1)
  })

  it('contains exactly one `new GridInteraction(` call site', () => {
    const source = readMainTs()
    const count = countOccurrences(source, 'new GridInteraction(')
    expect(
      count,
      `Expected exactly 1 \`new GridInteraction(\` in src/main.ts, ` +
        `found ${count}. Move the duplicated construction into the ` +
        `shared level-rendering helper.`,
    ).toBe(1)
  })

  it('contains exactly one `wireGridInteractionCallbacks(` call site', () => {
    const source = readMainTs()
    // Only count *call* sites, not the function declaration itself.
    const total = countOccurrences(source, 'wireGridInteractionCallbacks(')
    const declarations = countOccurrences(
      source,
      'function wireGridInteractionCallbacks(',
    )
    const calls = total - declarations
    expect(
      calls,
      `Expected exactly 1 call to \`wireGridInteractionCallbacks(\` in ` +
        `src/main.ts, found ${calls} (total occurrences ${total}, ` +
        `${declarations} declaration). Both setupBuildPhase and ` +
        `setupSandbox call it today; the shared helper should call it once.`,
    ).toBe(1)
  })

  it('declares a `setupLevelRendering` helper', () => {
    const source = readMainTs()
    expect(
      /\bsetupLevelRendering\b/.test(source),
      `Expected src/main.ts to declare a \`setupLevelRendering\` helper ` +
        `that wraps the cleanup → renderer → interaction → editor sync ` +
        `→ camera zoom sequence used by setupBuildPhase and setupSandbox.`,
    ).toBe(true)
  })

  it('setupBuildPhase body is fewer than 18 lines (was ~35)', () => {
    const source = readMainTs()
    const bodyLines = functionBodyLineCount(source, 'setupBuildPhase')
    expect(
      bodyLines,
      `setupBuildPhase body is ${bodyLines} lines; expected < 18 after ` +
        `extracting level-rendering boilerplate into setupLevelRendering. ` +
        `If the helper exists but the body is still long, the helper ` +
        `is probably not being used here.`,
    ).toBeLessThan(18)
  })

  it('setupSandbox body is fewer than 18 lines (was ~30)', () => {
    const source = readMainTs()
    const bodyLines = functionBodyLineCount(source, 'setupSandbox')
    expect(
      bodyLines,
      `setupSandbox body is ${bodyLines} lines; expected < 18 after ` +
        `extracting level-rendering boilerplate into setupLevelRendering. ` +
        `If the helper exists but the body is still long, the helper ` +
        `is probably not being used here.`,
    ).toBeLessThan(18)
  })
})
