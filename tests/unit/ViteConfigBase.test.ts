import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import viteConfigExport from '../../vite.config'

type ResolvedLike = { base?: string } | undefined | null

async function resolveConfig(envBase: string | undefined): Promise<ResolvedLike> {
  const previous = process.env.VITE_BASE
  if (envBase === undefined) {
    delete process.env.VITE_BASE
  } else {
    process.env.VITE_BASE = envBase
  }
  try {
    const exported: unknown = viteConfigExport
    let resolved: unknown
    if (typeof exported === 'function') {
      resolved = await (exported as (env: { mode: string; command: 'build' | 'serve' }) => unknown)({
        mode: 'production',
        command: 'build',
      })
    } else {
      resolved = exported
    }
    return resolved as ResolvedLike
  } finally {
    if (previous === undefined) {
      delete process.env.VITE_BASE
    } else {
      process.env.VITE_BASE = previous
    }
  }
}

describe('vite.config base resolution', () => {
  let savedBase: string | undefined

  beforeEach(() => {
    savedBase = process.env.VITE_BASE
    delete process.env.VITE_BASE
  })

  afterEach(() => {
    if (savedBase === undefined) {
      delete process.env.VITE_BASE
    } else {
      process.env.VITE_BASE = savedBase
    }
  })

  it('is exported as a function so it can read env at resolution time', () => {
    expect(typeof viteConfigExport).toBe('function')
  })

  it('defaults base to "/" when VITE_BASE is not set', async () => {
    const resolved = await resolveConfig(undefined)
    expect(resolved).toBeTruthy()
    expect(resolved?.base ?? '/').toBe('/')
  })

  it('uses VITE_BASE when set (e.g. GitHub Pages subpath)', async () => {
    const resolved = await resolveConfig('/robots/')
    expect(resolved).toBeTruthy()
    expect(resolved?.base).toBe('/robots/')
  })
})
