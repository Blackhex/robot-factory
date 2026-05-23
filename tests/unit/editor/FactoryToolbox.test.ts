import { describe, it, expect, beforeAll } from 'vitest'
import { getToolboxForLevel } from '../../../src/editor/FactoryToolbox'
import { initI18n, i18next } from '../../../src/i18n/i18n'

beforeAll(async () => {
  // Category names are produced by `i18next.t(...)`; without init the
  // helper returns the same default for every key, breaking name-based
  // category lookups in the structural guard tests below.
  await initI18n()
})

// Helper: extract all block types from a toolbox definition
function getBlockTypes(toolbox: ReturnType<typeof getToolboxForLevel>): string[] {
  const types: string[] = []
  for (const category of toolbox.contents) {
    for (const block of category.contents) {
      types.push(block.type)
    }
  }
  return types
}

describe('FactoryToolbox', () => {
  it('should return a categoryToolbox', () => {
    // WHEN
    const toolbox = getToolboxForLevel(1)

    // THEN
    expect(toolbox.kind).toBe('categoryToolbox')
  })

  describe('level 1: basic actions only', () => {
    it('should include only one category', () => {
      // WHEN
      const toolbox = getToolboxForLevel(1)

      // THEN
      expect(toolbox.contents).toHaveLength(1)
    })

    it('should include set_recipe, start_machine, pick_machine blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(1))

      // THEN
      expect(types).toContain('factory_set_recipe')
      expect(types).toContain('factory_start_machine')
      expect(types).toContain('factory_pick_machine')
    })

    it('should NOT include loops, conditionals, custom variables, custom functions, or events', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(1))

      // THEN
      expect(types).not.toContain('factory_repeat_times')
      expect(types).not.toContain('factory_if_quality')
      expect(types).not.toContain('factory_set_variable')
      expect(types).not.toContain('factory_define_procedure')
      expect(types).not.toContain('factory_on_order_received')
    })

    it('should NOT include factory_set_machine_speed (level-2+ action)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(1))

      // THEN — set_machine_speed is paired with set_belt_speed and unlocks at level 2
      expect(types).not.toContain('factory_set_machine_speed')
    })

    it('should NOT include factory_pick_belt (level-2+ reporter, paired with set_belt_speed)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(1))

      // THEN — pickBelt is the value-returning reporter that shadows into
      // set_belt_speed; it unlocks together with set_belt_speed at level 2.
      expect(types).not.toContain('factory_pick_belt')
    })
  })

  describe('level 2: extended actions', () => {
    it('should include stop_machine and set_belt_speed (route_to has been removed)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(2))

      // THEN
      expect(types).toContain('factory_stop_machine')
      expect(types).toContain('factory_set_belt_speed')
      // The routeTo block was removed from the codebase.
      expect(types).not.toContain('factory_route_to')
    })

    it('should include factory_set_machine_speed (paired with set_belt_speed)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(2))

      // THEN
      expect(types).toContain('factory_set_machine_speed')
    })

    it('should include factory_pick_belt (value-returning reporter for belts)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(2))

      // THEN — pickBelt mirrors pickMachine: it is the reporter that
      // shadows into the belt slot of set_belt_speed.
      expect(types).toContain('factory_pick_belt')
    })
  })

  describe('level 3: loops unlocked', () => {
    it('should include loop blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(3))

      // THEN
      expect(types).toContain('factory_repeat_times')
      expect(types).toContain('factory_while_condition')
    })

    it('should have 2 categories (actions + loops)', () => {
      // WHEN
      const toolbox = getToolboxForLevel(3)

      // THEN
      expect(toolbox.contents).toHaveLength(2)
    })

    it('should NOT include conditionals yet', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(3))

      // THEN
      expect(types).not.toContain('factory_if_quality')
    })
  })

  describe('level 4: conditionals unlocked', () => {
    it('should include conditional blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(4))

      // THEN — factory_if_item_type was removed; the standard `if/else`
      // block combined with `current item is <part>` covers the same
      // expressive power without the misleading no-op stub.
      expect(types).not.toContain('factory_if_item_type')
      expect(types).toContain('factory_if_else')
    })

    it('should have 4 categories (actions + loops + conditionals + events)', () => {
      // WHEN
      const toolbox = getToolboxForLevel(4)

      // THEN — Conditionals unlocks at level 4 (now hosting the
      // current-item predicates moved out of the deleted Splitters
      // category). Events also unlocks at level 4 via
      // factory_on_item_arrives.
      expect(toolbox.contents).toHaveLength(4)
    })

    // ------------------------------------------------------------------
    // RED — Per-item synchronous routing block (`route current item to
    // <side> of <machine>`) lives alongside the sticky `route items to`
    // block in the Actions category at L4+ (when the splitter is
    // unlocked). The toolbox has no per-machine-type grouping, so this
    // is the closest mapping of the spec's "Splitter group" — both
    // routing blocks are gated by the same level threshold and only
    // meaningful when wired to a Splitter machine slot.
    // ------------------------------------------------------------------
    it('should include factory_route_current_item_to alongside factory_route_items_to at level 4', () => {
      const types = getBlockTypes(getToolboxForLevel(4))
      expect(types).toContain('factory_route_items_to')
      expect(types).toContain('factory_route_current_item_to')
    })

    it('should NOT include factory_route_current_item_to before level 4', () => {
      for (const level of [1, 2, 3]) {
        const types = getBlockTypes(getToolboxForLevel(level))
        expect(types, `level ${level} must not expose the per-item routing block`).not.toContain(
          'factory_route_current_item_to',
        )
      }
    })
  })

  describe('level 5: variables provided by built-in Blockly category', () => {
    it('should NOT add custom variable blocks (built-in Variables category is used)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(5))

      // THEN
      expect(types).not.toContain('factory_set_variable')
      expect(types).not.toContain('factory_get_variable')
      expect(types).not.toContain('factory_change_variable')
    })

    it('should still have 4 factory categories at level 5 (actions + loops + conditionals + events)', () => {
      // WHEN
      const toolbox = getToolboxForLevel(5)

      // THEN
      expect(toolbox.contents).toHaveLength(4)
    })
  })

  describe('level 6: functions provided by built-in Blockly category', () => {
    it('should NOT add custom procedure blocks (built-in Functions category is used)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(6))

      // THEN
      expect(types).not.toContain('factory_define_procedure')
      expect(types).not.toContain('factory_call_procedure')
    })

    it('should still have 4 factory categories at level 6 (actions + loops + conditionals + events)', () => {
      // WHEN
      const toolbox = getToolboxForLevel(6)

      // THEN
      expect(toolbox.contents).toHaveLength(4)
    })
  })

  describe('level 7: events unlocked', () => {
    it('should include event blocks', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(7))

      // THEN
      expect(types).toContain('factory_on_order_received')
      expect(types).toContain('factory_on_belt_jam')
      expect(types).toContain('factory_on_machine_idle')
    })

    it('should have 4 categories', () => {
      // WHEN
      const toolbox = getToolboxForLevel(7)

      // THEN
      expect(toolbox.contents).toHaveLength(4)
    })
  })

  describe('level 8+: all blocks available', () => {
    it('should include all factory block types (variables and functions come from built-in categories)', () => {
      // WHEN
      const types = getBlockTypes(getToolboxForLevel(8))

      // THEN
      expect(types).toContain('factory_start_machine')
      expect(types).toContain('factory_set_recipe')
      expect(types).toContain('factory_pick_machine')
      expect(types).toContain('factory_repeat_times')
      expect(types).toContain('factory_if_else')
      expect(types).not.toContain('factory_set_variable')
      expect(types).not.toContain('factory_define_procedure')
      expect(types).toContain('factory_on_order_received')
    })

    it('should have 4 categories at level 8', () => {
      // WHEN
      const toolbox = getToolboxForLevel(8)

      // THEN
      expect(toolbox.contents).toHaveLength(4)
    })

    it('should have same blocks at level 10 as level 8', () => {
      // WHEN
      const types8 = getBlockTypes(getToolboxForLevel(8))
      const types10 = getBlockTypes(getToolboxForLevel(10))

      // THEN
      expect(types10).toEqual(types8)
    })
  })

  describe('category colors match game UI palette', () => {
    // Use level 7+ so all factory categories are visible.
    // Categories are in fixed order: Actions(0), Loops(1), Conditionals(2),
    // Events(3). (Variables and Functions come from the built-in
    // Blockly categories which are added separately by PXT.)
    // The toolbox is captured per-test so it is built AFTER `beforeAll` has
    // initialized i18next; otherwise category names degrade to a single
    // default and name-based lookups below collapse to the first match.

    it('should have all 4 factory categories at level 7', () => {
      const toolbox = getToolboxForLevel(7)
      expect(toolbox.contents).toHaveLength(4)
    })

    it('Actions category (index 0) should use machine blue (#4488ff → hue 217)', () => {
      const toolbox = getToolboxForLevel(7)
      expect(toolbox.contents[0].colour).toBe('217')
    })

    it('Loops category (index 1) should use success green (hue 120)', () => {
      const toolbox = getToolboxForLevel(7)
      expect(toolbox.contents[1].colour).toBe('120')
    })

    it('Conditionals category (index 2) should use PXT Logic yellow (#cccc44) matching built-in conditional blocks', () => {
      // PXT's built-in Logic blocks render at the exact hex `#cccc44` in
      // our skin (via `Blockly.Msg.LOGIC_HUE`). The Conditionals category
      // must use the same hex so our current_item_is /
      // current_item_is_defective predicates do not clash visually with
      // the built-in if/else, comparison, and boolean blocks shown
      // alongside them. UX review proved that numeric-hue specs (e.g.
      // hue 210 / blue) do NOT match how built-in Logic blocks render.
      // See .github/skills/pxt-blocks/SKILL.md.
      const toolbox = getToolboxForLevel(7)
      expect(toolbox.contents[2].colour).toBe('#cccc44')
    })

    it('Events category should use PXT standard yellow (hue 50)', () => {
      // Per .github/skills/pxt-blocks/SKILL.md, the Events category convention is hue 50.
      // Locate by name to stay index-agnostic.
      const toolbox = getToolboxForLevel(7)
      const events = toolbox.contents.find((c) => c.name === i18next.t('blocks.category_events'))
      expect(events, 'expected an Events category at level 7').toBeDefined()
      expect(events!.colour).toBe('50')
    })
  })

  describe('category ordering at level 7', () => {
    it('should list categories in the canonical order: Actions → Loops → Conditionals → Events', () => {
      // WHEN
      const names = getToolboxForLevel(7).contents.map((c) => c.name)

      // THEN — order is part of the contract; new categories must be inserted
      // explicitly in FactoryToolbox.ts and reflected here.
      expect(names).toEqual([
        i18next.t('blocks.category_actions'),
        i18next.t('blocks.category_loops'),
        i18next.t('blocks.category_conditionals'),
        i18next.t('blocks.category_events'),
      ])
    })
  })

  // ─────────────────────────────────────────────────────────────────
  //  E4b/E4c — `factory_route_items_to` is the new persistent
  //  multiplex-routing block. It unlocks at level 4 (alongside the
  //  Splitter intro) and lives in the Actions category — NOT in
  //  Splitters, because the player should think of it as a generic
  //  machine action ("tell this splitter where to send items").
  // ─────────────────────────────────────────────────────────────────
  describe('factory_route_items_to (multiplex routing block, level 4+)', () => {
    it('appears at level 4', () => {
      const types = getBlockTypes(getToolboxForLevel(4))
      expect(types).toContain('factory_route_items_to')
    })

    for (const level of [5, 6, 7, 8] as const) {
      it(`stays present at level ${level} (cumulative unlock)`, () => {
        const types = getBlockTypes(getToolboxForLevel(level))
        expect(types).toContain('factory_route_items_to')
      })
    }

    for (const level of [1, 2, 3] as const) {
      it(`is ABSENT at level ${level} (gated on level >= 4)`, () => {
        const types = getBlockTypes(getToolboxForLevel(level))
        expect(types).not.toContain('factory_route_items_to')
      })
    }

    it('is placed inside the Actions category (not Splitters)', () => {
      const toolbox = getToolboxForLevel(4)
      const actions = toolbox.contents.find(
        (c) => c.name === i18next.t('blocks.category_actions'),
      )
      expect(actions, 'expected an Actions category at level 4').toBeDefined()
      const actionTypes = actions!.contents.map((b) => b.type)
      expect(actionTypes).toContain('factory_route_items_to')

      // And: it must NOT also be duplicated under Splitters.
      const splitters = toolbox.contents.find(
        (c) => c.name === i18next.t('blocks.category_splitters'),
      )
      const splitterTypes = splitters?.contents.map((b) => b.type) ?? []
      expect(splitterTypes).not.toContain('factory_route_items_to')
    })
  })

  // ─────────────────────────────────────────────────────────────────
  //  E4g — RED-step guards for the Splitters category cleanup.
  //  After E4g, the entire Splitters category is removed from the
  //  toolbox. Its predicates (factory_current_item_defective /
  //  factory_current_item_is) move into the Conditionals category;
  //  factory_route_current_item is deleted entirely (replaced by
  //  factory_route_items_to in the Actions category — see Cycle A).
  // ─────────────────────────────────────────────────────────────────
  describe('Splitters category cleanup (E4g)', () => {
    const ALL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const
    const POST_CONDITIONALS_LEVELS = [4, 5, 6, 7, 8] as const

    for (const level of ALL_LEVELS) {
      it(`K: Splitters category is GONE at level ${level}`, () => {
        const toolbox = getToolboxForLevel(level)
        const splitters = toolbox.contents.find(
          (c) => c.name === i18next.t('blocks.category_splitters'),
        )
        expect(
          splitters,
          `Toolbox at level ${level} must NOT contain a Splitters category. ` +
            `The category is removed entirely in E4g.`,
        ).toBeUndefined()
      })
    }

    for (const level of ALL_LEVELS) {
      it(`L: factory_route_current_item is NOT in any toolbox category at level ${level}`, () => {
        const types = getBlockTypes(getToolboxForLevel(level))
        expect(
          types,
          `factory_route_current_item is replaced by factory_route_items_to ` +
            `(E4b/E4c). It must not appear in any toolbox category at any level.`,
        ).not.toContain('factory_route_current_item')
      })
    }

    for (const level of POST_CONDITIONALS_LEVELS) {
      it(`M: factory_current_item_defective is in Conditionals at level ${level}`, () => {
        const toolbox = getToolboxForLevel(level)
        const conditionals = toolbox.contents.find(
          (c) => c.name === i18next.t('blocks.category_conditionals'),
        )
        expect(
          conditionals,
          `Conditionals category must exist at level ${level}.`,
        ).toBeDefined()
        const condTypes = conditionals!.contents.map((b) => b.type)
        expect(
          condTypes,
          `factory_current_item_defective moves from the (deleted) Splitters ` +
            `category into Conditionals as part of E4e/E4g.`,
        ).toContain('factory_current_item_defective')
      })
    }

    for (const level of POST_CONDITIONALS_LEVELS) {
      it(`N: factory_current_item_is is in Conditionals at level ${level}`, () => {
        const toolbox = getToolboxForLevel(level)
        const conditionals = toolbox.contents.find(
          (c) => c.name === i18next.t('blocks.category_conditionals'),
        )
        expect(conditionals).toBeDefined()
        const condTypes = conditionals!.contents.map((b) => b.type)
        expect(
          condTypes,
          `factory_current_item_is moves from the (deleted) Splitters category ` +
            `into Conditionals as part of E4e/E4g.`,
        ).toContain('factory_current_item_is')
      })
    }

    for (const level of POST_CONDITIONALS_LEVELS) {
      it(`O: Conditionals category retains factory_if_else (and does NOT contain factory_if_item_type) at level ${level}`, () => {
        // Regression guard: moving the splitter predicates into
        // Conditionals must not displace factory_if_else, and the
        // removed factory_if_item_type stub must not reappear.
        const toolbox = getToolboxForLevel(level)
        const conditionals = toolbox.contents.find(
          (c) => c.name === i18next.t('blocks.category_conditionals'),
        )
        expect(conditionals).toBeDefined()
        const condTypes = conditionals!.contents.map((b) => b.type)
        expect(condTypes).not.toContain('factory_if_item_type')
        expect(condTypes).toContain('factory_if_else')
      })
    }
  })

  // ─────────────────────────────────────────────────────────────────
  //  factory_if_item_type removal (RED guards).
  //  The `factory_if_item_type` / `logic.ifItemType` block was a
  //  no-op stub that ignored its itemType argument and always ran
  //  its body. It is removed entirely; players use the standard
  //  `if/else` block combined with the existing
  //  `factory_current_item_is` predicate instead.
  // ─────────────────────────────────────────────────────────────────
  describe('factory_if_item_type removal', () => {
    const ALL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const
    const POST_CONDITIONALS_LEVELS = [4, 5, 6, 7, 8] as const

    for (const level of ALL_LEVELS) {
      it(`is absent from the toolbox at level ${level}`, () => {
        const types = getBlockTypes(getToolboxForLevel(level))
        expect(
          types,
          `factory_if_item_type was a no-op stub and is removed; ` +
            `it must not appear in any toolbox category at any level.`,
        ).not.toContain('factory_if_item_type')
      })
    }

    for (const level of POST_CONDITIONALS_LEVELS) {
      it(`Conditionals category at level ${level} still exists with the surviving blocks (no factory_if_item_type)`, () => {
        const toolbox = getToolboxForLevel(level)
        const conditionals = toolbox.contents.find(
          (c) => c.name === i18next.t('blocks.category_conditionals'),
        )
        expect(
          conditionals,
          `Conditionals category must continue to exist at level ${level} ` +
            `even after factory_if_item_type is removed.`,
        ).toBeDefined()
        const condTypes = conditionals!.contents.map((b) => b.type)
        expect(condTypes).not.toContain('factory_if_item_type')
        expect(condTypes).toContain('factory_if_else')
        expect(condTypes).toContain('factory_current_item_defective')
        expect(condTypes).toContain('factory_current_item_is')
      })
    }
  })
})
