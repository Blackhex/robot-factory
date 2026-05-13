/**
 * @vitest-environment jsdom
 *
 * RED-phase contract tests for the shared `createInlineNameInput`
 * helper at `src/ui/inlineNameInput.ts` (does not exist yet).
 *
 * The helper centralizes the boilerplate currently duplicated across
 * `ProjectsPanel`, `MachinePanel`, and `BeltPanel` for inline rename
 * `<input type="text">` fields:
 *   - className + initial value (mirrored to the `value` attribute so
 *     attribute-based selectors match on first render),
 *   - `input` event wired to `onChange(value)`,
 *   - optional `stopRowGestures` flag that adds `click` + `dblclick`
 *     stopPropagation handlers (used inside list rows where the parent
 *     row swallows the gesture as "select" / "load").
 *
 * The helper does NOT attach the input to the DOM — the caller is
 * responsible for `appendChild`.
 */
import { describe, it, expect, vi } from 'vitest'

// NOTE: import will fail at module-resolution time until the GREEN
// agent creates the file. That's intentional — these tests are RED.
import { createInlineNameInput } from '../../../src/ui/inlineNameInput'

describe('createInlineNameInput — shared inline-rename input factory', () => {
  it('returns an HTMLInputElement of type="text" with the requested className', () => {
    const input = createInlineNameInput({
      className: 'cls',
      onChange: () => {},
    })

    expect(input).toBeInstanceOf(HTMLInputElement)
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('text')
    expect(input.className).toBe('cls')
  })

  it('initialValue is reflected on both the .value property AND the value attribute', () => {
    const input = createInlineNameInput({
      className: 'cls',
      initialValue: 'Hello',
      onChange: () => {},
    })

    expect(input.value).toBe('Hello')
    expect(input.getAttribute('value')).toBe('Hello')
  })

  it('without initialValue, .value is "" and getAttribute("value") is null or empty (no crash)', () => {
    const input = createInlineNameInput({
      className: 'cls',
      onChange: () => {},
    })

    expect(input.value).toBe('')
    const attr = input.getAttribute('value')
    expect(attr === null || attr === '').toBe(true)
  })

  it('dispatching an "input" event after assigning .value calls onChange with the new value (per keystroke)', () => {
    const onChange = vi.fn()
    const input = createInlineNameInput({
      className: 'cls',
      initialValue: '',
      onChange,
    })

    input.value = 'X'
    input.dispatchEvent(new Event('input'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('X')

    input.value = 'XY'
    input.dispatchEvent(new Event('input'))
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith('XY')
  })

  it('with stopRowGestures omitted, click/dblclick on the input bubble to the parent listeners', () => {
    const parent = document.createElement('div')
    const input = createInlineNameInput({
      className: 'cls',
      onChange: () => {},
    })
    parent.appendChild(input)

    const onParentClick = vi.fn()
    const onParentDblClick = vi.fn()
    parent.addEventListener('click', onParentClick)
    parent.addEventListener('dblclick', onParentDblClick)

    input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(onParentClick).toHaveBeenCalledTimes(1)
    expect(onParentDblClick).toHaveBeenCalledTimes(1)
  })

  it('with stopRowGestures: false, click/dblclick on the input still bubble to the parent', () => {
    const parent = document.createElement('div')
    const input = createInlineNameInput({
      className: 'cls',
      onChange: () => {},
      stopRowGestures: false,
    })
    parent.appendChild(input)

    const onParentClick = vi.fn()
    const onParentDblClick = vi.fn()
    parent.addEventListener('click', onParentClick)
    parent.addEventListener('dblclick', onParentDblClick)

    input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(onParentClick).toHaveBeenCalledTimes(1)
    expect(onParentDblClick).toHaveBeenCalledTimes(1)
  })

  it('with stopRowGestures: true, click on the input does NOT bubble to the parent', () => {
    const parent = document.createElement('div')
    const input = createInlineNameInput({
      className: 'cls',
      onChange: () => {},
      stopRowGestures: true,
    })
    parent.appendChild(input)

    const onParentClick = vi.fn()
    parent.addEventListener('click', onParentClick)

    input.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onParentClick).not.toHaveBeenCalled()
  })

  it('with stopRowGestures: true, dblclick on the input does NOT bubble to the parent', () => {
    const parent = document.createElement('div')
    const input = createInlineNameInput({
      className: 'cls',
      onChange: () => {},
      stopRowGestures: true,
    })
    parent.appendChild(input)

    const onParentDblClick = vi.fn()
    parent.addEventListener('dblclick', onParentDblClick)

    input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(onParentDblClick).not.toHaveBeenCalled()
  })

  it('does NOT attach the input to the document — caller is responsible for appendChild', () => {
    const input = createInlineNameInput({
      className: 'cls',
      initialValue: 'Hello',
      onChange: () => {},
    })

    expect(input.parentNode).toBeNull()
    expect(document.body.contains(input)).toBe(false)
  })

  it('pressing Enter blurs the input so the editor visually commits', () => {
    const input = createInlineNameInput({
      className: 'cls',
      initialValue: 'Hello',
      onChange: () => {},
    })
    document.body.appendChild(input)
    try {
      input.focus()
      expect(document.activeElement).toBe(input)

      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )

      expect(document.activeElement).not.toBe(input)
    } finally {
      input.remove()
    }
  })

  it('pressing Enter does not fire onChange', () => {
    const onChange = vi.fn()
    const input = createInlineNameInput({
      className: 'cls',
      initialValue: 'Hello',
      onChange,
    })
    document.body.appendChild(input)
    try {
      input.focus()
      const callsBefore = onChange.mock.calls.length

      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )

      expect(onChange.mock.calls.length).toBe(callsBefore)
    } finally {
      input.remove()
    }
  })

  it('pressing Enter calls preventDefault on the event', () => {
    const input = createInlineNameInput({
      className: 'cls',
      initialValue: 'Hello',
      onChange: () => {},
    })
    document.body.appendChild(input)
    try {
      input.focus()
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      })
      input.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
    } finally {
      input.remove()
    }
  })

  it('pressing other keys (e.g. Escape) does not blur the input', () => {
    const input = createInlineNameInput({
      className: 'cls',
      initialValue: 'Hello',
      onChange: () => {},
    })
    document.body.appendChild(input)
    try {
      input.focus()
      expect(document.activeElement).toBe(input)

      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      )

      expect(document.activeElement).toBe(input)
    } finally {
      input.remove()
    }
  })
})
