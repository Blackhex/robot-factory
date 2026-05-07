/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'
import { initI18n, switchLanguage } from '../../../src/i18n/i18n'
import { GameOverModal } from '../../../src/ui/GameOverModal'
import type { GameOverInfo } from '../../../src/game/types'

beforeAll(async () => {
  await initI18n()
})

type GameOverModalInfo = Parameters<GameOverModal['show']>[0]
type GameOverModalInfoWithMachineName = GameOverModalInfo & {
  machineName?: string
}

function makeInfo(overrides: Partial<GameOverModalInfo> = {}): GameOverModalInfo {
  return {
    reason: 'unconsumable_input',
    machineId: 'machine_6',
    itemType: 'wheel_small',
    itemId: 'item_1',
    tick: 42,
    ...overrides,
  }
}

function makeInfoWithMachineName(
  overrides: Partial<GameOverModalInfoWithMachineName> = {},
): GameOverModalInfoWithMachineName {
  return {
    ...makeInfo(),
    ...overrides,
  }
}

type GameOverInfoWithMachineType = GameOverInfo & {
  machineType: 'part_fabricator'
}

type GameOverInfoWithDisabledDestinationCause = GameOverInfo & {
  machineType: 'factory_output'
  cause: 'machine_disabled'
}

function makeFriendlyInfo(
  overrides: Partial<GameOverInfoWithMachineType> = {},
): GameOverInfoWithMachineType {
  return {
    ...makeInfo(),
    machineType: 'part_fabricator',
    ...overrides,
  }
}

function makeDisabledShipperInfo(
  overrides: Partial<GameOverInfoWithDisabledDestinationCause> = {},
): GameOverInfoWithDisabledDestinationCause {
  return {
    ...makeInfo(),
    machineType: 'factory_output',
    cause: 'machine_disabled',
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

  afterEach(() => {
    // Dispose so the modal's i18next 'languageChanged' subscription does not
    // leak into subsequent tests (each constructor adds another listener).
    modal.dispose()
    parent.remove()
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

    it('renders player-facing localized item and machine names instead of raw ids', () => {
      // WHEN
      modal.show(makeFriendlyInfo())

      // THEN
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      expect(el.textContent).toContain('Fabricator')
      expect(el.textContent).toContain('Small Wheel')
      expect(el.textContent).not.toContain('machine_6')
      expect(el.textContent).not.toContain('wheel_small')
    })

    it('renders the localized title', () => {
      // WHEN
      modal.show(makeInfo())

      // THEN — title key resolves to a non-empty string in EN.
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      // Title key must resolve to the EN value "Game Over".
      expect(el.textContent).toContain('Game Over')
    })

    it('renders a precise stopped-machine message for a stopped Shipper with explicit machine recovery text', () => {
      // WHEN — model the real cause as a disabled destination machine,
      // not a generic recipe mismatch.
      modal.show(makeDisabledShipperInfo())

      // THEN — keep player-facing names, but require the stopped-specific
      // wording and an explicit machine name in the recovery sentence.
      const messageEl = parent.querySelector('.ui-game-over-message') as HTMLElement
      expect(messageEl.textContent).toBe(
        "The Shipper is stopped, so it can't accept Small Wheel. Start the Shipper and try again.",
      )

      const modalEl = parent.querySelector('.ui-game-over-modal') as HTMLElement
      expect(modalEl.textContent).not.toContain('machine_6')
      expect(modalEl.textContent).not.toContain('wheel_small')
    })

    it('includes the stopped machine\'s actual display name when it is provided', () => {
      // WHEN — the game over payload identifies the exact destination machine
      // that is stopped, not just its machine type.
      modal.show(makeInfoWithMachineName({
        machineType: 'factory_output',
        machineName: 'North Dock Shipper',
        cause: 'machine_disabled',
      }) as GameOverModalInfo)

      // THEN — the player should see the exact machine name so they can find
      // it in the factory, while still keeping the machine type visible.
      const messageEl = parent.querySelector('.ui-game-over-message') as HTMLElement
      expect(messageEl.textContent).toContain('North Dock Shipper')
      expect(messageEl.textContent).toContain('Shipper')
      expect(messageEl.textContent).toContain('Small Wheel')
    })

    it('ignores autogenerated default machine names and falls back to the localized machine type', () => {
      // WHEN — the simulation forwards only an autogenerated default label
      // for a factory output instead of a player-authored machine name.
      modal.show(makeInfoWithMachineName({
        machineType: 'factory_output',
        machineName: 'Factory Output 1',
        cause: 'machine_disabled',
      }) as GameOverModalInfo)

      // THEN — placeholder names should be hidden from the player in favor of
      // the localized machine type label.
      const messageEl = parent.querySelector('.ui-game-over-message') as HTMLElement
      expect(messageEl.textContent).toContain('Shipper')
      expect(messageEl.textContent).not.toContain('Factory Output 1')
      expect(messageEl.textContent).toContain('Small Wheel')
    })

    it('keeps the generic unconsumable-input message when only machineType is present', () => {
      // WHEN — machineType is available for player-facing naming, but the
      // payload does not explicitly report a disabled/stopped cause.
      modal.show(makeInfo({ machineType: 'factory_output' }))

      // THEN — keep localized names, but do not infer a disabled-machine
      // explanation from the machine type alone.
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      expect(el.textContent).toContain('Shipper')
      expect(el.textContent).toContain('Small Wheel')
      expect(el.textContent).toContain("can't use")
      expect(el.textContent).not.toMatch(/stopped|disabled/i)
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

  describe('no_recipe reason', () => {
    function makeNoRecipeInfo(): GameOverModalInfo {
      // itemId/itemType intentionally omitted — they are absent for no_recipe.
      return {
        reason: 'no_recipe',
        machineId: 'm_1',
        machineType: 'part_fabricator',
        machineName: 'Press 1',
        tick: 5,
      } as unknown as GameOverModalInfo
    }

    it('renders the localized no_recipe message including the machine name', () => {
      // WHEN
      modal.show(makeNoRecipeInfo())

      // THEN — message must come from the localized 'game_over.reason.no_recipe'
      // key (NOT the raw key string), interpolated with the machine name.
      const messageEl = parent.querySelector('.ui-game-over-message') as HTMLElement
      const text = messageEl.textContent ?? ''
      expect(text).not.toBe('game_over.reason.no_recipe')
      expect(text.length).toBeGreaterThan(0)
      expect(text).toContain('Press 1')
    })

    it('updates the no_recipe message when the language changes', async () => {
      // GIVEN
      modal.show(makeNoRecipeInfo())
      const messageEl = parent.querySelector('.ui-game-over-message') as HTMLElement
      const enText = messageEl.textContent ?? ''
      expect(enText).not.toBe('game_over.reason.no_recipe')
      expect(enText).toContain('Press 1')

      // WHEN
      await switchLanguage('cs')

      // THEN
      const csText = messageEl.textContent ?? ''
      expect(csText).not.toBe('game_over.reason.no_recipe')
      expect(csText).not.toBe(enText)
      expect(csText).toContain('Press 1')
    })
  })

  describe('languageChanged', () => {
    it('keeps player-facing names when the language changes', async () => {
      // GIVEN — modal shown in EN.
      modal.show(makeFriendlyInfo())
      const el = parent.querySelector('.ui-game-over-modal') as HTMLElement
      const enText = el.textContent ?? ''
      expect(enText).toContain('Game Over')
      expect(enText).toContain('Fabricator')
      expect(enText).toContain('Small Wheel')
      expect(enText).not.toContain('machine_6')
      expect(enText).not.toContain('wheel_small')

      // WHEN
      await switchLanguage('cs')

      // THEN — text content changed (CS title differs from EN "Game Over").
      const csText = el.textContent ?? ''
      expect(csText).not.toBe(enText)
      expect(csText).not.toContain('Game Over')
      expect(csText).toContain('Vyráběč')
      expect(csText).toContain('Malé kolo')
      expect(csText).not.toContain('machine_6')
      expect(csText).not.toContain('wheel_small')
    })
  })
})
