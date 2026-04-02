---
name: threejs-rendering
description: "Use when writing Three.js rendering code, creating 3D scenes, working with meshes, InstancedMesh, cameras, lights, or resource cleanup. Covers Three.js patterns, interpolation between simulation ticks, and grid coordinate mapping for the Robot Factory game."
---

# Three.js Rendering Patterns

## Scene Setup
- Use `WebGLRenderer({ antialias: true, alpha: false })`.
- `PerspectiveCamera` with FOV 50, near 0.1, far 1000.
- Position camera at isometric angle: `camera.position.set(15, 15, 15)`, `camera.lookAt(10, 0, 10)`.
- `AmbientLight(0xffffff, 0.6)` + `DirectionalLight(0xffffff, 0.8)` from upper-right.

## InstancedMesh for Belt Items
```typescript
// One InstancedMesh per item type, pre-allocated
const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES)
mesh.count = 0 // Only render active instances

// Update loop — call each frame
const matrix = new THREE.Matrix4()
const position = new THREE.Vector3()
for (const item of activeItems) {
  position.set(item.worldX, 0.5, item.worldZ)
  matrix.setPosition(position)
  mesh.setMatrixAt(item.instanceIndex, matrix)
}
mesh.instanceMatrix.needsUpdate = true
```

## Interpolation Between Simulation Ticks
```typescript
// Rendering runs at 60fps, simulation at 10 ticks/sec
// Interpolate item positions for smooth movement
const alpha = timeSinceLastTick / tickDuration // 0.0 to 1.0
const renderX = prevX + (currX - prevX) * alpha
const renderZ = prevZ + (currZ - prevZ) * alpha
```

## Resource Cleanup
Always dispose when removing objects:
```typescript
mesh.geometry.dispose()
if (Array.isArray(mesh.material)) {
  mesh.material.forEach(m => m.dispose())
} else {
  mesh.material.dispose()
}
scene.remove(mesh)
```

## Grid Coordinate ↔ World Position
The grid is centered at the world origin. For a grid of size `W×H`, cell `(x, z)` maps to world center `(x - W/2 + 0.5, 0, z - H/2 + 0.5)`. With the default 20×20 grid, cell `(0, 0)` → `(-9.5, 0, -9.5)` and cell `(10, 10)` → `(0.5, 0, 0.5)`.
