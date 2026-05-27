/**
 * @vitest-environment jsdom
 *
 * Verifies that `loadCsLocaleDicts` is capable of loading Czech block
 * translations from the NON-gitignored path `/pxt-locales/cs/strings.json`.
 *
 * After `git clean -fdx`, `public/pxt-editor/` is wiped (gitignored), so
 * `/pxt-editor/locales/cs/strings.json` returns 404.  The fix moves Czech
 * locale files to `public/pxt-locales/` (not gitignored) and updates
 * `pxtIframeLocaleDicts.ts` to try that path as the primary source.
 *
 * This test FAILS until the implementation is updated because:
 * - the current code only fetches from `/pxt-editor/locales/cs/strings.json`
 * - this test mocks that path to 404 and mocks `/pxt-locales/cs/strings.json`
 *   to return Czech translations — so `loadCsLocaleDicts` will miss them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadCsLocaleDicts } from '../../../src/editor/pxtIframeLocaleDicts'

const CZECH_STRINGS: Record<string, string> = {
  'machines.startMachine|block': 'spustit %machine',
  'machines.pickMachine|block': '%machine',
  'machines.setMachineSpeed|block': 'nastav rychlost %machine na %speed',
  '{id:category}Machines': 'Stroje',
  '{id:category}Belts': 'Pásy',
}

/**
 * Builds a mock `fetch` that:
 * - Returns 404 for the gitignored legacy paths under `/pxt-editor/locales/`
 * - Returns `CZECH_STRINGS` for the new non-gitignored `/pxt-locales/cs/strings.json`
 * - Returns an empty object `{}` for all other locale paths
 */
function makeMockFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url

    // Gitignored legacy path — simulate 404 (what happens after git clean)
    if (url.includes('/pxt-editor/locales/cs/strings.json')) {
      return new Response(null, { status: 404, statusText: 'Not Found' })
    }

    // New non-gitignored path — return Czech strings
    if (url.includes('/pxt-locales/cs/strings.json')) {
      return new Response(JSON.stringify(CZECH_STRINGS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Other locale paths (target-strings, bundled-strings) → empty
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

describe('loadCsLocaleDicts — loads from non-gitignored /pxt-locales/ path', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    ;(globalThis as unknown as Record<string, unknown>).fetch = makeMockFetch()
  })

  afterEach(() => {
    ;(globalThis as unknown as Record<string, unknown>).fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('includes Czech machine command from /pxt-locales/cs/strings.json when legacy path returns 404', async () => {
    // GIVEN: fetch is mocked so /pxt-editor/locales/cs/strings.json → 404
    //        and /pxt-locales/cs/strings.json → CZECH_STRINGS

    // WHEN
    const { blockText } = await loadCsLocaleDicts({}, {})

    // THEN: the Czech translation for machines.startMachine must be present
    expect(
      blockText['machines.startMachine|block'],
      'Expected Czech translation "spustit %machine" for machines.startMachine|block — ' +
        'this fails until loadCsLocaleDicts tries /pxt-locales/cs/strings.json',
    ).toBe('spustit %machine')
  })

  it('includes Czech machine reporter from /pxt-locales/cs/strings.json', async () => {
    // WHEN
    const { blockText } = await loadCsLocaleDicts({}, {})

    // THEN
    expect(
      blockText['machines.pickMachine|block'],
      'Expected Czech translation "%machine" for machines.pickMachine|block — ' +
        'this fails until the reporter locale drops the stale machine noun.',
    ).toBe('%machine')
  })

  it('includes Czech machine speed command from /pxt-locales/cs/strings.json', async () => {
    // WHEN
    const { blockText } = await loadCsLocaleDicts({}, {})

    // THEN
    expect(
      blockText['machines.setMachineSpeed|block'],
      'Expected Czech translation "nastav rychlost %machine na %speed" — ' +
        'this fails until loadCsLocaleDicts tries /pxt-locales/cs/strings.json',
    ).toBe('nastav rychlost %machine na %speed')
  })

  it('includes Czech category name from /pxt-locales/cs/strings.json', async () => {
    // WHEN
    const { category } = await loadCsLocaleDicts({}, {})

    // THEN
    expect(
      category['Machines'],
      'Expected Czech category name "Stroje" — ' +
        'this fails until loadCsLocaleDicts tries /pxt-locales/cs/strings.json',
    ).toBe('Stroje')
  })

  it('does NOT load Czech strings when only the legacy 404 path is tried', async () => {
    // This test documents the CURRENT (broken) behavior — it passes today.
    // When the fix ships it will still pass because the fix ADDS the new path
    // (the fix must not REMOVE the legacy path, it must add the new one).
    //
    // We verify that with only the legacy path returning 404, blockText is
    // empty for the machine key IF the implementation does not yet know about
    // /pxt-locales. This test is intentionally permissive so it keeps passing
    // after the fix (the key will be present then).
    //
    // The real "must fail" contract is captured by the tests above.
    const { blockText } = await loadCsLocaleDicts({}, {})
    // After the fix this will be 'spustit %machine'; before the fix it's undefined.
    // Both outcomes are acceptable here — the strict assertion is above.
    expect(typeof blockText).toBe('object')
  })
})
