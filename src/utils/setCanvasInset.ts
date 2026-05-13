export type CanvasInsetSide = 'left' | 'right'

export function setCanvasInset(side: CanvasInsetSide, widthPx: number): void {
  document.body.style.setProperty(`--rf-canvas-${side}`, `${widthPx}px`)
}

export function clearCanvasInset(side: CanvasInsetSide): void {
  setCanvasInset(side, 0)
}
