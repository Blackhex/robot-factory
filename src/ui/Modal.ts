import { i18next } from '../i18n/i18n'

/**
 * Reusable in-game modal dialog. Replaces native `window.prompt` /
 * `window.confirm`, both for visual consistency with the dark game theme
 * and to avoid embedded-context environments (some iframes / WebViews)
 * where native dialogs throw silently.
 *
 * The modal is a single shared root appended to `document.body` on first
 * use. Each call resolves a promise based on user action (Confirm /
 * Cancel / Escape / backdrop click).
 */

interface PromptOptions {
  title: string
  defaultValue?: string
}

interface ConfirmOptions {
  title: string
  message?: string
}

interface ActiveModal {
  cleanup: () => void
}

let activeModal: ActiveModal | null = null

function ensureRoot(): HTMLDivElement {
  let root = document.getElementById('rf-modal-root') as HTMLDivElement | null
  if (!root) {
    root = document.createElement('div')
    root.id = 'rf-modal-root'
    document.body.appendChild(root)
  }
  return root
}

function closeActive(): void {
  if (activeModal) {
    activeModal.cleanup()
    activeModal = null
  }
}

function buildShell(): {
  backdrop: HTMLDivElement
  card: HTMLDivElement
  titleEl: HTMLHeadingElement
  body: HTMLDivElement
  actions: HTMLDivElement
} {
  const backdrop = document.createElement('div')
  backdrop.className = 'ui-modal-backdrop'

  const card = document.createElement('div')
  card.className = 'ui-modal'
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')

  const titleEl = document.createElement('h2')
  titleEl.className = 'ui-modal-title'
  card.appendChild(titleEl)

  const body = document.createElement('div')
  body.className = 'ui-modal-body'
  card.appendChild(body)

  const actions = document.createElement('div')
  actions.className = 'ui-modal-actions'
  card.appendChild(actions)

  backdrop.appendChild(card)

  return { backdrop, card, titleEl, body, actions }
}

function trapFocus(card: HTMLElement, ev: KeyboardEvent): void {
  if (ev.key !== 'Tab') return
  const focusable = card.querySelectorAll<HTMLElement>(
    'input, button, [tabindex]:not([tabindex="-1"])',
  )
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (ev.shiftKey) {
    if (active === first || !card.contains(active)) {
      ev.preventDefault()
      last.focus()
    }
  } else {
    if (active === last) {
      ev.preventDefault()
      first.focus()
    }
  }
}

export function promptModal(opts: PromptOptions): Promise<string | null> {
  closeActive()
  return new Promise((resolve) => {
    const { backdrop, card, titleEl, body, actions } = buildShell()
    titleEl.textContent = opts.title

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'ui-modal-input'
    input.value = opts.defaultValue ?? ''
    body.appendChild(input)

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'ui-modal-btn ui-modal-cancel'
    cancelBtn.textContent = i18next.t('modal.cancel')

    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.className = 'ui-modal-btn ui-modal-confirm'
    confirmBtn.textContent = i18next.t('modal.ok')

    actions.appendChild(cancelBtn)
    actions.appendChild(confirmBtn)

    const root = ensureRoot()
    root.appendChild(backdrop)

    const finish = (value: string | null): void => {
      cleanup()
      resolve(value)
    }

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        finish(null)
      } else if (ev.key === 'Enter') {
        ev.preventDefault()
        const v = input.value.trim()
        finish(v.length === 0 ? null : v)
      } else {
        trapFocus(card, ev)
      }
    }

    const onBackdropClick = (ev: MouseEvent): void => {
      if (ev.target === backdrop) finish(null)
    }

    confirmBtn.addEventListener('click', () => {
      const v = input.value.trim()
      finish(v.length === 0 ? null : v)
    })
    cancelBtn.addEventListener('click', () => finish(null))
    backdrop.addEventListener('click', onBackdropClick)
    document.addEventListener('keydown', onKeyDown, true)

    function cleanup(): void {
      document.removeEventListener('keydown', onKeyDown, true)
      backdrop.remove()
      activeModal = null
    }
    activeModal = { cleanup }

    // Focus the input after layout.
    requestAnimationFrame(() => {
      input.focus()
      input.select()
    })
  })
}

export function confirmModal(opts: ConfirmOptions): Promise<boolean> {
  closeActive()
  return new Promise((resolve) => {
    const { backdrop, card, titleEl, body, actions } = buildShell()
    titleEl.textContent = opts.title

    if (opts.message) {
      const msg = document.createElement('p')
      msg.className = 'ui-modal-message'
      msg.textContent = opts.message
      body.appendChild(msg)
    }

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'ui-modal-btn ui-modal-cancel'
    cancelBtn.textContent = i18next.t('modal.cancel')

    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.className = 'ui-modal-btn ui-modal-confirm ui-modal-confirm--danger'
    confirmBtn.textContent = i18next.t('modal.confirm')

    actions.appendChild(cancelBtn)
    actions.appendChild(confirmBtn)

    const root = ensureRoot()
    root.appendChild(backdrop)

    const finish = (value: boolean): void => {
      cleanup()
      resolve(value)
    }

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        finish(false)
      } else if (ev.key === 'Enter') {
        ev.preventDefault()
        finish(true)
      } else {
        trapFocus(card, ev)
      }
    }

    const onBackdropClick = (ev: MouseEvent): void => {
      if (ev.target === backdrop) finish(false)
    }

    confirmBtn.addEventListener('click', () => finish(true))
    cancelBtn.addEventListener('click', () => finish(false))
    backdrop.addEventListener('click', onBackdropClick)
    document.addEventListener('keydown', onKeyDown, true)

    function cleanup(): void {
      document.removeEventListener('keydown', onKeyDown, true)
      backdrop.remove()
      activeModal = null
    }
    activeModal = { cleanup }

    requestAnimationFrame(() => confirmBtn.focus())
  })
}
