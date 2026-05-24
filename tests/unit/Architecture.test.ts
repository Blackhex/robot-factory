import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

/** Read all .ts files in a directory recursively. */
function tsFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name)
    if (entry.isDirectory()) return tsFilesIn(entryPath)
    return entry.name.endsWith('.ts') ? [entryPath] : []
  })
}

/** Assert no file in `dir` matches any of the `patterns`. */
function assertNoImport(
  dir: string,
  label: string,
  patterns: RegExp[],
): void {
  for (const file of tsFilesIn(dir)) {
    const content = readFileSync(file, 'utf-8')
    const fileLabel = relative(dir, file).replace(/\\/g, '/')
    for (const pattern of patterns) {
      expect(
        content,
        `${label}/${fileLabel} matches forbidden import ${pattern}`,
      ).not.toMatch(pattern)
    }
  }
}

function importSpecifiers(content: string): string[] {
  const specifiers: string[] = []
  const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g
  const dynamicImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const pattern of [importPattern, dynamicImportPattern]) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      specifiers.push(match[1])
    }
  }

  return specifiers
}

function normalizeTsFilePath(path: string): string {
  const withoutExtension = path.replace(/\.ts$/, '')
  return `${withoutExtension}.ts`
}

function localGameDependencies(file: string, files: Set<string>): string[] {
  const content = readFileSync(file, 'utf-8')
  return importSpecifiers(content)
    .filter((specifier) => specifier.startsWith('./') || specifier.startsWith('../'))
    .map((specifier) => normalizeTsFilePath(resolve(dirname(file), specifier)))
    .filter((resolvedFile) => files.has(resolvedFile))
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  function visit(file: string): string[] | null {
    if (visiting.has(file)) {
      return stack.slice(stack.indexOf(file)).concat(file)
    }
    if (visited.has(file)) return null

    visiting.add(file)
    stack.push(file)
    for (const dependency of graph.get(file) ?? []) {
      const cycle = visit(dependency)
      if (cycle) return cycle
    }
    stack.pop()
    visiting.delete(file)
    visited.add(file)

    return null
  }

  for (const file of graph.keys()) {
    const cycle = visit(file)
    if (cycle) return cycle
  }

  return null
}

describe('Architecture', () => {
  const gameDir = join(__dirname, '../../src/game')
  const editorDir = join(__dirname, '../../src/editor')
  const pxtTargetDir = join(__dirname, '../../pxt-target')
  const uiDir = join(__dirname, '../../src/ui')
  const audioDir = join(__dirname, '../../src/audio')
  const utilsDir = join(__dirname, '../../src/utils')
  const renderingDir = join(__dirname, '../../src/rendering')

  // ── src/game/ ─────────────────────────────────────────
  describe('src/game/ isolation', () => {
    const forbidden = [
      /from\s+['"]three(?:\/[^'"]*)?['"]/,
      /from\s+['"]pxt-core['"]/,
      /from\s+['"]blockly['"]/,
      /from\s+['"][^'"]*(?:src\/)?rendering(?:\/|['"])/,
      /from\s+['"][^'"]*(?:src\/)?editor(?:\/|['"])/,
      /from\s+['"][^'"]*(?:src\/)?ui(?:\/|['"])/,
      /import\s*\(\s*['"]three(?:\/[^'"]*)?['"]\s*\)/,
      /import\s*\(\s*['"][^'"]*(?:src\/)?rendering(?:\/|['"])\s*\)/,
      /import\s*\(\s*['"][^'"]*(?:src\/)?editor(?:\/|['"])\s*\)/,
      /import\s*\(\s*['"][^'"]*(?:src\/)?ui(?:\/|['"])\s*\)/,
    ]

    it('must not import from three, pxt-core, blockly, rendering, editor, or ui', () => {
      // WHEN + THEN
      assertNoImport(gameDir, 'game', forbidden)
    })

    it('must not use DOM APIs', () => {
      // WHEN + THEN
      assertNoImport(gameDir, 'game', [
        /\bdocument\./,
        /\bwindow\./,
        /\bHTMLElement\b/,
        /\bHTMLCanvasElement\b/,
        /\bDOMRect\b/,
        /\bMouseEvent\b/,
        /\bPointerEvent\b/,
        /\bKeyboardEvent\b/,
        /\baddEventListener\s*\(/,
        /\bremoveEventListener\s*\(/,
      ])
    })

    it('must not have circular dependencies between game modules', () => {
      // GIVEN
      const files = new Set(tsFilesIn(gameDir).map((file) => resolve(file)))
      const graph = new Map(
        [...files].map((file) => [file, localGameDependencies(file, files)]),
      )

      // WHEN
      const cycle = findCycle(graph)

      // THEN
      expect(
        cycle?.map((file) => relative(gameDir, file).replace(/\\/g, '/')).join(' -> '),
      ).toBeUndefined()
    })

    const extractedFiles = [
      'BeltRouter.ts',
      'ConnectedBeltEditOrchestrator.ts',
      'FactoryMachineMover.ts',
      'FactorySimulationSync.ts',
      'GridReader.ts',
      'PlacementPlanner.ts',
      'PlacementPathEvaluator.ts',
      'PlacementPlanTypes.ts',
      'ReconnectPreviewPlanner.ts',
      'SlotUtils.ts',
    ]
    for (const file of extractedFiles) {
      it(`${file} must not import from three, rendering, ui, or editor`, () => {
        const filePath = join(gameDir, file)
        if (!existsSync(filePath)) return
        const content = readFileSync(filePath, 'utf-8')
        expect(content, `${file} imports from three`).not.toMatch(/from\s+['"]three(?:\/[^'"]*)?['"]|import\s*\(\s*['"]three(?:\/[^'"]*)?['"]\s*\)/)
        expect(content, `${file} imports from rendering`).not.toMatch(/from\s+['"][^'"]*(?:src\/)?rendering(?:\/|['"])|import\s*\(\s*['"][^'"]*(?:src\/)?rendering(?:\/|['"])\s*\)/)
        expect(content, `${file} imports from ui`).not.toMatch(/from\s+['"][^'"]*(?:src\/)?ui(?:\/|['"])|import\s*\(\s*['"][^'"]*(?:src\/)?ui(?:\/|['"])\s*\)/)
        expect(content, `${file} imports from editor`).not.toMatch(/from\s+['"][^'"]*(?:src\/)?editor(?:\/|['"])|import\s*\(\s*['"][^'"]*(?:src\/)?editor(?:\/|['"])\s*\)/)
      })
    }
  })

  // ── src/editor/ ───────────────────────────────────────
  describe('src/editor/ isolation', () => {
    const forbidden = [
      /from\s+['"]three['"]/,
      /from\s+['"].*rendering\//,
      /from\s+['"]blockly['"]/ ,
    ]

    it('must not import from three, rendering, or blockly', () => {
      // WHEN + THEN
      assertNoImport(editorDir, 'editor', forbidden)
    })
  })

  // ── src/ui/ ───────────────────────────────────────────
  describe('src/ui/ isolation', () => {
    it('must not import from three', () => {
      // WHEN + THEN
      assertNoImport(uiDir, 'ui', [/from\s+['"]three['"]/])
    })

    it('rendering imports use "import type" only', () => {
      // WHEN + THEN
      for (const file of tsFilesIn(uiDir)) {
        const content = readFileSync(file, 'utf-8')
        const renderingImports =
          content.match(/^import\s.*from\s+['"].*rendering\/.*/gm) ?? []
        for (const imp of renderingImports) {
          expect(
            imp,
            `ui/${file} has non-type import from rendering: ${imp}`,
          ).toMatch(/import\s+type\s/)
        }
      }
    })

    it('BeltPanel.ts must not import from rendering', () => {
      // GIVEN
      const filePath = join(uiDir, 'BeltPanel.ts')
      if (!existsSync(filePath)) return

      // WHEN + THEN
      const content = readFileSync(filePath, 'utf-8')
      expect(content, 'BeltPanel imports from rendering').not.toMatch(/from\s+['"].*rendering\//)
    })
  })

  // ── src/audio/ ────────────────────────────────────────
  describe('src/audio/ isolation', () => {
    it('must not import from three', () => {
      // WHEN + THEN
      assertNoImport(audioDir, 'audio', [/from\s+['"]three['"]/])
    })
  })

  // ── src/utils/ ────────────────────────────────────────
  describe('src/utils/ isolation', () => {
    const forbidden = [
      /from\s+['"]three['"]/,
      /from\s+['"].*rendering\//,
    ]

    it('must not import from three or rendering', () => {
      // WHEN + THEN
      assertNoImport(utilsDir, 'utils', forbidden)
    })
  })

  // ── src/rendering/ ────────────────────────────────────
  describe('src/rendering/ only imports types from game', () => {
    it('game imports use "import type" only (except pure utility functions)', () => {
      // GIVEN
      // Pure utility functions from game/ that rendering/ is allowed to value-import.
      // `ConveyorBelt` is allowed because rendering only uses its static helpers
      // (`parseSegmentId`, `segmentIdFor`) — pure, stateless utilities — never
      // its constructor or instance methods.
      const allowedValueImports = ['slotPositionToOffset', 'slotPositionToOffset,', 'pickBestSlotOffset', 'pickBestSlotOffset,', 'getSlotPositions', 'getSlotPositions,', 'directionToDegrees', 'directionToDegrees,', 'rotateDirectionCW', 'rotateDirectionCW,', 'ConveyorBelt', 'ConveyorBelt,']

      // WHEN + THEN
      for (const file of tsFilesIn(renderingDir)) {
        const content = readFileSync(file, 'utf-8')
        const gameImports = content.match(/^import\s.*from\s+['"].*game\/.*/gm) ?? []
        for (const imp of gameImports) {
          const isTypeImport = /import\s+type\s/.test(imp)
          if (!isTypeImport) {
            // Check if the import only brings in allowed utility functions
            const importedNames = imp.replace(/^import\s*\{/, '').replace(/\}.*$/, '')
              .split(',').map((s: string) => s.trim()).filter(Boolean)
            const allAllowed = importedNames.every(
              (name: string) => allowedValueImports.some((a) => name.startsWith(a)),
            )
            expect(
              allAllowed,
              `rendering/${file} has non-type import from game: ${imp}`,
            ).toBe(true)
          }
        }
      }
    })

    it('must not value-import the concrete Machine or Recipe classes from game/', () => {
      // GIVEN — renderer talks to machines through the abstract MachineRuntimeView
      // shape exposed by MachineMeshRenderer; value-importing the concrete Machine
      // or Recipe classes (constructors / static members) from game/ would
      // re-couple the rendering layer to the simulation's internal entity types.
      // Pure `import type` references are allowed because they are erased at
      // compile time and don't create runtime coupling.

      // WHEN + THEN
      for (const file of tsFilesIn(renderingDir)) {
        const content = readFileSync(file, 'utf-8')
        const fileLabel = relative(renderingDir, file).replace(/\\/g, '/')
        const matches = content.match(
          /^import\s+(?!type\s)[^;]*?\bfrom\s+['"][^'"]*game\/(?:Machine|Recipe)(?:\.ts)?['"]/gm,
        ) ?? []
        expect(
          matches,
          `rendering/${fileLabel} value-imports from game/Machine or game/Recipe: ${matches.join(' | ')}`,
        ).toEqual([])
      }
    })
  })

  // ── File existence: game ──────────────────────────────
  describe('required game files exist', () => {
    const expectedFiles = [
      'types.ts',
      'Item.ts',
      'Machine.ts',
      'Recipe.ts',
      'ConveyorBelt.ts',
      'Simulation.ts',
      'Factory.ts',
      'Level.ts',
      'Scoring.ts',
      'GameManager.ts',
      'BeltRouter.ts',
      'PlacementPlanner.ts',
      'SlotUtils.ts',
    ]

    for (const file of expectedFiles) {
      it(`src/game/${file} should exist`, () => {
        expect(existsSync(join(gameDir, file)), `${file} not found`).toBe(true)
      })
    }
  })

  // ── File existence: editor ────────────────────────────
  describe('required editor files exist', () => {
    const expectedEditorFiles = [
      'BlockInterpreter.ts',
      'FactoryToolbox.ts',
      'PxtEditor.ts',
    ]

    for (const file of expectedEditorFiles) {
      it(`src/editor/${file} should exist`, () => {
        expect(existsSync(join(editorDir, file)), `${file} not found`).toBe(true)
      })
    }

  })

  // ── File existence: pxt-target ─────────────────────
  describe('required pxt-target files exist', () => {
    it('pxt-target/pxtarget.json should exist', () => {
      // WHEN + THEN
      expect(existsSync(join(pxtTargetDir, 'pxtarget.json'))).toBe(true)
    })

    it('pxt-target/libs/core/pxt.json should exist', () => {
      // WHEN + THEN
      expect(existsSync(join(pxtTargetDir, 'libs/core/pxt.json'))).toBe(true)
    })

    it('pxt-target/libs/core/factory.ts should exist', () => {
      // WHEN + THEN
      expect(existsSync(join(pxtTargetDir, 'libs/core/factory.ts'))).toBe(true)
    })

    it('pxt-target/libs/core/enums.d.ts should exist', () => {
      // WHEN + THEN
      expect(existsSync(join(pxtTargetDir, 'libs/core/enums.d.ts'))).toBe(true)
    })
  })

  // ── File existence: rendering ─────────────────────────
  describe('required rendering files exist', () => {
    const expectedFiles = [
      'SceneManager.ts',
      'FactoryRenderer.ts',
      'ItemRenderer.ts',
      'CameraController.ts',
      'GridInteraction.ts',
      'RobotPreview.ts',
      'RenderingAssets.ts',
    ]

    for (const file of expectedFiles) {
      it(`src/rendering/${file} should exist`, () => {
        expect(existsSync(join(renderingDir, file)), `${file} not found`).toBe(true)
      })
    }
  })

  // ── File existence: ui ────────────────────────────────
  describe('required ui files exist', () => {
    const expectedFiles = [
      'HUD.ts',
      'LevelSelect.ts',
      'MainMenu.ts',
      'ScoreScreen.ts',
      'Toolbar.ts',
      'TutorialOverlay.ts',
    ]

    for (const file of expectedFiles) {
      it(`src/ui/${file} should exist`, () => {
        expect(existsSync(join(uiDir, file)), `${file} not found`).toBe(true)
      })
    }
  })

  // ── File existence: audio ─────────────────────────────
  describe('required audio files exist', () => {
    it('src/audio/AudioManager.ts should exist', () => {
      // WHEN + THEN
      expect(existsSync(join(audioDir, 'AudioManager.ts'))).toBe(true)
    })
  })

  // ── File existence: utils ─────────────────────────────
  describe('required utils files exist', () => {
    it('src/utils/SaveLoad.ts should exist', () => {
      // WHEN + THEN
      expect(existsSync(join(utilsDir, 'SaveLoad.ts'))).toBe(true)
    })
  })
})
