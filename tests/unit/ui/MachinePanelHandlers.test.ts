import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Source-string tests pinning the wiring of `machinePanel.onTypeChange` and
 * `machinePanel.onNameChange` callbacks in `src/main.ts`.
 *
 * Bug being prevented: changing a machine's type or name was updating the
 * factory model but not pushing the new machine list into the PXT editor
 * (so block dropdowns kept showing stale names) and — for the type change
 * path — was not autosaving either.
 *
 * The fix requires both handlers to call `syncFactoryToEditor()` and
 * `void autoSaveFactory()` after a successful update.
 */

const ROOT = resolve(__dirname, '..', '..', '..')
const MAIN_TS_PATH = resolve(ROOT, 'src', 'main.ts')

function findMatchingBrace(source: string, openIdx: number): number {
  if (source[openIdx] !== '{') return -1
  let depth = 0
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Extract the body of the first handler assignment matching
 * `machinePanel.<handlerName> = ...`. Returns the inside of the outermost
 * `{ ... }` of the assigned function.
 */
function extractHandlerBody(source: string, handlerName: string): string {
  const marker = `machinePanel.${handlerName} =`
  const start = source.indexOf(marker)
  expect(start, `handler assignment for ${handlerName} not found`).toBeGreaterThanOrEqual(0)
  const openBrace = source.indexOf('{', start)
  expect(openBrace, `opening brace for ${handlerName} not found`).toBeGreaterThanOrEqual(0)
  const closeBrace = findMatchingBrace(source, openBrace)
  expect(closeBrace, `closing brace for ${handlerName} not found`).toBeGreaterThan(openBrace)
  return source.slice(openBrace + 1, closeBrace)
}

describe('main.ts machinePanel handlers', () => {
  const source = readFileSync(MAIN_TS_PATH, 'utf8')

  it('onTypeChange calls syncFactoryToEditor() after a successful type update', () => {
    const body = extractHandlerBody(source, 'onTypeChange')
    expect(body).toContain('syncFactoryToEditor()')
  })

  it('onTypeChange calls void autoSaveFactory() after a successful type update', () => {
    const body = extractHandlerBody(source, 'onTypeChange')
    expect(body).toContain('void autoSaveFactory()')
  })

  it('onNameChange calls syncFactoryToEditor() after renameMachine', () => {
    const body = extractHandlerBody(source, 'onNameChange')
    expect(body).toContain('syncFactoryToEditor()')
  })

  it('onNameChange calls void autoSaveFactory() after renameMachine', () => {
    const body = extractHandlerBody(source, 'onNameChange')
    expect(body).toContain('void autoSaveFactory()')
  })
})
