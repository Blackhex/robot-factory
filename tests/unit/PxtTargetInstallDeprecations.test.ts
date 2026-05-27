import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface RootPackageJson {
  scripts?: Record<string, string>
}

const REPO_ROOT = resolve(__dirname, '../..')
const ROOT_PACKAGE_JSON_PATH = resolve(REPO_ROOT, 'package.json')

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function getBuildPxtInstallScript(): string {
  const packageJson = readJsonFile<RootPackageJson>(ROOT_PACKAGE_JSON_PATH)
  return packageJson.scripts?.['build:pxt:install'] ?? ''
}

describe('pxt-target install deprecations', () => {
  const buildPxtInstallScript = getBuildPxtInstallScript()
  const warningSuppressionRegex = /--loglevel=error\b|--silent\b/

  it('uses npm install in the owned pxt install step', () => {
    expect(buildPxtInstallScript).toContain('npm install')
  })

  it('suppresses npm warn deprecated output during the pxt install step', () => {
    const hasWarningSuppression = warningSuppressionRegex.test(buildPxtInstallScript)

    expect(
      hasWarningSuppression,
      [
        'The build:pxt:install script must suppress npm warning-level output so install/build logs do not print lines like "npm warn deprecated ...".',
        `Current script: ${buildPxtInstallScript || '<missing>'}`,
        'Add warning suppression on the owned install command (for example --loglevel=error).',
      ].join('\n'),
    ).toBe(true)
  })
})