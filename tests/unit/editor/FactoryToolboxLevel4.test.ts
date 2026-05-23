/**
 * RED-step tests for Task D: Level 4 toolbox unlocks the new
 * programmable Splitter event handler + helper blocks.
 *
 * Task C added these block types:
 *   - factory_on_item_arrives        (event hat)
 *   - factory_current_item_defective (boolean reporter)
 *   - factory_current_item_is        (boolean reporter)
 *
 * Task D must surface them in the toolbox at level 4 (no earlier).
 * Higher levels must also keep them — toolbox unlocks are cumulative.
 */
import { describe, it, expect } from 'vitest'
import { getToolboxForLevel } from '../../../src/editor/FactoryToolbox'

const SPLITTER_BLOCKS = [
  'factory_on_item_arrives',
  'factory_current_item_defective',
  'factory_current_item_is',
] as const

function allBlockTypes(toolbox: ReturnType<typeof getToolboxForLevel>): string[] {
  const out: string[] = []
  for (const cat of toolbox.contents) for (const b of cat.contents) out.push(b.type)
  return out
}

function categoryContaining(
  toolbox: ReturnType<typeof getToolboxForLevel>,
  blockType: string,
): { kind: 'category'; name: string; colour: string; contents: { kind: 'block'; type: string }[] } | undefined {
  return toolbox.contents.find((cat) => cat.contents.some((b) => b.type === blockType))
}

describe('FactoryToolbox — Level 4 splitter unlocks (Task D)', () => {
  it('T6: at level 4, some category contains factory_on_item_arrives', () => {
    const toolbox = getToolboxForLevel(4)
    const cat = categoryContaining(toolbox, 'factory_on_item_arrives')
    expect(cat, 'expected a category whose contents include factory_on_item_arrives').toBeDefined()
  })

  it('T7: at level 4, toolbox contains factory_current_item_defective', () => {
    expect(allBlockTypes(getToolboxForLevel(4))).toContain('factory_current_item_defective')
  })

  it('T8: at level 4, toolbox contains factory_current_item_is', () => {
    expect(allBlockTypes(getToolboxForLevel(4))).toContain('factory_current_item_is')
  })

  it('T9: at level 3, NONE of the splitter block types appear in the toolbox', () => {
    const types = allBlockTypes(getToolboxForLevel(3))
    for (const t of SPLITTER_BLOCKS) {
      expect(types, `level 3 must NOT contain ${t}`).not.toContain(t)
    }
  })

  it('T10: at level 7, factory_on_machine_idle is still present (cumulative regression)', () => {
    expect(allBlockTypes(getToolboxForLevel(7))).toContain('factory_on_machine_idle')
  })

  it('T11: at level 7, all splitter blocks are still present (cumulative)', () => {
    const types = allBlockTypes(getToolboxForLevel(7))
    for (const t of SPLITTER_BLOCKS) {
      expect(types, `level 7 must still contain ${t}`).toContain(t)
    }
  })
})
