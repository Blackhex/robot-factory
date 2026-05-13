import { vi } from 'vitest'

export interface CapturedDownload {
  url: string
  href: string
  download: string
  jsonText: string
}

export interface ExportHarness {
  downloads: CapturedDownload[]
  restore: () => void
}

export interface ImportHarness {
  fire: (jsonText: string | string[]) => Promise<void>
  restore: () => void
}

// jsdom-only: Blob exposes its byte buffer via Symbol(impl)._bytes,
// letting us materialize the JSON text synchronously inside the click
// interceptor (so CapturedDownload.jsonText is a plain string field).
function readBlobJsonTextSync(blob: Blob): string {
  const sym = Object.getOwnPropertySymbols(blob).find((s) => s.toString() === 'Symbol(impl)')
  if (!sym) {
    throw new Error('saveLoadHarness: Blob has no Symbol(impl); jsdom internals changed?')
  }
  const impl = (blob as unknown as Record<symbol, { _bytes?: Uint8Array }>)[sym]
  const bytes = impl?._bytes
  if (!bytes) {
    throw new Error('saveLoadHarness: BlobImpl has no _bytes; jsdom internals changed?')
  }
  return new TextDecoder('utf-8').decode(bytes)
}

export function installExportHarness(): ExportHarness {
  const downloads: CapturedDownload[] = []
  const blobByUrl = new Map<string, Blob>()

  let counter = 0
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = vi.fn((blob: Blob): string => {
    const url = `blob:mock-${counter++}`
    blobByUrl.set(url, blob)
    return url
  }) as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn(() => {}) as typeof URL.revokeObjectURL

  const originalAnchorClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement): void {
    const href = this.href
    const blob = blobByUrl.get(href)
    if (blob) {
      downloads.push({
        url: href,
        href,
        download: this.download,
        jsonText: readBlobJsonTextSync(blob),
      })
    }
  }

  return {
    downloads,
    restore: (): void => {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      HTMLAnchorElement.prototype.click = originalAnchorClick
    },
  }
}

export function installImportHarness(): ImportHarness {
  const queue: string[][] = []

  const originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((
    tagName: string,
    options?: ElementCreationOptions,
  ): HTMLElement => {
    const el = originalCreateElement(tagName, options)
    if (tagName.toLowerCase() === 'input') {
      const input = el as HTMLInputElement
      const originalClick = input.click.bind(input)
      input.click = (): void => {
        const next = queue.shift()
        if (next === undefined) {
          originalClick()
          return
        }
        const fileList = next.map(
          (content, i) =>
            new File([content], `file-${i}.json`, { type: 'application/json' }),
        )
        Object.defineProperty(input, 'files', {
          configurable: true,
          get: () => fileList as unknown as FileList,
        })
        queueMicrotask(() => {
          input.dispatchEvent(new Event('change'))
        })
      }
    }
    return el
  }) as typeof document.createElement)

  return {
    fire: async (jsonText: string | string[]): Promise<void> => {
      queue.push(Array.isArray(jsonText) ? jsonText : [jsonText])
      await Promise.resolve()
    },
    restore: (): void => {
      vi.restoreAllMocks()
    },
  }
}

export function wrapBundle(saveBody: unknown, name = 'sample'): string {
  return JSON.stringify({
    version: 1,
    type: 'bundle',
    projects: [{ name, save: saveBody }],
  })
}
