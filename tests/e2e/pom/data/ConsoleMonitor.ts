import type { Page, ConsoleMessage } from '@playwright/test'
import { expect } from '@playwright/test'

export interface CapturedConsoleMessage {
  type: string
  text: string
}

/**
 * Captures console messages from the page (and same-origin child frames).
 * Used by specs that need to assert the absence of a specific warning,
 * e.g. Blockly's `Ignoring non-existent field …` emitted from inside the
 * PXT iframe.
 *
 * Listening is auto-started on construction by the test fixture so that
 * messages logged before a spec calls into the monitor are not lost.
 */
export class ConsoleMonitor {
  private readonly messages: CapturedConsoleMessage[] = []
  private readonly listener: (msg: ConsoleMessage) => void

  constructor(page: Page) {
    this.listener = (msg: ConsoleMessage): void => {
      this.messages.push({ type: msg.type(), text: msg.text() })
    }
    page.on('console', this.listener)
  }

  /** Snapshot of every message captured so far. */
  getMessages(): CapturedConsoleMessage[] {
    return [...this.messages]
  }

  /** Snapshot of messages whose text matches `pattern`. */
  getMessagesMatching(pattern: RegExp): CapturedConsoleMessage[] {
    return this.messages.filter((m) => pattern.test(m.text))
  }

  /**
   * Assert that no message captured up to NOW matches `pattern`. Failure
   * message includes the matching messages so the spec output points at
   * the exact warning(s) that fired.
   */
  async expectNoMessageMatching(pattern: RegExp, contextLabel?: string): Promise<void> {
    const matches = this.getMessagesMatching(pattern)
    expect(
      matches,
      `${contextLabel ?? 'console'} must not log any message matching ` +
        `${pattern.toString()}; got ${matches.length} match(es): ` +
        JSON.stringify(matches),
    ).toEqual([])
  }
}
