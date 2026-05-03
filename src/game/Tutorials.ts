/**
 * Per-level tutorial step data. Pure data — no rendering or DOM.
 */

export interface TutorialStep {
  readonly messageKey: string
  readonly highlightSelector?: string
  readonly position: 'top' | 'bottom' | 'left' | 'right'
}

export function getTutorialSteps(levelIndex: number): TutorialStep[] {
  switch (levelIndex) {
    case 1:
      return [
        { messageKey: 'tutorial.level1_step1', highlightSelector: '#canvas-container', position: 'top' },
        { messageKey: 'tutorial.level1_step2', highlightSelector: '#canvas-container', position: 'top' },
        { messageKey: 'tutorial.level1_step3', highlightSelector: '#canvas-container', position: 'bottom' },
        { messageKey: 'tutorial.level1_step4', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
        { messageKey: 'tutorial.level1_step5', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
        { messageKey: 'tutorial.level1_step6', highlightSelector: '.ui-toolbar-btn--start', position: 'bottom' },
      ]
    case 2:
      return [
        { messageKey: 'tutorial.level2_step1', highlightSelector: '#canvas-container', position: 'top' },
        { messageKey: 'tutorial.level2_step2', highlightSelector: '#canvas-container', position: 'bottom' },
        { messageKey: 'tutorial.level2_step3', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
      ]
    case 3:
      return [
        { messageKey: 'tutorial.level3_step1', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
        { messageKey: 'tutorial.level3_step2', position: 'bottom' },
      ]
    case 4:
      return [
        { messageKey: 'tutorial.level4_step1', highlightSelector: '.ui-toolbar', position: 'bottom' },
        { messageKey: 'tutorial.level4_step2', highlightSelector: '.ui-toolbar-btn--editor', position: 'bottom' },
      ]
    default:
      return []
  }
}
