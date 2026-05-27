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
 *
 * Iframe URL contract: `?lang=<locale>` is ALWAYS emitted (including for
 * the `en` default). PXT honours URL lang over its persisted `PXT_LANG`
 * cookie; omitting `?lang=en` lets a cookie left over from an earlier CS
 * session pollute later EN sessions (the editor permanently renders Czech
 * until the cookie is manually cleared). See `src/editor/PxtEditor.ts`
 * `mount()` for the matching cookie-overwrite.
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

  it('iframe.src matches `${BASE_URL}pxt-editor/index.html?lang=<locale>#controller=1`', () => {
    // GIVEN
    const base = import.meta.env.BASE_URL // `/` in the vitest environment

    // WHEN
    editor.mount(container)
    const iframe = container.querySelector('iframe.pxt-editor-iframe') as HTMLIFrameElement | null

    // THEN
    expect(iframe).not.toBeNull()
    const expectedRe = new RegExp(`${base.replace(/\//g, '\\/')}pxt-editor\\/index\\.html\\?lang=[a-z]{2}#controller=1$`)
    expect(iframe!.src).toMatch(expectedRe)
  })

  it('iframe.src URL has pathname under BASE_URL and emits `?lang=en` by default', () => {
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
    expect(url.searchParams.get('lang')).toBe('en')
  })

  it('respects a non-root BASE_URL (e.g. `/robot-factory/`) and still emits `?lang=`', () => {
    // GIVEN
    vi.stubEnv('BASE_URL', '/robot-factory/')

    // WHEN
    editor.mount(container)
    const iframe = container.querySelector('iframe.pxt-editor-iframe') as HTMLIFrameElement
    const url = new URL(iframe.src)

    // THEN
    expect(url.pathname).toBe('/robot-factory/pxt-editor/index.html')
    expect(url.hash).toBe('#controller=1')
    expect(url.searchParams.get('lang')).toBe('en')
  })
})
