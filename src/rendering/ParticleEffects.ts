import * as THREE from 'three'

interface Particle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  life: number
  maxLife: number
  color: THREE.Color
}

const MAX_SPARKS = 200
const MAX_SMOKE = 100

class ParticleSystem {
  private particles: Particle[] = []
  private points: THREE.Points
  private positionAttr: THREE.BufferAttribute
  private colorAttr: THREE.BufferAttribute
  private maxCount: number

  constructor(scene: THREE.Scene, maxCount: number, size: number) {
    this.maxCount = maxCount

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(maxCount * 3)
    const colors = new Float32Array(maxCount * 3)
    this.positionAttr = new THREE.BufferAttribute(positions, 3)
    this.colorAttr = new THREE.BufferAttribute(colors, 3)
    geometry.setAttribute('position', this.positionAttr)
    geometry.setAttribute('color', this.colorAttr)

    const material = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    this.points = new THREE.Points(geometry, material)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  emit(
    position: THREE.Vector3,
    count: number,
    velocityFn: () => THREE.Vector3,
    colorFn: () => THREE.Color,
    lifetime: number,
  ): void {
    const available = this.maxCount - this.particles.length
    const toSpawn = Math.min(count, available)
    for (let i = 0; i < toSpawn; i++) {
      this.particles.push({
        position: position.clone(),
        velocity: velocityFn(),
        life: lifetime,
        maxLife: lifetime,
        color: colorFn(),
      })
    }
  }

  update(dt: number, gravity: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      p.velocity.y += gravity * dt
      p.position.addScaledVector(p.velocity, dt)
    }

    const posArr = this.positionAttr.array as Float32Array
    const colArr = this.colorAttr.array as Float32Array

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      const alpha = p.life / p.maxLife
      posArr[i * 3] = p.position.x
      posArr[i * 3 + 1] = p.position.y
      posArr[i * 3 + 2] = p.position.z
      colArr[i * 3] = p.color.r * alpha
      colArr[i * 3 + 1] = p.color.g * alpha
      colArr[i * 3 + 2] = p.color.b * alpha
    }

    // Zero out remaining
    for (let i = this.particles.length; i < this.maxCount; i++) {
      posArr[i * 3] = 0
      posArr[i * 3 + 1] = -999
      posArr[i * 3 + 2] = 0
      colArr[i * 3] = 0
      colArr[i * 3 + 1] = 0
      colArr[i * 3 + 2] = 0
    }

    this.positionAttr.needsUpdate = true
    this.colorAttr.needsUpdate = true
    this.points.geometry.setDrawRange(0, this.maxCount)
  }

  dispose(scene: THREE.Scene): void {
    this.particles.length = 0
    this.points.geometry.dispose()
    ;(this.points.material as THREE.PointsMaterial).dispose()
    scene.remove(this.points)
  }
}

export class ParticleEffects {
  private scene: THREE.Scene
  private sparks: ParticleSystem
  private smoke: ParticleSystem

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.sparks = new ParticleSystem(scene, MAX_SPARKS, 0.08)
    this.smoke = new ParticleSystem(scene, MAX_SMOKE, 0.15)
  }

  emitSparks(position: THREE.Vector3): void {
    this.sparks.emit(
      position,
      15,
      () =>
        new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 2 + 1,
          (Math.random() - 0.5) * 3,
        ),
      () => {
        const t = Math.random()
        return new THREE.Color().setHSL(0.08 + t * 0.05, 1, 0.5 + t * 0.3)
      },
      0.5 + Math.random() * 0.3,
    )
  }

  emitSparksAt(x: number, y: number, z: number): void {
    this.emitSparks(new THREE.Vector3(x, y, z))
  }

  emitSmoke(position: THREE.Vector3): void {
    this.smoke.emit(
      position,
      5,
      () =>
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          Math.random() * 0.8 + 0.5,
          (Math.random() - 0.5) * 0.3,
        ),
      () => {
        const g = 0.4 + Math.random() * 0.2
        return new THREE.Color(g, g, g)
      },
      1.5 + Math.random() * 0.5,
    )
  }

  update(dt: number): void {
    this.sparks.update(dt, -5)
    this.smoke.update(dt, 0.2)
  }

  dispose(): void {
    this.sparks.dispose(this.scene)
    this.smoke.dispose(this.scene)
  }
}
