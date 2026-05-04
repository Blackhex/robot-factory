import type { SimulationCommand } from './types.ts'
import type { SimulationCommandDispatcher } from './SimulationCommandDispatcher.ts'

/**
 * Owns the wait-aware command queue. Drains commands one-by-one each tick;
 * WAIT commands pause the queue (not the rest of the simulation) for the
 * given number of ticks. Dispatcher receives only DispatchableCommand.
 */
export class CommandQueueRunner {
  private queue: SimulationCommand[] = []
  private pendingWaitTicks = 0
  private readonly dispatcher: SimulationCommandDispatcher

  constructor(dispatcher: SimulationCommandDispatcher) {
    this.dispatcher = dispatcher
  }

  enqueue(command: SimulationCommand): void {
    this.queue.push(command)
  }

  enqueueAll(commands: SimulationCommand[]): void {
    this.queue.push(...commands)
  }

  /** Process the queue for one simulation tick. */
  tick(): void {
    if (this.pendingWaitTicks > 0) {
      this.pendingWaitTicks--
      return
    }
    while (this.queue.length > 0) {
      const c = this.queue.shift()!
      if (c.type === 'WAIT') {
        if (c.ticks > 0) {
          this.pendingWaitTicks = c.ticks - 1
          return
        }
        continue
      }
      this.dispatcher.execute(c)
    }
  }

  /** Reset all queued + pending-wait state. */
  clear(): void {
    this.queue.length = 0
    this.pendingWaitTicks = 0
  }
}
