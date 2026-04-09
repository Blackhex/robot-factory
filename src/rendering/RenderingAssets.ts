import * as THREE from 'three'
import type { MachineType } from '../game/types'

export const MACHINE_COLORS: Record<MachineType, number> = {
  part_fabricator: 0x4488ff,
  assembler: 0x44cc44,
  quality_checker: 0xcccc44,
  painter: 0xcc44cc,
  recycler: 0xff8844,
  splitter: 0x44cccc,
}

export const MACHINE_ICONS: Record<MachineType, string> = {
  part_fabricator: '\u2699',  // ⚙ gear
  assembler: '\u2295',        // ⊕ circled plus
  quality_checker: '\u2714',  // ✔ check mark
  painter: '\u25D0',          // ◐ circle with left half black
  recycler: '\u267B',         // ♻ recycling
  splitter: '\u22D4',         // ⋔ pitchfork
}

export function createMachineIconTexture(type: MachineType): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  // Use a darker tint of the machine color for the icon
  const baseColor = MACHINE_COLORS[type]
  const r = Math.max(0, ((baseColor >> 16) & 0xff) * 0.45) | 0
  const g = Math.max(0, ((baseColor >> 8) & 0xff) * 0.45) | 0
  const b = Math.max(0, (baseColor & 0xff) * 0.45) | 0

  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.font = '80px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(MACHINE_ICONS[type], size / 2, size / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export function createArrowTexture(kind: 'input' | 'output'): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const color = kind === 'input' ? '#44ff44' : '#ff8844'
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const cx = size / 2
  if (kind === 'input') {
    // Down arrow (↓) — item entering
    ctx.beginPath()
    ctx.moveTo(cx, 8)
    ctx.lineTo(cx, 44)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - 18, 30)
    ctx.lineTo(cx, 54)
    ctx.lineTo(cx + 18, 30)
    ctx.fill()
  } else {
    // Up arrow (↑) — item leaving
    ctx.beginPath()
    ctx.moveTo(cx, 56)
    ctx.lineTo(cx, 20)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - 18, 34)
    ctx.lineTo(cx, 10)
    ctx.lineTo(cx + 18, 34)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export function createBeltArrowTexture(): THREE.CanvasTexture {
  const size = 128
  const padding = 28
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#666666'
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = '#999999'
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Two right-pointing chevrons that tile across the 128px width
  for (const xOff of [0, 32, 64, 96]) {
    ctx.beginPath()
    ctx.moveTo(xOff + 12, padding)
    ctx.lineTo(xOff + 24, size / 2)
    ctx.lineTo(xOff + 12, size - padding)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

export function createBeltDirectionMaterial(
  dir: 'east' | 'west' | 'north' | 'south',
  beltArrowTexture: THREE.CanvasTexture,
): THREE.MeshStandardMaterial {
  const tex = beltArrowTexture.clone()
  tex.needsUpdate = true
  tex.repeat.set(1, 1)

  if (dir !== 'east') {
    tex.center.set(0.5, 0.5)
  }
  switch (dir) {
    case 'east':
      break
    case 'west':
      tex.rotation = Math.PI
      break
    case 'south':
      tex.rotation = -Math.PI / 2
      break
    case 'north':
      tex.rotation = Math.PI / 2
      break
  }

  return new THREE.MeshStandardMaterial({
    color: 0xaaaacc,
    roughness: 0.8,
    map: tex,
  })
}
