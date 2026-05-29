export type StringMap = Record<string, string>

function normalizeStringMap(input: unknown): StringMap {
  const out: StringMap = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

async function loadJson(path: string): Promise<StringMap> {
  const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch
  if (typeof fetchFn !== 'function') return {}
  try {
    const response = await fetchFn(path)
    if (!response.ok) return {}
    return normalizeStringMap(await response.json())
  } catch {
    return {}
  }
}

function pickCategoryStrings(dict: StringMap): StringMap {
  const out: StringMap = {}
  for (const [k, v] of Object.entries(dict)) {
    if (k.startsWith('{id:category}')) {
      out[k.slice('{id:category}'.length)] = v
    }
  }
  return out
}

// Vite injects BASE_URL ('/' in dev, '/robot-factory/' on GitHub Pages). The
// PXT iframe shares the host origin, so `/pxt-editor/...` would 404 on Pages.
function publicBase(): string {
  const b = (import.meta.env?.BASE_URL ?? '/') as string
  return b.endsWith('/') ? b : `${b}/`
}

export async function loadCsLocaleDicts(
  fallbackCategory: StringMap,
  fallbackBlockText: StringMap,
): Promise<{ category: StringMap; blockText: StringMap }> {
  const base = publicBase()
  const [strings, targetStrings, bundledStrings, nonGitignored] = await Promise.all([
    loadJson(`${base}pxt-editor/locales/cs/strings.json`),
    loadJson(`${base}pxt-editor/locales/cs/target-strings.json`),
    loadJson(`${base}pxt-editor/locales/cs/bundled-strings.json`),
    loadJson(`${base}pxt-locales/cs/strings.json`),
  ])

  const category = {
    ...fallbackCategory,
    ...pickCategoryStrings(strings),
    ...pickCategoryStrings(targetStrings),
    ...pickCategoryStrings(bundledStrings),
    ...pickCategoryStrings(nonGitignored),
  }

  const blockText = {
    ...fallbackBlockText,
    ...strings,
    ...targetStrings,
    ...bundledStrings,
    ...nonGitignored,
  }

  return { category, blockText }
}
