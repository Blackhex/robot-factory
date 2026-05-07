import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..', '..', '..')
const PARTICLE_EFFECTS_PATH = resolve(ROOT, 'src', 'rendering', 'ParticleEffects.ts')

function readSource(): string {
  return readFileSync(PARTICLE_EFFECTS_PATH, 'utf8')
}

function matchAll(source: string, pattern: RegExp): string[] {
  return Array.from(source.matchAll(pattern), (match) => match[1])
}

describe('ParticleEffects confetti removal', () => {
  it('does not keep a confetti particle system alongside sparks and smoke', () => {
    const source = readSource()
    const ownedParticleSystems = matchAll(source, /private\s+(\w+)\s*:\s*ParticleSystem/g)
    const constructedParticleSystems = matchAll(source, /this\.(\w+)\s*=\s*new\s+ParticleSystem\(/g)

    expect(source).toMatch(/private\s+sparks\s*:\s*ParticleSystem/)
    expect(source).toMatch(/private\s+smoke\s*:\s*ParticleSystem/)
    expect(ownedParticleSystems).toEqual(['sparks', 'smoke'])
    expect(constructedParticleSystems).toEqual(['sparks', 'smoke'])
    expect(source).not.toMatch(/MAX_CONFETTI/)
    expect(source).not.toMatch(/private\s+confetti\s*:\s*ParticleSystem/)
    expect(source).not.toMatch(/this\.confetti\s*=\s*new\s+ParticleSystem/)
  })

  it('does not expose an emitConfetti API anymore', () => {
    const source = readSource()

    expect(source).not.toMatch(/\bemitConfetti\s*\(/)
  })

  it('keeps the spark and smoke public APIs explicitly available', () => {
    const source = readSource()

    expect(source).toMatch(/\bemitSparks\s*\(\s*position\s*:\s*THREE\.Vector3\s*\)/)
    expect(source).toMatch(/\bemitSparksAt\s*\(\s*x\s*:\s*number\s*,\s*y\s*:\s*number\s*,\s*z\s*:\s*number\s*\)/)
    expect(source).toMatch(/\bemitSmoke\s*\(\s*position\s*:\s*THREE\.Vector3\s*\)/)
  })

  it('does not reference firework or fireworks celebration effects', () => {
    const source = readSource()

    expect(source).not.toMatch(/\bfireworks?\b/i)
  })

  it('updates only sparks and smoke systems', () => {
    const source = readSource()

    expect(source).toMatch(/this\.sparks\.update\(dt,\s*-5\)/)
    expect(source).toMatch(/this\.smoke\.update\(dt,\s*0\.2\)/)
    expect(source).not.toMatch(/this\.confetti\.update\(/)
  })

  it('disposes only sparks and smoke systems', () => {
    const source = readSource()

    expect(source).toMatch(/this\.sparks\.dispose\(this\.scene\)/)
    expect(source).toMatch(/this\.smoke\.dispose\(this\.scene\)/)
    expect(source).not.toMatch(/this\.confetti\.dispose\(this\.scene\)/)
  })
})