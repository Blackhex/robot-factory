/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { initI18n, switchLanguage } from '../../../src/i18n/i18n'
import { GameOverModal } from '../../../src/ui/GameOverModal'
import type { GameOverInfo } from '../../../src/game/types'

beforeAll(async () => {
  await initI18n()
})

function makeInfo(overrides: Partial<GameOverInfo> = {}): GameOverInfo {
  return {
    reason: 'unconsumable_input',
    machineId: 'm1',
    itemType: 'wheel_small',
    itemId: 'item_1',
    tick: 42,
    ...overrides,
  }
}

describe('GameOverModal', () => {
  let parent: HTMLDivElement
  let modal: GameOverModal

  beforeEach(async () => {
    // Reset language to EN so tests are independent.
    await switchLanguage('en')
    parent = document.createElement('div')
    document.body.appendChild(parent)
    modal = new GameOverModal(parent)
  })

  describe('constructor', () => {
    it('appends a .ui-game-over-modal element to parent', () => {
      // THEN
      expect(parent.querySelector('.ui-game-over-modal')).not.toBeNull()
    })

    it('is hidden by default', () => {
      // THEN
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      expect(el.style.display).toBe('none')
    })

    it('contains a restart button', () => {
      // THEN
      expect(parent.querySelector('.ui-game-over-modal button')).not.toBeNull()
    })
  })

  describe('show()', () => {
    it('makes the modal visible', () => {
      // WHEN
      modal.show(makeInfo())

      // THEN
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      expect(el.style.display).not.toBe('none')
    })

    it('renders the localized reason text mentioning the item type', () => {
      // WHEN
      modal.show(makeInfo({ itemType: 'wheel_small', machineId: 'm1' }))

      // THEN
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      expect(el.textContent).toContain('wheel_small')
    })

    it('renders text mentioning the offending machine', () => {
      // WHEN
      modal.show(makeInfo({ machineId: 'm1', itemType: 'wheel_small' }))

      // THEN
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      expect(el.textContent).toContain('m1')
    })

    it('renders the localized title', () => {
      // WHEN
      modal.show(makeInfo())

      // THEN — title key resolves to a non-empty string in EN.
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      // Title key must resolve to the EN value "Game Over".
      expect(el.textContent).toContain('Game Over')
    })
  })

  describe('hide()', () => {
    it('hides a previously shown modal', () => {
      // GIVEN
      modal.show(makeInfo())
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      expect(el.style.display).not.toBe('none')

      // WHEN
      modal.hide()

      // THEN
      expect(el.style.display).toBe('none')
    })
  })

  describe('onRetry callback', () => {
    it('is called exactly once when the restart button is clicked', () => {
      // GIVEN
      const cb = vi.fn()
      modal.onRetry = cb
      modal.show(makeInfo())

      // WHEN
      const btn = parent.querySelector('.ui-game-over-modal button') as HTMLButtonElement
      btn.click()

      // THEN
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('is not invoked merely by show()/hide()', () => {
      // GIVEN
      const cb = vi.fn()
      modal.onRetry = cb

      // WHEN
      modal.show(makeInfo())
      modal.hide()

      // THEN
      expect(cb).not.toHaveBeenCalled()
    })
  })

  describe('languageChanged', () => {
    it('updates labels when the language changes', async () => {
      // GIVEN — modal shown in EN.
      modal.show(makeInfo())
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      const enText = el.textContent ?? ''
      expect(enText).toContain('Game Over')

      // WHEN
      await switchLanguage('cs')

      // THEN — text content changed (CS title differs from EN "Game Over").
      const csText = el.textContent ?? ''
      expect(csText).not.toBe(enText)
      expect(csText).not.toContain('Game Over')
    })
  })
})
