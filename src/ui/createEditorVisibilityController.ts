import { setCanvasInset, clearCanvasInset } from '../utils/setCanvasInset'

interface PxtEditorLike {
  show(): void
  hide(): void
}

interface CreateEditorVisibilityControllerOptions {
  editorContainer: HTMLElement
  resizeHandle: HTMLElement
  pxtEditor: PxtEditorLike
  refitCamera: () => void
  onOpenChange?: (open: boolean) => void
}

export interface EditorVisibilityController {
  open(): void
  close(): void
  toggle(): void
}

export function createEditorVisibilityController(
  options: CreateEditorVisibilityControllerOptions,
): EditorVisibilityController {
  let editorVisible = false

  const open = (): void => {
    editorVisible = true
    options.editorContainer.classList.add('open')
    document.body.classList.add('editor-open')
    options.resizeHandle.style.display = 'block'
    options.resizeHandle.style.right = options.editorContainer.style.width
      ? `calc(${options.editorContainer.style.width} - 3px)`
      : 'calc(max(500px, 40%) - 3px)'
    options.pxtEditor.show()
    // Write before refit so the refit observes the post-reflow layout.
    setCanvasInset('right', options.editorContainer.clientWidth)
    options.refitCamera()
    options.onOpenChange?.(true)
  }

  const close = (): void => {
    editorVisible = false
    options.editorContainer.classList.remove('open')
    document.body.classList.remove('editor-open')
    options.resizeHandle.style.display = 'none'
    options.pxtEditor.hide()
    clearCanvasInset('right')
    options.refitCamera()
    options.onOpenChange?.(false)
  }

  const toggle = (): void => {
    if (editorVisible) close()
    else open()
  }

  return { open, close, toggle }
}