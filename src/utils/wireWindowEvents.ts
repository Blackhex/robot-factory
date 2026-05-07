interface WireWindowEventsOptions {
  canvasContainer: HTMLElement
  getState: () => string
  toggleEditor: () => void
  resizeScene: (width: number, height: number) => void
  refitCamera: () => void
}

export function wireWindowEvents(options: WireWindowEventsOptions): void {
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'e' && event.key !== 'E') return

    const target = event.target as HTMLElement | null
    const tag = target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const state = options.getState()
    if (state === 'build_phase' || state === 'sandbox') {
      options.toggleEditor()
    }
  })

  window.addEventListener('resize', () => {
    const { clientWidth, clientHeight } = options.canvasContainer
    options.resizeScene(clientWidth, clientHeight)
    options.refitCamera()
  })
}