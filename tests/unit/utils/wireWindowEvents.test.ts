/**
 * @vitest-environment jsdom
 *
 * RED-step tests for the `Q` keyboard shortcut that toggles the Projects
 * panel in sandbox mode, mirroring the existing `E`-toggles-editor shortcut
 * in `src/utils/wireWindowEvents.ts`.
 *
 * These tests are written BEFORE the implementation. They will fail because
 * `WireWindowEventsOptions.toggleProjects` does not yet exist and pressing
 * `q` / `Q` is not yet wired to invoke it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { wireWindowEvents } from '../../../src/utils/wireWindowEvents'

type Options = Parameters<typeof wireWindowEvents>[0]

interface TestOptions {
  canvasContainer: HTMLElement
  getState: ReturnType<typeof vi.fn>
  toggleEditor: ReturnType<typeof vi.fn>
  toggleProjects: ReturnType<typeof vi.fn>
  toggleSimulation: ReturnType<typeof vi.fn>
  restartSimulation: ReturnType<typeof vi.fn>
  resetView: ReturnType<typeof vi.fn>
  backToMainMenu: ReturnType<typeof vi.fn>
  isEscapeBlocked: ReturnType<typeof vi.fn>
  resizeScene: ReturnType<typeof vi.fn>
  refitCamera: ReturnType<typeof vi.fn>
}

function makeOptions(state: string = 'sandbox'): TestOptions {
  const canvasContainer = document.createElement('div')
  document.body.appendChild(canvasContainer)
  return {
    canvasContainer,
    getState: vi.fn(() => state),
    toggleEditor: vi.fn(),
    toggleProjects: vi.fn(),
    toggleSimulation: vi.fn(),
    restartSimulation: vi.fn(),
    resetView: vi.fn(),
    backToMainMenu: vi.fn(),
    isEscapeBlocked: vi.fn(() => false),
    resizeScene: vi.fn(),
    refitCamera: vi.fn(),
  }
}

function wire(opts: TestOptions): void {
  // Cast through unknown so the test compiles before AND after the GREEN
  // step adds `toggleProjects` to the public option type.
  trackDispose(wireWindowEvents(opts as unknown as Options))
}

const activeDisposers: Array<() => void> = []

function trackDispose(dispose: () => void): void {
  activeDisposers.push(dispose)
}

function disposeAll(): void {
  while (activeDisposers.length > 0) {
    const dispose = activeDisposers.pop()
    dispose?.()
  }
}

afterEach(() => {
  disposeAll()
})

function pressKey(key: string, target?: EventTarget): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true })
  if (target) {
    Object.defineProperty(event, 'target', { value: target })
  }
  window.dispatchEvent(event)
}

describe('wireWindowEvents — Q toggles Projects panel', () => {
  let cleanupTargets: HTMLElement[] = []

  beforeEach(() => {
    cleanupTargets = []
  })

  afterEach(() => {
    for (const el of cleanupTargets) {
      el.remove()
    }
    document.body.innerHTML = ''
  })

  describe('Q in sandbox state', () => {
    it('lowercase q calls toggleProjects exactly once', () => {
      const opts = makeOptions('sandbox')
      wire(opts)

      pressKey('q')

      expect(opts.toggleProjects).toHaveBeenCalledTimes(1)
    })

    it('uppercase Q calls toggleProjects exactly once', () => {
      const opts = makeOptions('sandbox')
      wire(opts)

      pressKey('Q')

      expect(opts.toggleProjects).toHaveBeenCalledTimes(1)
    })
  })

  describe('Q in non-sandbox states', () => {
    const nonSandboxStates = [
      'main_menu',
      'level_select',
      'build_phase',
      'play_phase',
      'level_complete',
    ]

    for (const state of nonSandboxStates) {
      it(`is ignored in ${state} state`, () => {
        const opts = makeOptions(state)
        wire(opts)

        pressKey('q')
        pressKey('Q')

        expect(opts.toggleProjects).not.toHaveBeenCalled()
      })
    }
  })

  describe('Q ignored on editable targets', () => {
    it('does not fire when target is an INPUT', () => {
      const opts = makeOptions('sandbox')
      wire(opts)
      const input = document.createElement('input')
      document.body.appendChild(input)
      cleanupTargets.push(input)

      pressKey('q', input)

      expect(opts.toggleProjects).not.toHaveBeenCalled()
    })

    it('does not fire when target is a TEXTAREA', () => {
      const opts = makeOptions('sandbox')
      wire(opts)
      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      cleanupTargets.push(textarea)

      pressKey('q', textarea)

      expect(opts.toggleProjects).not.toHaveBeenCalled()
    })

    it('does not fire when target is a SELECT', () => {
      const opts = makeOptions('sandbox')
      wire(opts)
      const select = document.createElement('select')
      document.body.appendChild(select)
      cleanupTargets.push(select)

      pressKey('q', select)

      expect(opts.toggleProjects).not.toHaveBeenCalled()
    })
  })

  describe('Q and E are independent shortcuts', () => {
    it('pressing Q does not call toggleEditor', () => {
      const opts = makeOptions('sandbox')
      wire(opts)

      pressKey('q')
      pressKey('Q')

      expect(opts.toggleEditor).not.toHaveBeenCalled()
    })

    it('pressing E does not call toggleProjects', () => {
      const opts = makeOptions('sandbox')
      wire(opts)

      pressKey('e')
      pressKey('E')

      expect(opts.toggleProjects).not.toHaveBeenCalled()
    })
  })

  describe('toggleProjects is optional', () => {
    it('does not throw when toggleProjects is omitted and q is pressed', () => {
      const canvasContainer = document.createElement('div')
      document.body.appendChild(canvasContainer)
      const opts: Options = {
        canvasContainer,
        getState: () => 'sandbox',
        toggleEditor: vi.fn(),
        resizeScene: vi.fn(),
        refitCamera: vi.fn(),
      }

      trackDispose(wireWindowEvents(opts))

      expect(() => pressKey('q')).not.toThrow()
      expect(() => pressKey('Q')).not.toThrow()
    })
  })
})

describe('wireWindowEvents — E continues to toggle Editor (regression)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lowercase e toggles editor in build_phase state', () => {
    const opts = makeOptions('build_phase')
    wire(opts)

    pressKey('e')

    expect(opts.toggleEditor).toHaveBeenCalledTimes(1)
  })

  it('uppercase E toggles editor in build_phase state', () => {
    const opts = makeOptions('build_phase')
    wire(opts)

    pressKey('E')

    expect(opts.toggleEditor).toHaveBeenCalledTimes(1)
  })

  it('lowercase e toggles editor in sandbox state', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    pressKey('e')

    expect(opts.toggleEditor).toHaveBeenCalledTimes(1)
  })

  it('uppercase E toggles editor in sandbox state', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    pressKey('E')

    expect(opts.toggleEditor).toHaveBeenCalledTimes(1)
  })

  it('is ignored in non-build, non-sandbox states (main_menu)', () => {
    const opts = makeOptions('main_menu')
    wire(opts)

    pressKey('e')
    pressKey('E')

    expect(opts.toggleEditor).not.toHaveBeenCalled()
  })

  it('is ignored when target is an INPUT', () => {
    const opts = makeOptions('build_phase')
    wire(opts)
    const input = document.createElement('input')
    document.body.appendChild(input)

    pressKey('e', input)

    expect(opts.toggleEditor).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// RED-step tests for the four new shortcuts: F / R / Space / Esc
// ---------------------------------------------------------------------------
//
// These tests are written BEFORE the implementation. They will fail because
// `WireWindowEventsOptions` does not yet expose `toggleSimulation`,
// `restartSimulation`, `resetView`, `backToMainMenu`, or `isEscapeBlocked`,
// and the corresponding keydown handlers do not yet exist in
// `src/utils/wireWindowEvents.ts`.
// ---------------------------------------------------------------------------

interface PressInit {
  key: string
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

function dispatchKeyOnWindow(init: PressInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: init.key,
    code: init.code ?? '',
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
  })
  window.dispatchEvent(event)
  return event
}

function dispatchKeyOnTarget(target: EventTarget, init: PressInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: init.key,
    code: init.code ?? '',
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
  })
  target.dispatchEvent(event)
  return event
}

const GAME_STATES = ['build_phase', 'play_phase', 'sandbox'] as const
const NON_GAME_STATES = [
  'main_menu',
  'level_select',
  'score_screen',
] as const
const ESC_GAME_STATES = [
  'level_select',
  'build_phase',
  'play_phase',
  'sandbox',
  'score_screen',
] as const
const MODIFIERS: Array<keyof Pick<PressInit, 'ctrlKey' | 'metaKey' | 'altKey'>> = [
  'ctrlKey',
  'metaKey',
  'altKey',
]
const EDITABLE_TAGS: Array<['input' | 'textarea' | 'select', string]> = [
  ['input', 'INPUT'],
  ['textarea', 'TEXTAREA'],
  ['select', 'SELECT'],
]

describe('F shortcut — toggles simulation', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  for (const state of GAME_STATES) {
    it(`lowercase f calls toggleSimulation once in ${state}`, () => {
      const opts = makeOptions(state)
      wire(opts)

      dispatchKeyOnWindow({ key: 'f', code: 'KeyF' })

      expect(opts.toggleSimulation).toHaveBeenCalledTimes(1)
    })

    it(`uppercase F calls toggleSimulation once in ${state}`, () => {
      const opts = makeOptions(state)
      wire(opts)

      dispatchKeyOnWindow({ key: 'F', code: 'KeyF' })

      expect(opts.toggleSimulation).toHaveBeenCalledTimes(1)
    })
  }

  for (const state of NON_GAME_STATES) {
    it(`is ignored in ${state} state`, () => {
      const opts = makeOptions(state)
      wire(opts)

      dispatchKeyOnWindow({ key: 'f', code: 'KeyF' })
      dispatchKeyOnWindow({ key: 'F', code: 'KeyF' })

      expect(opts.toggleSimulation).not.toHaveBeenCalled()
    })
  }

  for (const [tagName, label] of EDITABLE_TAGS) {
    it(`is ignored when target is a ${label}`, () => {
      const opts = makeOptions('sandbox')
      wire(opts)
      const el = document.createElement(tagName)
      document.body.appendChild(el)

      dispatchKeyOnTarget(el, { key: 'f', code: 'KeyF' })

      expect(opts.toggleSimulation).not.toHaveBeenCalled()
    })
  }

  for (const modifier of MODIFIERS) {
    it(`is ignored when ${modifier} is held`, () => {
      const opts = makeOptions('sandbox')
      wire(opts)

      dispatchKeyOnWindow({ key: 'f', code: 'KeyF', [modifier]: true })

      expect(opts.toggleSimulation).not.toHaveBeenCalled()
    })
  }

  it('does not throw when toggleSimulation is omitted', () => {
    const canvasContainer = document.createElement('div')
    document.body.appendChild(canvasContainer)
    const opts: Options = {
      canvasContainer,
      getState: () => 'sandbox',
      toggleEditor: vi.fn(),
      resizeScene: vi.fn(),
      refitCamera: vi.fn(),
    }
    trackDispose(wireWindowEvents(opts))

    expect(() => dispatchKeyOnWindow({ key: 'f', code: 'KeyF' })).not.toThrow()
    expect(() => dispatchKeyOnWindow({ key: 'F', code: 'KeyF' })).not.toThrow()
  })

  it('does not invoke any other callback', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    dispatchKeyOnWindow({ key: 'f', code: 'KeyF' })

    expect(opts.restartSimulation).not.toHaveBeenCalled()
    expect(opts.resetView).not.toHaveBeenCalled()
    expect(opts.backToMainMenu).not.toHaveBeenCalled()
    expect(opts.toggleEditor).not.toHaveBeenCalled()
    expect(opts.toggleProjects).not.toHaveBeenCalled()
  })
})

describe('R shortcut — restarts simulation', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  for (const state of GAME_STATES) {
    it(`lowercase r calls restartSimulation once in ${state}`, () => {
      const opts = makeOptions(state)
      wire(opts)

      dispatchKeyOnWindow({ key: 'r', code: 'KeyR' })

      expect(opts.restartSimulation).toHaveBeenCalledTimes(1)
    })

    it(`uppercase R calls restartSimulation once in ${state}`, () => {
      const opts = makeOptions(state)
      wire(opts)

      dispatchKeyOnWindow({ key: 'R', code: 'KeyR' })

      expect(opts.restartSimulation).toHaveBeenCalledTimes(1)
    })
  }

  for (const state of NON_GAME_STATES) {
    it(`is ignored in ${state} state`, () => {
      const opts = makeOptions(state)
      wire(opts)

      dispatchKeyOnWindow({ key: 'r', code: 'KeyR' })
      dispatchKeyOnWindow({ key: 'R', code: 'KeyR' })

      expect(opts.restartSimulation).not.toHaveBeenCalled()
    })
  }

  for (const [tagName, label] of EDITABLE_TAGS) {
    it(`is ignored when target is a ${label}`, () => {
      const opts = makeOptions('sandbox')
      wire(opts)
      const el = document.createElement(tagName)
      document.body.appendChild(el)

      dispatchKeyOnTarget(el, { key: 'r', code: 'KeyR' })

      expect(opts.restartSimulation).not.toHaveBeenCalled()
    })
  }

  for (const modifier of MODIFIERS) {
    it(`is ignored when ${modifier} is held`, () => {
      const opts = makeOptions('sandbox')
      wire(opts)

      dispatchKeyOnWindow({ key: 'r', code: 'KeyR', [modifier]: true })

      expect(opts.restartSimulation).not.toHaveBeenCalled()
    })
  }

  it('does not throw when restartSimulation is omitted', () => {
    const canvasContainer = document.createElement('div')
    document.body.appendChild(canvasContainer)
    const opts: Options = {
      canvasContainer,
      getState: () => 'sandbox',
      toggleEditor: vi.fn(),
      resizeScene: vi.fn(),
      refitCamera: vi.fn(),
    }
    trackDispose(wireWindowEvents(opts))

    expect(() => dispatchKeyOnWindow({ key: 'r', code: 'KeyR' })).not.toThrow()
    expect(() => dispatchKeyOnWindow({ key: 'R', code: 'KeyR' })).not.toThrow()
  })
})

describe('Space shortcut — resets camera view', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  for (const state of GAME_STATES) {
    it(`Space calls resetView once in ${state}`, () => {
      const opts = makeOptions(state)
      wire(opts)

      dispatchKeyOnWindow({ key: ' ', code: 'Space' })

      expect(opts.resetView).toHaveBeenCalledTimes(1)
    })
  }

  for (const state of NON_GAME_STATES) {
    it(`is ignored in ${state} state`, () => {
      const opts = makeOptions(state)
      wire(opts)

      dispatchKeyOnWindow({ key: ' ', code: 'Space' })

      expect(opts.resetView).not.toHaveBeenCalled()
    })
  }

  for (const [tagName, label] of EDITABLE_TAGS) {
    it(`is ignored when target is a ${label}`, () => {
      const opts = makeOptions('sandbox')
      wire(opts)
      const el = document.createElement(tagName)
      document.body.appendChild(el)

      dispatchKeyOnTarget(el, { key: ' ', code: 'Space' })

      expect(opts.resetView).not.toHaveBeenCalled()
    })
  }

  for (const modifier of MODIFIERS) {
    it(`is ignored when ${modifier} is held`, () => {
      const opts = makeOptions('sandbox')
      wire(opts)

      dispatchKeyOnWindow({ key: ' ', code: 'Space', [modifier]: true })

      expect(opts.resetView).not.toHaveBeenCalled()
    })
  }

  for (const tag of ['button', 'a', 'summary'] as const) {
    it(`is ignored when target is a ${tag.toUpperCase()} (so Space still activates it)`, () => {
      const opts = makeOptions('sandbox')
      wire(opts)
      const el = document.createElement(tag)
      document.body.appendChild(el)

      dispatchKeyOnTarget(el, { key: ' ', code: 'Space' })

      expect(opts.resetView).not.toHaveBeenCalled()
    })
  }

  it('calls preventDefault when about to invoke resetView', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    })
    const spy = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)

    expect(opts.resetView).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does NOT call preventDefault when state gating rejects', () => {
    const opts = makeOptions('main_menu')
    wire(opts)

    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    })
    const spy = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)

    expect(opts.resetView).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('does NOT call preventDefault when target is editable', () => {
    const opts = makeOptions('sandbox')
    wire(opts)
    const input = document.createElement('input')
    document.body.appendChild(input)

    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    })
    const spy = vi.spyOn(event, 'preventDefault')
    input.dispatchEvent(event)

    expect(opts.resetView).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('does NOT call preventDefault when a modifier is held', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    })
    const spy = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)

    expect(opts.resetView).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not throw and does not call preventDefault when resetView is omitted', () => {
    const canvasContainer = document.createElement('div')
    document.body.appendChild(canvasContainer)
    const opts: Options = {
      canvasContainer,
      getState: () => 'sandbox',
      toggleEditor: vi.fn(),
      resizeScene: vi.fn(),
      refitCamera: vi.fn(),
    }
    trackDispose(wireWindowEvents(opts))

    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    })
    const spy = vi.spyOn(event, 'preventDefault')

    expect(() => window.dispatchEvent(event)).not.toThrow()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('Esc shortcut — back to main menu', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  for (const state of ESC_GAME_STATES) {
    it(`calls backToMainMenu once in ${state}`, () => {
      const opts = makeOptions(state)
      wire(opts)

      dispatchKeyOnWindow({ key: 'Escape', code: 'Escape' })

      expect(opts.backToMainMenu).toHaveBeenCalledTimes(1)
    })
  }

  it('is ignored in main_menu state (already there)', () => {
    const opts = makeOptions('main_menu')
    wire(opts)

    dispatchKeyOnWindow({ key: 'Escape', code: 'Escape' })

    expect(opts.backToMainMenu).not.toHaveBeenCalled()
  })

  for (const [tagName, label] of EDITABLE_TAGS) {
    it(`is ignored when target is a ${label}`, () => {
      const opts = makeOptions('sandbox')
      wire(opts)
      const el = document.createElement(tagName)
      document.body.appendChild(el)

      dispatchKeyOnTarget(el, { key: 'Escape', code: 'Escape' })

      expect(opts.backToMainMenu).not.toHaveBeenCalled()
    })
  }

  for (const modifier of MODIFIERS) {
    it(`is ignored when ${modifier} is held`, () => {
      const opts = makeOptions('sandbox')
      wire(opts)

      dispatchKeyOnWindow({ key: 'Escape', code: 'Escape', [modifier]: true })

      expect(opts.backToMainMenu).not.toHaveBeenCalled()
    })
  }

  for (const state of ['sandbox', 'play_phase'] as const) {
    it(`does not call backToMainMenu when isEscapeBlocked returns true (${state})`, () => {
      const opts = makeOptions(state)
      opts.isEscapeBlocked.mockReturnValue(true)
      wire(opts)

      dispatchKeyOnWindow({ key: 'Escape', code: 'Escape' })

      expect(opts.backToMainMenu).not.toHaveBeenCalled()
    })
  }

  it('invokes isEscapeBlocked exactly once per Esc press in a passing state', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    dispatchKeyOnWindow({ key: 'Escape', code: 'Escape' })

    expect(opts.isEscapeBlocked).toHaveBeenCalledTimes(1)
    expect(opts.backToMainMenu).toHaveBeenCalledTimes(1)
  })

  it('does NOT invoke isEscapeBlocked when state gating already rejects', () => {
    const opts = makeOptions('main_menu')
    wire(opts)

    dispatchKeyOnWindow({ key: 'Escape', code: 'Escape' })

    expect(opts.isEscapeBlocked).not.toHaveBeenCalled()
    expect(opts.backToMainMenu).not.toHaveBeenCalled()
  })

  it('does not throw when backToMainMenu is omitted', () => {
    const canvasContainer = document.createElement('div')
    document.body.appendChild(canvasContainer)
    const opts: Options = {
      canvasContainer,
      getState: () => 'sandbox',
      toggleEditor: vi.fn(),
      resizeScene: vi.fn(),
      refitCamera: vi.fn(),
    }
    trackDispose(wireWindowEvents(opts))

    expect(() => dispatchKeyOnWindow({ key: 'Escape', code: 'Escape' })).not.toThrow()
  })

  it('treats omitted isEscapeBlocked as returning false', () => {
    const canvasContainer = document.createElement('div')
    document.body.appendChild(canvasContainer)
    const backToMainMenu = vi.fn()
    const opts = {
      canvasContainer,
      getState: () => 'sandbox',
      toggleEditor: vi.fn(),
      resizeScene: vi.fn(),
      refitCamera: vi.fn(),
      backToMainMenu,
    }
    trackDispose(wireWindowEvents(opts as unknown as Options))

    dispatchKeyOnWindow({ key: 'Escape', code: 'Escape' })

    expect(backToMainMenu).toHaveBeenCalledTimes(1)
  })
})

describe('cross-shortcut isolation', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('F does not call toggleEditor or toggleProjects', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    dispatchKeyOnWindow({ key: 'f', code: 'KeyF' })
    dispatchKeyOnWindow({ key: 'F', code: 'KeyF' })

    expect(opts.toggleEditor).not.toHaveBeenCalled()
    expect(opts.toggleProjects).not.toHaveBeenCalled()
  })

  it('R does not call toggleEditor or toggleProjects', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    dispatchKeyOnWindow({ key: 'r', code: 'KeyR' })
    dispatchKeyOnWindow({ key: 'R', code: 'KeyR' })

    expect(opts.toggleEditor).not.toHaveBeenCalled()
    expect(opts.toggleProjects).not.toHaveBeenCalled()
  })

  it('Space does not call toggleEditor or toggleProjects', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    dispatchKeyOnWindow({ key: ' ', code: 'Space' })

    expect(opts.toggleEditor).not.toHaveBeenCalled()
    expect(opts.toggleProjects).not.toHaveBeenCalled()
  })

  it('Esc does not call toggleEditor or toggleProjects', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    dispatchKeyOnWindow({ key: 'Escape', code: 'Escape' })

    expect(opts.toggleEditor).not.toHaveBeenCalled()
    expect(opts.toggleProjects).not.toHaveBeenCalled()
  })

  it('E does not call any of the new callbacks', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    dispatchKeyOnWindow({ key: 'e', code: 'KeyE' })
    dispatchKeyOnWindow({ key: 'E', code: 'KeyE' })

    expect(opts.toggleSimulation).not.toHaveBeenCalled()
    expect(opts.restartSimulation).not.toHaveBeenCalled()
    expect(opts.resetView).not.toHaveBeenCalled()
    expect(opts.backToMainMenu).not.toHaveBeenCalled()
  })

  it('Q does not call any of the new callbacks', () => {
    const opts = makeOptions('sandbox')
    wire(opts)

    dispatchKeyOnWindow({ key: 'q', code: 'KeyQ' })
    dispatchKeyOnWindow({ key: 'Q', code: 'KeyQ' })

    expect(opts.toggleSimulation).not.toHaveBeenCalled()
    expect(opts.restartSimulation).not.toHaveBeenCalled()
    expect(opts.resetView).not.toHaveBeenCalled()
    expect(opts.backToMainMenu).not.toHaveBeenCalled()
  })
})
