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

  /**
   * Drain non-WAIT commands at the head of the queue without touching
   * `pendingWaitTicks`. Stops at the first WAIT (which stays queued
   * for the next regular `tick()`). Used between successive arrival
   * handler invocations so per-item routing overrides apply before
   * the next handler's `currentItem` lookup races them.
   */
  drainHead(): void {
    if (this.pendingWaitTicks > 0) return
    while (this.queue.length > 0 && this.queue[0].type !== 'WAIT') {
      const c = this.queue.shift()!
      if (c.type !== 'WAIT') this.dispatcher.execute(c)
    }
  }
}
