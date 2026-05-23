/**
 * RED-step contract test for the removal of the Quality Checker
 * machine label from the locale files.
 *
 * Both `src/locales/en.json` and `src/locales/cs.json` currently
 * carry a `machines.quality_checker` label (the `machineTypes` namespace
 * referenced in the task spec doesn't exist in this codebase — labels
 * live under `machines.*`). After the GREEN step the key MUST be gone.
 *
 * Note: the Level 4 description revision (Task D) is intentionally
 * outside this RED test's scope — only the label key is asserted here.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadLocale(name: 'en' | 'cs'): Record<string, unknown> {
  const path = join(__dirname, '..', '..', '..', 'src', 'locales', `${name}.json`)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

describe('Locales — Checker removal', () => {
  for (const locale of ['en', 'cs'] as const) {
    describe(`${locale}.json`, () => {
      it('has no `machines.quality_checker` label', () => {
        const data = loadLocale(locale)
        const machines = data.machines as Record<string, unknown> | undefined
        expect(machines, '`machines` namespace must exist').toBeDefined()
        expect(Object.keys(machines!)).not.toContain('quality_checker')
        expect(machines!['quality_checker']).toBeUndefined()
      })

      // Defensive: also reject the alternate `machineTypes.quality_checker`
      // namespace mentioned in the task spec, in case it ever gets
      // introduced as part of the cleanup.
      it('has no `machineTypes.quality_checker` label', () => {
        const data = loadLocale(locale)
        const machineTypes = data.machineTypes as Record<string, unknown> | undefined
        if (machineTypes !== undefined) {
          expect(Object.keys(machineTypes)).not.toContain('quality_checker')
        }
      })
    })
  }
})
