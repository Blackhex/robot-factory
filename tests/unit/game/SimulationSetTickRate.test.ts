import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Simulation } from '../../../src/game/Simulation'

describe('Simulation.setTickRate', () => {
  let sim: Simulation

  beforeEach(() => {
    vi.useFakeTimers()
    sim = new Simulation(10)
  })

  afterEach(() => {
    sim.stop()
    vi.useRealTimers()
  })

  it('updates tickRate and applies new interval while running', () => {
    sim.start()
    expect(sim.tickRate).toBe(10)

    // At 10 Hz: advancing 100ms should produce ~1 tick.
    vi.advanceTimersByTime(100)
    const ticksAt10Hz = sim.currentTick
    expect(ticksAt10Hz).toBe(1)

    // Switch to 50 Hz mid-run.
    ;sim.setTickRate(50)
    expect(sim.tickRate).toBe(50)

    const before = sim.currentTick
    // At 50 Hz: 100ms should produce ~5 ticks.
    vi.advanceTimersByTime(100)
    expect(sim.currentTick - before).toBe(5)
  })

  it('updates tickRate before start() and uses it when start() is called', () => {
    ;sim.setTickRate(20)
    expect(sim.tickRate).toBe(20)

    sim.start()
    // At 20 Hz: 100ms => 2 ticks.
    vi.advanceTimersByTime(100)
    expect(sim.currentTick).toBe(2)
  })

  it('is safe to call when not running (no timer started, value updates)', () => {
    expect(sim.running).toBe(false)
    ;sim.setTickRate(25)
    expect(sim.tickRate).toBe(25)
    expect(sim.running).toBe(false)
    // Advancing fake timers should not produce ticks (no interval armed).
    vi.advanceTimersByTime(1000)
    expect(sim.currentTick).toBe(0)
  })

  it('is safe to call while paused; new rate applies after resume', () => {
    sim.start()
    sim.pause()
    ;sim.setTickRate(100)
    expect(sim.tickRate).toBe(100)
    // While paused, no ticks accumulate.
    vi.advanceTimersByTime(100)
    expect(sim.currentTick).toBe(0)

    sim.resume()
    const before = sim.currentTick
    // At 100 Hz: 100ms => 10 ticks.
    vi.advanceTimersByTime(100)
    expect(sim.currentTick - before).toBe(10)
  })

  it('throws on zero', () => {
    expect(() => sim.setTickRate(0)).toThrow()
  })

  it('throws on negative rate', () => {
    expect(() => sim.setTickRate(-5)).toThrow()
  })

  it('throws on NaN', () => {
    expect(() => sim.setTickRate(Number.NaN)).toThrow()
  })

  it('throws on Infinity', () => {
    expect(() => sim.setTickRate(Number.POSITIVE_INFINITY)).toThrow()
  })

  it('does not change currentTick or gameOver state', () => {
    sim.start()
    vi.advanceTimersByTime(300) // ~3 ticks at 10 Hz
    const tickBefore = sim.currentTick
    const gameOverBefore = sim.gameOver

    ;sim.setTickRate(50)

    expect(sim.currentTick).toBe(tickBefore)
    expect(sim.gameOver).toBe(gameOverBefore)
  })
})
