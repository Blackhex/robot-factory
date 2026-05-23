import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..', '..', '..')
const PARTICLE_EFFECTS_PATH = resolve(ROOT, 'src', 'rendering', 'ParticleEffects.ts')
const MAIN_TS_PATH = resolve(ROOT, 'src', 'main.ts')
const WIRE_SIM_EFFECTS_PATH = resolve(ROOT, 'src', 'ui', 'wireSimulationEffects.ts')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('ParticleEffects system is fully removed', () => {
  it('src/rendering/ParticleEffects.ts does not exist', () => {
    expect(existsSync(PARTICLE_EFFECTS_PATH)).toBe(false)
  })

  describe('src/main.ts', () => {
    it('does not reference ParticleEffects', () => {
      const source = read(MAIN_TS_PATH)
      expect(source).not.toMatch(/\bParticleEffects\b/)
    })

    it('does not declare or use a particleEffects identifier', () => {
      const source = read(MAIN_TS_PATH)
      expect(source).not.toMatch(/\bparticleEffects\b/)
    })

    it('does not import from ./rendering/ParticleEffects', () => {
      const source = read(MAIN_TS_PATH)
      expect(source).not.toMatch(/from\s+['"][^'"]*rendering\/ParticleEffects['"]/)
    })
  })

  describe('src/ui/wireSimulationEffects.ts', () => {
    it('does not declare ParticleEffectsLike', () => {
      const source = read(WIRE_SIM_EFFECTS_PATH)
      expect(source).not.toMatch(/\bParticleEffectsLike\b/)
    })

    it('does not declare or use getParticleEffects', () => {
      const source = read(WIRE_SIM_EFFECTS_PATH)
      expect(source).not.toMatch(/\bgetParticleEffects\b/)
    })

    it('does not reference emitSparks*', () => {
      const source = read(WIRE_SIM_EFFECTS_PATH)
      expect(source).not.toMatch(/\bemitSparks[A-Za-z]*\b/)
    })

    it('does not branch on machine state "processing"', () => {
      const source = read(WIRE_SIM_EFFECTS_PATH)
      expect(source).not.toMatch(/['"]processing['"]/)
    })
  })
})
