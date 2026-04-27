import { Factory } from '../../../../../src/game/Factory'
import { Simulation } from '../../../../../src/game/Simulation'
import { resetItemIdCounter } from '../../../../../src/game/Item'

export interface MigrationTestContext {
  factory: Factory
  sim: Simulation
}

export function createMigrationTestContext(width = 10, height = 10): MigrationTestContext {
  resetItemIdCounter()
  return {
    factory: new Factory(width, height),
    sim: new Simulation(),
  }
}