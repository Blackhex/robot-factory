import * as THREE from 'three'

interface PartMeshEntry {
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
}

export class RobotPreview {
  private group: THREE.Group = new THREE.Group()
  private parts: PartMeshEntry[] = []
  private spinSpeed = 0

  buildRobot(parts: string[]): void {
    this.clearParts()

    // Always add chassis as the base
    if (parts.includes('chassis') || parts.length > 0) {
      this.addChassis()
    }

    for (const part of parts) {
      switch (part) {
        case 'wheels':
          this.addWheels()
          break
        case 'sensors':
          this.addSensors()
          break
        case 'battery':
          this.addBattery()
          break
        case 'chassis':
          // Already added above
          break
        default:
          break
      }
    }
  }

  private addChassis(): void {
    const geometry = new THREE.BoxGeometry(1.2, 0.3, 0.8)
    const material = new THREE.MeshStandardMaterial({ color: 0x5588dd })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = 0.25
    this.group.add(mesh)
    this.parts.push({ mesh, material })
  }

  private addWheels(): void {
    const geometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 12)
    const material = new THREE.MeshStandardMaterial({ color: 0x444444 })

    const offsets = [
      { x: -0.5, z: -0.45 },
      { x: -0.5, z: 0.45 },
      { x: 0.5, z: -0.45 },
      { x: 0.5, z: 0.45 },
    ]

    for (const off of offsets) {
      const wheel = new THREE.Mesh(geometry, material)
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(off.x, 0.1, off.z)
      this.group.add(wheel)
      this.parts.push({ mesh: wheel, material })
    }
  }

  private addSensors(): void {
    const geometry = new THREE.SphereGeometry(0.1, 8, 6)
    const material = new THREE.MeshStandardMaterial({
      color: 0x44cc44,
      emissive: 0x115511,
    })

    const positions = [
      { x: 0.3, y: 0.5 },
      { x: -0.3, y: 0.5 },
    ]

    for (const pos of positions) {
      const sensor = new THREE.Mesh(geometry, material)
      sensor.position.set(pos.x, pos.y, 0)
      this.group.add(sensor)
      this.parts.push({ mesh: sensor, material })
    }
  }

  private addBattery(): void {
    const geometry = new THREE.BoxGeometry(0.3, 0.2, 0.4)
    const material = new THREE.MeshStandardMaterial({ color: 0xddaa22 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(-0.55, 0.35, 0)
    this.group.add(mesh)
    this.parts.push({ mesh, material })
  }

  private clearParts(): void {
    for (const entry of this.parts) {
      entry.mesh.geometry.dispose()
      entry.material.dispose()
      this.group.remove(entry.mesh)
    }
    this.parts.length = 0
  }

  spin(speed = 0.5): void {
    this.spinSpeed = speed
  }

  update(dt: number): void {
    if (this.spinSpeed !== 0) {
      this.group.rotation.y += this.spinSpeed * dt
    }
  }

  getGroup(): THREE.Group {
    return this.group
  }

  dispose(): void {
    this.clearParts()
  }
}
