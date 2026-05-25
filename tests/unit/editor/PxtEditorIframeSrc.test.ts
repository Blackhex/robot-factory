/**
 * @vitest-environment jsdom
 *
 * Ensures the PXT iframe src is built from Vite's `import.meta.env.BASE_URL`
 * so the app works when deployed under a non-root base path (e.g. GitHub
 * Pages at `/robot-factory/`). Hardcoding `/pxt-editor/...` would 404 there.
 *
 * BASE_URL always ends with `/`, so `${BASE_URL}pxt-editor/index.html...`
 * yields `/pxt-editor/...` in dev and `/robot-factory/pxt-editor/...` when
 * the build was run with `VITE_BASE=/robot-factory/`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import i18next from 'i18next'
import { PxtEditor } from '../../../src/editor/PxtEditor'

describe('PxtEditor iframe src — uses Vite BASE_URL', () => {
  let editor: PxtEditor
  let container: HTMLDivElement

  beforeEach(async () => {
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: {} } },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    editor = new PxtEditor()
  })

  afterEach(() => {
    container.remove()
    vi.unstubAllEnvs()
  })

  it('iframe.src ends with `${BASE_URL}pxt-editor/index.html#controller=1`', () => {
    // GIVEN
    const base = import.meta.env.BASE_URL // `/` in the vitest environment

    // WHEN
    editor.mount(container)
    const iframe = container.querySelector('iframe.pxt-editor-iframe') as HTMLIFrameElement | null

    // THEN
    expect(iframe).not.toBeNull()
    const expectedSuffix = `${base}pxt-editor/index.html#controller=1`
    // JSDOM resolves relative srcs against the document base URL, so compare
    // on suffix rather than full string.
    expect(iframe!.src.endsWith(expectedSuffix)).toBe(true)
  })

  it('iframe.src pathname starts with BASE_URL', () => {
    // GIVEN
    const base = import.meta.env.BASE_URL

    // WHEN
    editor.mount(container)
    const iframe = container.querySelector('iframe.pxt-editor-iframe') as HTMLIFrameElement
    const url = new URL(iframe.src)

    // THEN
    expect(url.pathname.startsWith(base)).toBe(true)
    expect(url.pathname).toBe(`${base}pxt-editor/index.html`)
    expect(url.hash).toBe('#controller=1')
  })

  it('respects a non-root BASE_URL (e.g. `/robot-factory/`)', () => {
    // GIVEN
    vi.stubEnv('BASE_URL', '/robot-factory/')

    // WHEN
    editor.mount(container)
    const iframe = container.querySelector('iframe.pxt-editor-iframe') as HTMLIFrameElement
    const url = new URL(iframe.src)

    // THEN
    expect(url.pathname).toBe('/robot-factory/pxt-editor/index.html')
    expect(url.hash).toBe('#controller=1')
  })
})
