// Polyfill `CSS.escape` for vitest environments where it is missing
// (older jsdom builds). Production code uses `CSS.escape` directly to
// build `[data-slot-id="..."]` selectors after a keyboard reorder.
if (typeof CSS === 'undefined' || typeof CSS.escape !== 'function') {
  ;(globalThis as { CSS?: { escape?: (s: string) => string } }).CSS = {
    ...((globalThis as { CSS?: object }).CSS ?? {}),
    escape: (s: string) => s.replace(/(["\\])/g, '\\$1'),
  }
}
