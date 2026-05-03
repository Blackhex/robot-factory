/**
 * @vitest-environment jsdom
 *
 * RED tests for the build-phase Level Brief panel.
 *
 * The component does not exist yet — `src/ui/LevelBrief.ts` is intentionally
 * missing. Tests 3-8 import it dynamically so that the locale-key tests
 * (1-2) can still execute even while the module is absent.
 */

import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import i18next from 'i18next'
import { initI18n } from '../../../src/i18n/i18n'
import { getLevelByNumber, type LevelDefinition } from '../../../src/game/Level'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function loadLocaleRaw(name: 'en' | 'cs'): Record<string, unknown> {
  const path = join(__dirname, '..', '..', '..', 'src', 'locales', `${name}.json`)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function getNested(obj: Record<string, unknown>, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, obj)
}

/**
 * Dynamically import the LevelBrief class. Wrapped so that tests which do
 * not need the implementation (locale-key existence checks) are unaffected
 * by the module being missing.
 *
 * The `@vite-ignore` comment prevents Vite's import-analysis pass from
 * resolving the path at transform time — this lets the locale-key tests
 * (1 + 2) execute even when `src/ui/LevelBrief.ts` does not yet exist.
 */
type LevelBriefModule = { LevelBrief: new (parent: HTMLElement) => {
  setLevel(level: LevelDefinition): void
  show(): void
  hide(): void
  dispose(): void
} }

async function importLevelBrief(): Promise<LevelBriefModule> {
  // Path is built at runtime to defeat Vite's import-analysis pass — this
  // lets the locale-key tests (1 + 2) execute even when the module file
  // does not yet exist on disk.
  const moduleName = 'LevelBrief'
  const path = `../../../src/ui/${moduleName}.ts`
  return (await import(/* @vite-ignore */ path)) as LevelBriefModule
}

// -----------------------------------------------------------------------------
// 1 + 2: Locale key declarations
// -----------------------------------------------------------------------------

describe('LevelBrief — locale keys are declared', () => {
  const expectedTokens: Record<string, string[]> = {
    'level_brief.goal.produce_robots': ['{{count}}', '{{item}}'],
    'level_brief.goal.produce_parts': ['{{count}}', '{{item}}'],
    'level_brief.goal.quality_target': ['{{percent}}'],
    'level_brief.goal.time_limit': ['{{seconds}}'],
  }

  for (const locale of ['en', 'cs'] as const) {
    describe(`${locale}.json`, () => {
      for (const [key, tokens] of Object.entries(expectedTokens)) {
        it(`declares ${key} as a non-empty string with interpolation tokens ${tokens.join(', ')}`, () => {
          const data = loadLocaleRaw(locale)
          const value = getNested(data, key)

          expect(typeof value).toBe('string')
          expect((value as string).length).toBeGreaterThan(0)
          for (const token of tokens) {
            expect(value as string).toContain(token)
          }
        })
      }
    })
  }
})

// -----------------------------------------------------------------------------
// 3-8: Component behaviour
// -----------------------------------------------------------------------------

describe('LevelBrief — component behaviour', () => {
  let parent: HTMLDivElement
  // Loaded lazily inside beforeAll once the module exists.
  // Until then every behaviour test will fail with "Cannot find module …/LevelBrief".
  let LevelBriefCtor: LevelBriefModule['LevelBrief']

  beforeAll(async () => {
    await initI18n()
    const mod = await importLevelBrief()
    LevelBriefCtor = mod.LevelBrief
  })

  beforeEach(async () => {
    // Always reset to English between tests so language-change tests are deterministic.
    if (i18next.language !== 'en') {
      await i18next.changeLanguage('en')
    }
    parent = document.createElement('div')
    document.body.appendChild(parent)
  })

  afterEach(() => {
    parent.remove()
  })

  function getRoot(): HTMLElement | null {
    return parent.querySelector<HTMLElement>('.ui-level-brief')
  }

  // ---------------------------------------------------------------------------
  // 3. Constructor mounts a hidden root element
  // ---------------------------------------------------------------------------
  it('mounts a single hidden .ui-level-brief root under the parent', () => {
    // GIVEN
    const brief = new LevelBriefCtor(parent)

    // THEN
    const roots = parent.querySelectorAll('.ui-level-brief')
    expect(roots.length).toBe(1)
    const root = roots[0] as HTMLElement
    expect(root.style.display).toBe('none')

    brief.dispose()
  })

  // ---------------------------------------------------------------------------
  // 4. setLevel(level1) renders name + description + 1 produce_parts goal
  // ---------------------------------------------------------------------------
  it('renders name, description and a single produce_parts goal for level_1', () => {
    // GIVEN
    const level1 = getLevelByNumber(1) as LevelDefinition
    expect(level1).toBeDefined()
    expect(level1.id).toBe('level_1')

    const brief = new LevelBriefCtor(parent)

    // WHEN
    brief.setLevel(level1)

    // THEN
    const root = getRoot()
    expect(root).not.toBeNull()

    const nameEl = root!.querySelector<HTMLElement>('.ui-level-brief-name')
    const descEl = root!.querySelector<HTMLElement>('.ui-level-brief-description')
    expect(nameEl).not.toBeNull()
    expect(descEl).not.toBeNull()
    expect(nameEl!.textContent).toBe(i18next.t(level1.nameKey))
    expect(descEl!.textContent).toBe(i18next.t(level1.descriptionKey))

    const goals = root!.querySelectorAll('.ui-level-brief-goal')
    expect(goals.length).toBe(1)

    const goal = level1.goals[0]
    expect(goal.type).toBe('produce_parts')
    expect(goal.target).toBe(3)
    expect(goal.itemType).toBe('wheel_small')

    const expected = i18next.t('level_brief.goal.produce_parts', {
      count: goal.target,
      item: i18next.t('items.' + goal.itemType),
    })
    expect(goals[0].textContent).toBe(expected)

    brief.dispose()
  })

  // ---------------------------------------------------------------------------
  // 5. setLevel(level4) renders 2 goal entries
  // ---------------------------------------------------------------------------
  it('renders two goal entries for level_4 (produce_robots + quality_target)', () => {
    // GIVEN
    const level4 = getLevelByNumber(4) as LevelDefinition
    expect(level4).toBeDefined()
    expect(level4.id).toBe('level_4')
    expect(level4.goals.length).toBe(2)

    const brief = new LevelBriefCtor(parent)

    // WHEN
    brief.setLevel(level4)

    // THEN
    const root = getRoot()!
    const goals = root.querySelectorAll<HTMLElement>('.ui-level-brief-goal')
    expect(goals.length).toBe(2)

    const robotsGoal = level4.goals[0]
    const qualityGoal = level4.goals[1]
    expect(robotsGoal.type).toBe('produce_robots')
    expect(qualityGoal.type).toBe('quality_target')

    const expectedRobots = i18next.t('level_brief.goal.produce_robots', {
      count: robotsGoal.target,
      item: i18next.t('items.' + robotsGoal.itemType),
    })
    const expectedQuality = i18next.t('level_brief.goal.quality_target', {
      percent: qualityGoal.target,
    })

    expect(goals[0].textContent).toBe(expectedRobots)
    expect(goals[1].textContent).toBe(expectedQuality)

    brief.dispose()
  })

  // ---------------------------------------------------------------------------
  // 6. show()/hide() toggle CSS display
  // ---------------------------------------------------------------------------
  it('toggles display via show() and hide()', () => {
    // GIVEN
    const brief = new LevelBriefCtor(parent)
    const root = getRoot()!
    expect(root.style.display).toBe('none')

    // WHEN
    brief.show()

    // THEN — visible (any non-"none" value such as "flex" or "block")
    expect(root.style.display).not.toBe('none')
    expect(root.style.display.length).toBeGreaterThan(0)

    // WHEN
    brief.hide()

    // THEN
    expect(root.style.display).toBe('none')

    brief.dispose()
  })

  // ---------------------------------------------------------------------------
  // 7. Language change re-renders content
  // ---------------------------------------------------------------------------
  it('re-renders content when i18next language changes', async () => {
    // GIVEN
    const level1 = getLevelByNumber(1) as LevelDefinition
    const brief = new LevelBriefCtor(parent)
    brief.setLevel(level1)

    const root = getRoot()!
    const nameEl = root.querySelector<HTMLElement>('.ui-level-brief-name')!
    const descEl = root.querySelector<HTMLElement>('.ui-level-brief-description')!
    const goalEl = root.querySelector<HTMLElement>('.ui-level-brief-goal')!

    const enName = nameEl.textContent
    const enDesc = descEl.textContent
    const enGoal = goalEl.textContent

    // Sanity: english strings are present
    expect(enName).toBe(i18next.t(level1.nameKey))

    // WHEN
    await i18next.changeLanguage('cs')

    // THEN — labels reflect the Czech translations
    const csName = i18next.t(level1.nameKey)
    const csDesc = i18next.t(level1.descriptionKey)
    const csGoal = i18next.t('level_brief.goal.produce_parts', {
      count: level1.goals[0].target,
      item: i18next.t('items.' + level1.goals[0].itemType),
    })

    // The actual locale should have differing strings. Pin both:
    // (a) the rendered DOM matches the new locale's t() output, and
    // (b) at least one of them changed (proves a re-render occurred).
    expect(nameEl.textContent).toBe(csName)
    expect(descEl.textContent).toBe(csDesc)
    expect(goalEl.textContent).toBe(csGoal)

    const changed =
      nameEl.textContent !== enName ||
      descEl.textContent !== enDesc ||
      goalEl.textContent !== enGoal
    expect(changed).toBe(true)

    brief.dispose()
  })

  // ---------------------------------------------------------------------------
  // 8. dispose() removes the element and stops responding to language changes
  // ---------------------------------------------------------------------------
  it('removes the root and stops listening to language changes after dispose()', async () => {
    // GIVEN
    const level1 = getLevelByNumber(1) as LevelDefinition
    const brief = new LevelBriefCtor(parent)
    brief.setLevel(level1)
    const root = getRoot()
    expect(root).not.toBeNull()

    // Capture the rendered name node and its English text BEFORE dispose so
    // we can later verify that no language-changed listener still mutates it.
    const nameEl = root!.querySelector<HTMLElement>('.ui-level-brief-name')!
    const englishName = nameEl.textContent
    expect(englishName).toBe(i18next.t(level1.nameKey))

    // WHEN
    brief.dispose()

    // THEN — DOM detached
    expect(getRoot()).toBeNull()
    expect(parent.querySelectorAll('.ui-level-brief').length).toBe(0)

    // AND — changing the language after dispose must not throw, must not
    // recreate the element, and must NOT mutate the previously-rendered
    // node (behavioral proof that the languageChanged listener was removed).
    await i18next.changeLanguage('cs')
    expect(getRoot()).toBeNull()
    expect(nameEl.textContent).toBe(englishName)

    await i18next.changeLanguage('en')
    expect(getRoot()).toBeNull()
    expect(nameEl.textContent).toBe(englishName)
  })
})
