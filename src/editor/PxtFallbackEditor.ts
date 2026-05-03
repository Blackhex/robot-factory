import i18next from 'i18next'

/**
 * Fallback `<textarea>` editor shown when the PXT iframe doesn't load
 * (e.g., the target hasn't been built). Allows the user to type
 * TypeScript factory commands directly. Owned by PxtEditor.
 */
export class PxtFallbackEditor {
  private root: HTMLDivElement
  private label: HTMLDivElement
  private textarea: HTMLTextAreaElement
  private handleLangChange: () => void

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'pxt-editor-fallback'
    this.root.style.width = '100%'
    this.root.style.height = '100%'
    this.root.style.display = 'flex'
    this.root.style.flexDirection = 'column'

    this.label = document.createElement('div')
    this.label.className = 'pxt-editor-fallback-label'
    this.label.textContent = i18next.t('pxt.fallback.label')
    this.label.style.padding = '8px'
    this.label.style.fontWeight = 'bold'
    this.label.style.borderBottom = '1px solid #444'
    this.root.appendChild(this.label)

    this.textarea = document.createElement('textarea')
    this.textarea.className = 'pxt-editor-fallback-textarea'
    this.textarea.spellcheck = false
    this.textarea.placeholder = i18next.t('pxt.fallback.placeholder')
    Object.assign(this.textarea.style, {
      flex: '1',
      resize: 'none',
      fontFamily: 'monospace',
      fontSize: '14px',
      padding: '8px',
      border: 'none',
      outline: 'none',
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4',
    })
    this.root.appendChild(this.textarea)
    parent.appendChild(this.root)

    this.handleLangChange = () => {
      this.label.textContent = i18next.t('pxt.fallback.label')
      this.textarea.placeholder = i18next.t('pxt.fallback.placeholder')
    }
    i18next.on('languageChanged', this.handleLangChange)
  }

  getValue(): string { return this.textarea.value }
  setValue(value: string): void { this.textarea.value = value }
  show(): void { this.root.style.display = 'flex' }
  hide(): void { this.root.style.display = 'none' }
  dispose(): void {
    i18next.off('languageChanged', this.handleLangChange)
    this.root.remove()
  }
}
