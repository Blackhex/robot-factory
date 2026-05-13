import type { Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Focus the given input, capture whether it is the document's active
 * element, press the Enter key, then re-capture focus and read the
 * input's `.value`. Returns a snapshot the caller can assert against.
 *
 * Used by inline-rename Page Objects (machine name, belt name, project
 * slot name) to verify that pressing Enter triggers a blur — the
 * "I'm done editing" gesture — without mutating the typed value. The
 * helper does NOT assert focus state itself; the caller decides the
 * contract, so it is reusable for both the RED-step contract
 * (`isStillFocused === false`) and any future inversions.
 */
export async function pressEnterAndSnapshot(
  input: Locator,
): Promise<{ wasFocused: boolean; isStillFocused: boolean; valueAfter: string }> {
  await expect(input).toBeVisible()
  await input.focus()
  const wasFocused = await input.evaluate((el) => el === document.activeElement)
  await input.press('Enter')
  const isStillFocused = await input.evaluate(
    (el) => el === document.activeElement,
  )
  const valueAfter = await input.inputValue()
  return { wasFocused, isStillFocused, valueAfter }
}
