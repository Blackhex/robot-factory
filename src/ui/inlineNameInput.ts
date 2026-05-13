/**
 * Shared factory for inline rename `<input type="text">` fields used by
 * `ProjectsPanel`, `MachinePanel`, and `BeltPanel`. Centralizes the
 * boilerplate (className, value/attribute mirror, `input` event wiring,
 * optional row-gesture stopPropagation).
 *
 * Caller is responsible for `appendChild`-ing the returned element.
 */
export interface InlineNameInputOptions {
  className: string
  onChange: (value: string) => void
  initialValue?: string
  /** When true, swallow row-level click + dblclick that would otherwise
   *  trigger row selection / load. Use for inputs nested inside
   *  click-actionable rows (e.g. ProjectsPanel slot row); not needed for
   *  panel headers (Machine/Belt). */
  stopRowGestures?: boolean
}

export function createInlineNameInput(opts: InlineNameInputOptions): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.className = opts.className
  if (opts.initialValue !== undefined) {
    input.value = opts.initialValue
    // Mirror the property to the HTML attribute so attribute-based
    // selectors (e.g. POM `input[value="..."]`) match on initial render.
    input.setAttribute('value', opts.initialValue)
  }
  input.addEventListener('input', () => opts.onChange(input.value))
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      input.blur()
    }
  })
  if (opts.stopRowGestures) {
    input.addEventListener('click', (e) => e.stopPropagation())
    input.addEventListener('dblclick', (e) => e.stopPropagation())
  }
  return input
}
