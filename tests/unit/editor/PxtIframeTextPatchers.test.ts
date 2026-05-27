/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { createPxtIframeTextPatchers } from '../../../src/editor/pxtIframeTextPatchers'

describe('createPxtIframeTextPatchers', () => {
  it('removes empty placeholder nodes so flyout layout does not reserve blank space', () => {
    const patchers = createPxtIframeTextPatchers(
      {} as Window,
      () => true,
      () => ({}),
      () => ({ machine: '' }),
    )

    const root = document.createElement('div')
    const text = document.createElement('span')
    text.textContent = 'machine'
    root.append(text)

    patchers.tryPatch(text)

    expect(root.querySelector('span')).toBeNull()
  })

  it('removes whitespace-only nodes such as NBSP placeholders', () => {
    const patchers = createPxtIframeTextPatchers(
      {} as Window,
      () => true,
      () => ({}),
      () => ({ machine: '' }),
    )

    const root = document.createElement('div')
    const text = document.createElement('span')
    text.className = 'blocklyText'
    text.textContent = '\u00A0'
    root.append(text)

    patchers.tryPatch(text)

    expect(root.querySelector('span')).toBeNull()
  })

  it('sweeps the DOM and removes suppressed placeholder nodes', () => {
    const patchers = createPxtIframeTextPatchers(
      {} as Window,
      () => true,
      () => ({}),
      () => ({ machine: '' }),
    )

    const root = document.createElement('div')
    root.innerHTML = '<span class="blocklyText">machine</span>'

    patchers.sweep(root)

    expect(root.querySelector('.blocklyText')).toBeNull()
  })
})
