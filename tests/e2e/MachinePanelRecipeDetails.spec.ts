import { test, expect } from './pom'
import type { FactorySaveLike } from './pom/data/saves'

/**
 * Feature pin: when a machine with a SET recipe is selected, the Machine
 * Panel must display the recipe's inputs ("Needs") and outputs ("Makes")
 * in addition to the recipe name. When no recipe is set, none of those
 * rows are visible.
 *
 * RED state expectation: `recipe_inputs` / `recipe_outputs` rows do not
 * exist yet in `src/ui/MachinePanel.ts`, so the first test must fail at
 * `expectRecipeInputsValue` (locator never becomes visible). The second
 * test passes today because absent rows count as hidden.
 */
test.use({ viewport: { width: 1920, height: 1080 } })

const ASSEMBLER_CELL = { x: 13, z: 10 }
const FABRICATOR_CELL = { x: 10, z: 10 }

function buildAssemblerSaveWithRecipe(): FactorySaveLike {
  // `Machine.A` resolves to the first dynamic machine (slotIndex 0).
  const ts = 'machines.setRecipe(Machine.A, Recipe.AssembleDrivetrainBasic)\n'
  return {
    version: 3,
    grid: [{
      x: ASSEMBLER_CELL.x,
      z: ASSEMBLER_CELL.z,
      machineType: 'assembler',
      rotation: 'east',
    }],
    belts: [],
    pxtWorkspace: JSON.stringify({ ts, blocks: '' }),
  }
}

test.describe('Machine panel — recipe inputs / outputs detail rows', () => {
  test('shows recipe inputs and outputs for an Assembler with a recipe set', async ({
    mainMenu, toolbar, grid, machinePanel, recipeIcon, saves, probe,
  }) => {
    test.setTimeout(60_000)

    // Seed sandbox BEFORE app boot so autoload restores the assembler
    // AND interprets the program (Group D pattern from
    // RecipeStatusIconSandboxAutoload.spec.ts).
    await saves.seedSandboxProjectAsActive(
      'machine-panel-recipe-details-assembler',
      buildAssemblerSaveWithRecipe(),
    )

    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    // Precondition: autoload restored the assembler.
    const machines = await probe.getMachines()
    const asm = machines.find(
      (m) => m.x === ASSEMBLER_CELL.x && m.z === ASSEMBLER_CELL.z,
    )
    expect(
      asm,
      'precondition: autoRestoreFactory must restore the seeded assembler',
    ).toBeTruthy()
    expect(asm!.type).toBe('assembler')

    // Precondition: the program-driven recipe assignment landed on the
    // machine. Reuses the same waiting seam as Group D specs.
    await recipeIcon.forceSync()
    await expect.poll(
      async () =>
        recipeIcon.readRecipeOutputTypeAt(ASSEMBLER_CELL.x, ASSEMBLER_CELL.z),
      {
        timeout: 15_000,
        message:
          'precondition: setRecipe(Machine.A, AssembleDrivetrainBasic) must apply during autoload',
      },
    ).toBe('drivetrain_basic')

    // Select the assembler — the Machine Panel opens.
    await grid.clickCell(ASSEMBLER_CELL)
    await machinePanel.expectVisible()

    // Recipe row (already implemented) still works.
    await machinePanel.expectRecipeValue('Basic Drivetrain')

    // GREEN feature — currently absent rows that must appear:
    // assemble_drivetrain_basic ⇒ inputs: 2× wheel_small, 1× circuit_basic
    //                            ⇒ outputs: 1× drivetrain_basic
    await machinePanel.expectRecipeInputsValue('2× Small Wheel, 1× Basic Circuit')
    await machinePanel.expectRecipeOutputsValue('1× Basic Drivetrain')
  })

  test('hides recipe inputs / outputs rows for a machine without a recipe', async ({
    mainMenu, toolbar, grid, machinePanel, probe,
  }) => {
    test.setTimeout(45_000)

    // Fresh sandbox (no seeded program → placed machine has no recipe).
    await mainMenu.open()
    await mainMenu.clickSandbox()
    await toolbar.expectVisible()
    await toolbar.waitForCameraSettle()

    // Place a fabricator (double-click default places `part_fabricator`).
    await grid.dblClickCell(FABRICATOR_CELL)
    await expect.poll(
      async () => {
        const ms = await probe.getMachines()
        return ms.find(
          (m) => m.x === FABRICATOR_CELL.x && m.z === FABRICATOR_CELL.z,
        )?.type ?? null
      },
      { timeout: 10_000 },
    ).toBe('part_fabricator')

    // Select it — the Machine Panel opens.
    await grid.clickCell(FABRICATOR_CELL)
    await machinePanel.expectVisible()

    // With no recipe assigned, none of the recipe-related rows render.
    await machinePanel.expectRecipeRowHidden()
    await machinePanel.expectRecipeInputsRowHidden()
    await machinePanel.expectRecipeOutputsRowHidden()
  })
})
