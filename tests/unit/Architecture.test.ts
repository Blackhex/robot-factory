import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

/** Read all .ts files in a directory (non-recursive). */
function tsFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.ts'))
}

/** Assert no file in `dir` matches any of the `patterns`. */
function assertNoImport(
  dir: string,
  label: string,
  patterns: RegExp[],
): void {
  for (const file of tsFilesIn(dir)) {
    const content = readFileSync(join(dir, file), 'utf-8')
    for (const pattern of patterns) {
      expect(
        content,
        `${label}/${file} matches forbidden import ${pattern}`,
      ).not.toMatch(pattern)
    }
  }
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
      /from\s+['"]three['"]/,
      /from\s+['"]pxt-core['"]/,
      /from\s+['"]blockly['"]/,
      /from\s+['"].*rendering\//,
    ]

    it('must not import from three, pxt-core, blockly, or rendering', () => {
      // WHEN + THEN
      assertNoImport(gameDir, 'game', forbidden)
    })

    const extractedFiles = ['BeltRouter.ts', 'PlacementPlanner.ts', 'SlotUtils.ts']
    for (const file of extractedFiles) {
      it(`${file} must not import from three, rendering, ui, or editor`, () => {
        const filePath = join(gameDir, file)
        if (!existsSync(filePath)) return
        const content = readFileSync(filePath, 'utf-8')
        expect(content, `${file} imports from three`).not.toMatch(/from\s+['"]three['"]/);
        expect(content, `${file} imports from rendering`).not.toMatch(/from\s+['"].*rendering\//);
        expect(content, `${file} imports from ui`).not.toMatch(/from\s+['"].*ui\//);
        expect(content, `${file} imports from editor`).not.toMatch(/from\s+['"].*editor\//);
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
        const content = readFileSync(join(uiDir, file), 'utf-8')
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
      // Pure utility functions from game/ that rendering/ is allowed to value-import
      const allowedValueImports = ['slotPositionToOffset', 'slotPositionToOffset,', 'pickBestSlotOffset', 'pickBestSlotOffset,', 'getSlotPositions', 'getSlotPositions,', 'directionToDegrees', 'directionToDegrees,', 'rotateDirectionCW', 'rotateDirectionCW,']

      // WHEN + THEN
      for (const file of tsFilesIn(renderingDir)) {
        const content = readFileSync(join(renderingDir, file), 'utf-8')
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

    it('pxt-target/libs/robot-factory/pxt.json should exist', () => {
      // WHEN + THEN
      expect(existsSync(join(pxtTargetDir, 'libs/robot-factory/pxt.json'))).toBe(true)
    })

    it('pxt-target/libs/robot-factory/factory.ts should exist', () => {
      // WHEN + THEN
      expect(existsSync(join(pxtTargetDir, 'libs/robot-factory/factory.ts'))).toBe(true)
    })

    it('pxt-target/libs/robot-factory/enums.d.ts should exist', () => {
      // WHEN + THEN
      expect(existsSync(join(pxtTargetDir, 'libs/robot-factory/enums.d.ts'))).toBe(true)
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
      'ParticleEffects.ts',
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
