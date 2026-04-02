---
name: simulation
description: "Use when implementing simulation logic, machine state machines, conveyor belt transport, recipe processing, or scoring calculations. Covers game simulation patterns for the Robot Factory. Use for: tick-based simulation, MachineState, item transport, belt speed, entity IDs, event emitter, SimulationCommand."
---

# Simulation Engine Patterns

## Critical Constraint
Files in `src/game/` must NEVER import from `three`, `pxt-core`, or DOM APIs. This layer is pure logic.

## Tick-Based Simulation
```typescript
const TICK_RATE = 10 // ticks per second
const TICK_DURATION = 1 / TICK_RATE // 0.1 seconds per tick

class Simulation {
  tick(commands: SimulationCommand[]): void {
    this.processCommands(commands)
    this.updateMachines()
    this.advanceBelts()
    this.checkCompletions()
    this.updateScoring()
    this.emitEvents()
    this.currentTick++
  }
}
```

## Machine State Machine
```typescript
enum MachineState { Idle, Processing, Blocked }

update(): void {
  switch (this.state) {
    case MachineState.Idle:
      if (this.hasRequiredInputs() && this.currentRecipe) {
        this.consumeInputs()
        this.processingTimer = this.currentRecipe.processingTicks
        this.state = MachineState.Processing
      }
      break
    case MachineState.Processing:
      this.processingTimer--
      if (this.processingTimer <= 0) {
        if (this.canOutput()) {
          this.produceOutput()
          this.state = MachineState.Idle
        } else {
          this.state = MachineState.Blocked
        }
      }
      break
    case MachineState.Blocked:
      if (this.canOutput()) {
        this.produceOutput()
        this.state = MachineState.Idle
      }
      break
  }
}
```

## Item Transport on Belts
Items advance by `speed * tickDuration` per tick. Use a sorted array by position for efficient processing.

## Entity IDs
Use string IDs (`machine_1`, `belt_3_7`) not object references — enables serialization, debugging, and command targeting.

## Events
Use a simple event emitter pattern — no DOM events:
```typescript
type SimEventHandler = (event: SimulationEvent) => void
private handlers = new Map<string, SimEventHandler[]>()
on(type: string, handler: SimEventHandler): void
emit(type: string, data: unknown): void
```
