import * as THREE from 'three'
import type { ItemType, MachineType } from '../game/types'
import { ITEM_COLORS } from './ItemColors'

export const MACHINE_COLORS: Record<MachineType, number> = {
  part_fabricator: 0x4488ff,
  assembler: 0x44cc44,
  painter: 0xcc44cc,
  recycler: 0xff8844,
  splitter: 0x44cccc,
  factory_output: 0xfbbf24,
}

export const GRID_COLORS = {
  floor: 0x2a2a3e,
  minor: 0x4a5066,
  major: 0x6a7088,
} as const

export const MACHINE_ICONS: Record<MachineType, string> = {
  part_fabricator: '\u2699',  // ⚙ gear
  assembler: '\u2295',        // ⊕ circled plus
  painter: '\u25D0',          // ◐ circle with left half black
  recycler: '\u267B',         // ♻ recycling
  splitter: '\u22D4',         // ⋔ pitchfork
  factory_output: '\u2B07',   // ⬇ downwards arrow
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

export const RECIPE_ICON_COLORS = {
  ready: 0xffffff,
  missing: 0xff3333,
} as const

export function createRecipeItemBadgeTexture(itemType: ItemType): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const baseColor = ITEM_COLORS[itemType]
  const r = (baseColor >> 16) & 0xff
  const g = (baseColor >> 8) & 0xff
  const b = baseColor & 0xff

  const inset = size * 0.1
  const tileSize = size - inset * 2
  const radius = tileSize * 0.18

  const x = inset
  const y = inset
  const w = tileSize
  const h = tileSize

  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()

  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fill()

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.stroke()

  drawItemTypeGlyph(ctx, size, itemType, r, g, b)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function drawItemTypeGlyph(
  ctx: CanvasRenderingContext2D,
  size: number,
  itemType: ItemType,
  baseR: number, baseG: number, baseB: number,
): void {
  // Glyph color: 30% mix of the tile color toward black for contrast
  // while staying visually related.
  const gr = Math.round(baseR * 0.3)
  const gg = Math.round(baseG * 0.3)
  const gb = Math.round(baseB * 0.3)
  const stroke = `rgb(${gr},${gg},${gb})`
  ctx.strokeStyle = stroke
  ctx.fillStyle = stroke
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const cx = size / 2
  const cy = size / 2

  if (itemType.startsWith('wheel_')) {
    const tier = itemType === 'wheel_small' ? 0 : itemType === 'wheel_medium' ? 1 : 2
    const outer = size * (0.22 + tier * 0.04)
    // Filled outer disc + smaller stroked hub so the center is covered.
    ctx.beginPath(); ctx.arc(cx, cy, outer, 0, Math.PI * 2); ctx.fill()
    ctx.save()
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`
    ctx.beginPath(); ctx.arc(cx, cy, outer * 0.45, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.beginPath(); ctx.arc(cx, cy, outer * 0.18, 0, Math.PI * 2); ctx.fill()
    return
  }

  if (itemType.startsWith('battery_')) {
    const w = size * 0.36
    const h = size * 0.5
    const x = cx - w / 2
    const y = cy - h / 2
    ctx.fillRect(x, y, w, h)
    ctx.fillRect(cx - w * 0.18, y - size * 0.05, w * 0.36, size * 0.05)
    if (itemType !== 'battery_high_capacity') {
      // Hollow out top portion to distinguish from filled high-capacity
      ctx.save()
      ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`
      ctx.fillRect(x + 6, y + 6, w - 12, h * 0.45)
      ctx.restore()
    }
    return
  }

  if (itemType.startsWith('chassis_')) {
    const w = size * 0.56
    const h = size * 0.42
    const r = size * 0.08
    const x = cx - w / 2
    const y = cy - h / 2
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
    ctx.fill()
    // Inner cut-out
    ctx.save()
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`
    const inset = itemType === 'chassis_heavy' ? size * 0.04 : size * 0.06
    ctx.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2)
    ctx.restore()
    // Center crossbar so the middle is glyph-colored
    ctx.fillRect(cx - w * 0.4, cy - size * 0.03, w * 0.8, size * 0.06)
    return
  }

  if (itemType.startsWith('circuit_')) {
    const s = size * 0.52
    const x = cx - s / 2
    const y = cy - s / 2
    ctx.fillRect(x, y, s, s)
    ctx.save()
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`
    ctx.fillRect(x + 6, y + 6, s - 12, s - 12)
    ctx.restore()
    const traces = itemType === 'circuit_advanced' ? 3 : 2
    for (let i = 1; i <= traces; i++) {
      const t = i / (traces + 1)
      ctx.fillRect(x + s * t - 2, y, 4, s)
      ctx.fillRect(x, y + s * t - 2, s, 4)
    }
    // Center pad
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.05, 0, Math.PI * 2); ctx.fill()
    return
  }

  if (itemType.startsWith('drivetrain_')) {
    const adv = itemType === 'drivetrain_advanced'
    const r = size * 0.18
    if (adv) {
      drawFilledGear(ctx, cx - size * 0.12, cy, r * 0.9, baseR, baseG, baseB)
      drawFilledGear(ctx, cx + size * 0.14, cy, r * 0.7, baseR, baseG, baseB)
    } else {
      drawFilledGear(ctx, cx, cy, r, baseR, baseG, baseB)
    }
    return
  }

  if (itemType.startsWith('power_unit_')) {
    const high = itemType === 'power_unit_high'
    ctx.beginPath()
    ctx.moveTo(cx + size * 0.05, cy - size * 0.24)
    ctx.lineTo(cx - size * 0.14, cy + size * 0.04)
    ctx.lineTo(cx - size * 0.02, cy + size * 0.04)
    ctx.lineTo(cx - size * 0.08, cy + size * 0.24)
    ctx.lineTo(cx + size * 0.16, cy - size * 0.06)
    ctx.lineTo(cx + size * 0.03, cy - size * 0.06)
    ctx.closePath()
    ctx.fill()
    if (high) {
      // Extra dot to differentiate
      ctx.save()
      ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`
      ctx.beginPath(); ctx.arc(cx, cy, size * 0.03, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    return
  }

  if (itemType.startsWith('robot_')) {
    const w = size * 0.46
    const h = size * 0.38
    const x = cx - w / 2
    const y = cy - h / 2 + size * 0.02
    ctx.fillRect(x, y, w, h)
    // Eye cutouts
    ctx.save()
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`
    ctx.beginPath(); ctx.arc(cx - w * 0.22, cy + size * 0.02, size * 0.05, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(cx + w * 0.22, cy + size * 0.02, size * 0.05, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    if (itemType === 'robot_worker') {
      ctx.fillRect(x - size * 0.05, y - size * 0.04, w + size * 0.1, size * 0.04)
    }
    return
  }

  // Default (any unmapped): diamond
  const d = size * 0.24
  ctx.beginPath()
  ctx.moveTo(cx, cy - d)
  ctx.lineTo(cx + d, cy)
  ctx.lineTo(cx, cy + d)
  ctx.lineTo(cx - d, cy)
  ctx.closePath()
  ctx.fill()
}

function drawFilledGear(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number,
  baseR: number, baseG: number, baseB: number,
): void {
  const teeth = 8
  ctx.beginPath()
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2
    const rr = i % 2 === 0 ? r : r * 0.78
    const x = cx + Math.cos(a) * rr
    const y = cy + Math.sin(a) * rr
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.save()
  ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
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
  // repeat=1 ⇒ 1 UV cycle = 1 cell — keep in sync with BeltMeshRenderer.BELT_SCROLL_SPEED
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
