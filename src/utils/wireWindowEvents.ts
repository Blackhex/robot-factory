interface WireWindowEventsOptions {
  canvasContainer: HTMLElement
  getState: () => string
  toggleEditor: () => void
  toggleProjects?: () => void
  toggleSimulation?: () => void
  restartSimulation?: () => void
  resetView?: () => void
  backToMainMenu?: () => void
  isEscapeBlocked?: () => boolean
  resizeScene: (width: number, height: number) => void
  refitCamera: () => void
}

const GAME_STATES: ReadonlySet<string> = new Set(['build_phase', 'play_phase', 'sandbox'])
const EDITOR_STATES: ReadonlySet<string> = new Set(['build_phase', 'sandbox'])
const SANDBOX_ONLY: ReadonlySet<string> = new Set(['sandbox'])

function isEditableTarget(
  target: EventTarget | null,
  mode: 'standard' | 'extended',
): boolean {
  const tag = (target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // Extended mode also blocks BUTTON / A / SUMMARY so the browser's
  // Space-activates-focused-control accessibility behavior is preserved.
  if (mode === 'extended' && (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY')) return true
  return false
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

interface KeyBinding {
  matches: (event: KeyboardEvent) => boolean
  isStateAllowed: (state: string) => boolean
  editableGuard: 'standard' | 'extended'
  rejectModifier: boolean
  isBlocked?: () => boolean
  preventDefault: boolean
  capture: boolean
  action?: () => void
}

const matchLetter = (letter: string): ((event: KeyboardEvent) => boolean) => {
  const lower = letter.toLowerCase()
  const upper = letter.toUpperCase()
  return (event) => event.key === lower || event.key === upper
}
const matchSpace = (event: KeyboardEvent): boolean => event.key === ' ' || event.code === 'Space'
const matchEscape = (event: KeyboardEvent): boolean => event.key === 'Escape'

const stateInSet = (set: ReadonlySet<string>) => (state: string): boolean => set.has(state)
const stateNotMainMenu = (state: string): boolean => state !== 'main_menu'

export function wireWindowEvents(options: WireWindowEventsOptions): () => void {
  const bindings: KeyBinding[] = [
    {
      matches: matchLetter('e'),
      isStateAllowed: stateInSet(EDITOR_STATES),
      editableGuard: 'standard',
      rejectModifier: false,
      preventDefault: false,
      capture: false,
      action: options.toggleEditor,
    },
    {
      matches: matchLetter('q'),
      isStateAllowed: stateInSet(SANDBOX_ONLY),
      editableGuard: 'standard',
      rejectModifier: false,
      preventDefault: false,
      capture: false,
      action: options.toggleProjects,
    },
    {
      matches: matchLetter('f'),
      isStateAllowed: stateInSet(GAME_STATES),
      editableGuard: 'standard',
      rejectModifier: true,
      preventDefault: false,
      capture: false,
      action: options.toggleSimulation,
    },
    {
      matches: matchLetter('r'),
      isStateAllowed: stateInSet(GAME_STATES),
      editableGuard: 'standard',
      rejectModifier: true,
      preventDefault: false,
      capture: false,
      action: options.restartSimulation,
    },
    {
      matches: matchSpace,
      isStateAllowed: stateInSet(GAME_STATES),
      editableGuard: 'extended',
      rejectModifier: true,
      preventDefault: true,
      capture: false,
      action: options.resetView,
    },
    {
      // Esc uses capture phase so this gate runs BEFORE document-level
      // bubble handlers (e.g. ProjectsPanel.handleKeyDown) close their
      // owning UI. That preserves the "panel still open" signal that
      // `isEscapeBlocked` checks; otherwise the panel handler would have
      // already torn down the panel by the time we evaluate the gate.
      matches: matchEscape,
      isStateAllowed: stateNotMainMenu,
      editableGuard: 'standard',
      rejectModifier: true,
      isBlocked: options.isEscapeBlocked,
      preventDefault: false,
      capture: true,
      action: options.backToMainMenu,
    },
  ]

  const dispatch = (event: KeyboardEvent, capturePhase: boolean): void => {
    for (const binding of bindings) {
      if (binding.capture !== capturePhase) continue
      if (!binding.action) continue
      if (!binding.matches(event)) continue
      if (isEditableTarget(event.target, binding.editableGuard)) continue
      if (binding.rejectModifier && hasModifier(event)) continue
      if (!binding.isStateAllowed(options.getState())) continue
      if (binding.isBlocked?.() === true) continue
      if (binding.preventDefault) event.preventDefault()
      binding.action()
      return
    }
  }

  const bubbleListener = (event: KeyboardEvent): void => dispatch(event, false)
  const captureListener = (event: KeyboardEvent): void => dispatch(event, true)
  const resizeListener = (): void => {
    const { clientWidth, clientHeight } = options.canvasContainer
    options.resizeScene(clientWidth, clientHeight)
    options.refitCamera()
  }

  window.addEventListener('keydown', bubbleListener, false)
  window.addEventListener('keydown', captureListener, true)
  window.addEventListener('resize', resizeListener)

  return (): void => {
    window.removeEventListener('keydown', bubbleListener, false)
    window.removeEventListener('keydown', captureListener, true)
    window.removeEventListener('resize', resizeListener)
  }
}