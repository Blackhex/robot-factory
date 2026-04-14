import type { MachineState, MachineType, ItemType, SplitterCondition } from './types.ts'
import type { Item } from './Item.ts'
import type { Recipe } from './Recipe.ts'
import { createItem, createAssembly } from './Item.ts'

export class Machine {
  readonly id: string
  readonly machineType: MachineType
  state: MachineState = 'idle'
  currentRecipe: Recipe | null = null
  processingTimer = 0
  readonly inputSlots: Item[] = []
  outputSlot: Item | null = null
  readonly maxInputSlots: number
  consumedItems = 0

  // Multi-output support (QualityChecker, Splitter)
  secondaryOutputSlot: Item | null = null

  // QualityChecker configuration
  qualityThreshold = 80

  // Splitter configuration
  splitterCondition: SplitterCondition | null = null
  private splitterCounter = 0

  constructor(id: string, machineType: MachineType, maxInputSlots = 4) {
    this.id = id
    this.machineType = machineType
    this.maxInputSlots = maxInputSlots
  }

  setRecipe(recipe: Recipe): void {
    this.currentRecipe = recipe
  }

  addInput(item: Item): boolean {
    if (this.machineType === 'factory_output') {
      this.consumedItems++
      return true
    }
    if (this.inputSlots.length >= this.maxInputSlots) return false
    this.inputSlots.push(item)
    return true
  }

  takeOutput(): Item | null {
    const item = this.outputSlot
    this.outputSlot = null
    if (this.state === 'blocked') {
      this.state = 'idle'
    }
    return item
  }

  takeSecondaryOutput(): Item | null {
    const item = this.secondaryOutputSlot
    this.secondaryOutputSlot = null
    if (this.state === 'blocked') {
      this.state = 'idle'
    }
    return item
  }

  canAcceptInput(): boolean {
    if (this.machineType === 'factory_output') return true
    return this.inputSlots.length < this.maxInputSlots
  }

  tick(): void {
    switch (this.machineType) {
      case 'quality_checker':
        this.tickQualityChecker()
        break
      case 'splitter':
        this.tickSplitter()
        break
      case 'recycler':
        this.tickRecycler()
        break
      case 'factory_output':
        break
      default:
        this.tickDefault()
        break
    }
  }

  // --- Default tick (part_fabricator, assembler, painter) ---

  private tickDefault(): void {
    switch (this.state) {
      case 'idle':
        this.tryStartProcessing()
        break
      case 'processing':
        this.processingTimer--
        if (this.processingTimer <= 0) {
          if (this.outputSlot === null) {
            this.produceOutput()
            this.state = 'idle'
            this.tryStartProcessing()
          } else {
            this.state = 'blocked'
          }
        }
        break
      case 'blocked':
        if (this.outputSlot === null) {
          this.produceOutput()
          this.state = 'idle'
          this.tryStartProcessing()
        }
        break
    }
  }

  // --- QualityChecker tick ---

  private tickQualityChecker(): void {
    switch (this.state) {
      case 'idle':
        if (this.inputSlots.length > 0) {
          this.processingTimer = 1
          this.state = 'processing'
        }
        break
      case 'processing':
        this.processingTimer--
        if (this.processingTimer <= 0) {
          this.tryRouteCheckedItem()
        }
        break
      case 'blocked':
        this.tryRouteCheckedItem()
        break
    }
  }

  private tryRouteCheckedItem(): void {
    if (this.inputSlots.length === 0) {
      this.state = 'idle'
      return
    }

    const item = this.inputSlots[0]

    if (item.quality >= this.qualityThreshold) {
      if (this.outputSlot === null) {
        this.outputSlot = this.inputSlots.shift()!
        this.state = 'idle'
      } else {
        this.state = 'blocked'
      }
    } else {
      if (this.secondaryOutputSlot === null) {
        this.secondaryOutputSlot = this.inputSlots.shift()!
        this.state = 'idle'
      } else {
        this.state = 'blocked'
      }
    }
  }

  // --- Splitter tick ---
  // TODO: 3-output routing will be handled at the simulation layer

  private tickSplitter(): void {
    switch (this.state) {
      case 'idle':
        if (this.inputSlots.length > 0) {
          this.tryRouteSplitterItem()
        }
        break
      case 'blocked':
        this.tryRouteSplitterItem()
        break
    }
  }

  private tryRouteSplitterItem(): void {
    if (this.inputSlots.length === 0) {
      this.state = 'idle'
      return
    }

    const item = this.inputSlots[0]
    const route = this.evaluateSplitterCondition(item)

    if (route === 'primary') {
      if (this.outputSlot === null) {
        this.outputSlot = this.inputSlots.shift()!
        this.state = 'idle'
      } else {
        this.state = 'blocked'
      }
    } else {
      if (this.secondaryOutputSlot === null) {
        this.secondaryOutputSlot = this.inputSlots.shift()!
        this.state = 'idle'
      } else {
        this.state = 'blocked'
      }
    }
  }

  private evaluateSplitterCondition(_item: Item): 'primary' | 'secondary' {
    if (!this.splitterCondition) return 'primary'

    switch (this.splitterCondition.conditionType) {
      case 'by_item_type':
        return _item.type === this.splitterCondition.itemType ? 'primary' : 'secondary'
      case 'by_quality':
        return _item.quality >= (this.splitterCondition.qualityThreshold ?? 80)
          ? 'primary'
          : 'secondary'
      case 'alternating':
        this.splitterCounter++
        return this.splitterCounter % 2 === 1 ? 'primary' : 'secondary'
      default:
        return 'primary'
    }
  }

  // --- Recycler tick ---

  private tickRecycler(): void {
    switch (this.state) {
      case 'idle':
        if (this.inputSlots.length > 0) {
          this.inputSlots.shift() // consume the input
          this.processingTimer = 3
          this.state = 'processing'
        }
        break
      case 'processing':
        this.processingTimer--
        if (this.processingTimer <= 0) {
          if (this.outputSlot === null) {
            this.outputSlot = createItem('raw_material')
            this.state = 'idle'
          } else {
            this.state = 'blocked'
          }
        }
        break
      case 'blocked':
        if (this.outputSlot === null) {
          this.outputSlot = createItem('raw_material')
          this.state = 'idle'
        }
        break
    }
  }

  // --- Shared helpers ---

  private tryStartProcessing(): void {
    if (!this.currentRecipe) return
    if (!this.hasRequiredInputs()) return

    this.consumeInputs()
    this.processingTimer = this.currentRecipe.processingTicks
    this.state = 'processing'
  }

  private hasRequiredInputs(): boolean {
    const recipe = this.currentRecipe
    if (!recipe) return false

    // Fabricators have no inputs
    if (recipe.inputs.length === 0) return true

    // Check each required input
    const available = new Map<ItemType, number>()
    for (const item of this.inputSlots) {
      available.set(item.type, (available.get(item.type) ?? 0) + 1)
    }

    for (const input of recipe.inputs) {
      const count = available.get(input.type) ?? 0
      if (count < input.quantity) return false
    }

    return true
  }

  private consumeInputs(): void {
    const recipe = this.currentRecipe
    if (!recipe || recipe.inputs.length === 0) return

    for (const input of recipe.inputs) {
      let remaining = input.quantity
      for (let i = this.inputSlots.length - 1; i >= 0 && remaining > 0; i--) {
        if (this.inputSlots[i].type === input.type) {
          this.inputSlots.splice(i, 1)
          remaining--
        }
      }
    }
  }

  private produceOutput(): void {
    const recipe = this.currentRecipe
    if (!recipe || recipe.outputs.length === 0) return

    const output = recipe.outputs[0]

    // Assembler: create assembly from consumed components
    if (recipe.inputs.length > 0) {
      this.outputSlot = createAssembly(output.type, [])
    } else {
      this.outputSlot = createItem(output.type)
    }
  }
}
