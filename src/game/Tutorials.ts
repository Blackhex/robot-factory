/**
 * Per-level tutorial step data. Pure data — no rendering or DOM.
 */

export interface TutorialStep {
  readonly messageKey: string
  readonly highlightSelector?: string
  readonly position: 'top' | 'bottom' | 'left' | 'right'
}

const TUTORIAL_TARGETS = {
  canvas: '#canvas-container',
  editorBtn: '.ui-toolbar-btn--editor',
  startBtn: '.ui-toolbar-btn--start',
} as const

export function getTutorialSteps(levelIndex: number): TutorialStep[] {
  switch (levelIndex) {
    case 1:
      return [
        { messageKey: 'tutorial.level1_step1', highlightSelector: TUTORIAL_TARGETS.canvas, position: 'top' },
        { messageKey: 'tutorial.level1_step2', highlightSelector: TUTORIAL_TARGETS.canvas, position: 'top' },
        { messageKey: 'tutorial.level1_step3', highlightSelector: TUTORIAL_TARGETS.canvas, position: 'bottom' },
        { messageKey: 'tutorial.level1_step4', highlightSelector: TUTORIAL_TARGETS.editorBtn, position: 'bottom' },
        { messageKey: 'tutorial.level1_step5', highlightSelector: TUTORIAL_TARGETS.editorBtn, position: 'bottom' },
        { messageKey: 'tutorial.level1_step6', highlightSelector: TUTORIAL_TARGETS.startBtn, position: 'bottom' },
      ]
    case 2:
      return [
        { messageKey: 'tutorial.level2_step1', highlightSelector: TUTORIAL_TARGETS.canvas, position: 'top' },
        { messageKey: 'tutorial.level2_step2', highlightSelector: TUTORIAL_TARGETS.canvas, position: 'bottom' },
        { messageKey: 'tutorial.level2_step3', highlightSelector: TUTORIAL_TARGETS.editorBtn, position: 'bottom' },
      ]
    case 3:
      return [
        { messageKey: 'tutorial.level3_step1', highlightSelector: TUTORIAL_TARGETS.editorBtn, position: 'bottom' },
        { messageKey: 'tutorial.level3_step2', position: 'bottom' },
      ]
    case 4:
      return [
        { messageKey: 'tutorial.level4_step1', highlightSelector: TUTORIAL_TARGETS.canvas, position: 'top' },
        { messageKey: 'tutorial.level4_step2', highlightSelector: TUTORIAL_TARGETS.canvas, position: 'bottom' },
        { messageKey: 'tutorial.level4_step3', highlightSelector: TUTORIAL_TARGETS.editorBtn, position: 'bottom' },
        { messageKey: 'tutorial.level4_step4', highlightSelector: TUTORIAL_TARGETS.editorBtn, position: 'bottom' },
      ]
    default:
      return []
  }
}
