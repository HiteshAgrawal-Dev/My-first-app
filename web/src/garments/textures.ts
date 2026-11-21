import * as THREE from 'three'

/**
 * Procedural, tileable fabric micro-structure. Every texture is generated on the CPU into a
 * DataTexture (no network, no image files) and cached for the lifetime of the page.
 */

export type WeaveKind = 'knit' | 'loopback' | 'rib' | 'ripstop' | 'twill' | 'crepe' | 'velvet' | 'nylon' | 'gabardine'

const cache = new Map<string, THREE.DataTexture>()

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Periodic value noise in [0,1]; x,y in lattice units, period p (integer). */
function tnoise(x: number, y: number, p: number, seed = 7) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const fx = x - xi, fy = y - yi
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const m = (v: number) => ((v % p) + p) % p
  const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed)
  const c = hash2(m(xi), m(yi + 1), seed), d = hash2(m(xi + 1), m(yi + 1), seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

function tfbm(x: number, y: number, p: number, oct = 4, seed = 3) {
  let s = 0, a = 0.5, f = 1, n = 0
  for (let i = 0; i < oct; i++) {
    s += a * tnoise(x * f, y * f, p * f, seed + i * 17)
    n += a
    a *= 0.5
    f *= 2
  }
  return s / n
}

const sat = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (e0: number, e1: number, x: number) => {
  const t = sat((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** Height field generators, x,y in [0,1). */
const HEIGHTS: Record<WeaveKind, (x: number, y: number) => number> = {
  // single jersey: columns of interlocking V loops
  knit: (x, y) => {
    const W = 48, H = 64
    const cx = x * W, cy = y * H
    const ci = Math.floor(cx), cj = Math.floor(cy)
    const fx = cx - ci - 0.5, fy = cy - cj - 0.5
    // two leaning legs of a V
    const leg = (sx: number) => {
      const lx = fx - sx * 0.22 - fy * sx * 0.35
      const d = (lx * lx) / 0.05 + (fy * fy) / 0.32
      return Math.max(0, 1 - d)
    }
    const h = Math.max(leg(-1), leg(1))
    const fib = tfbm(x * 64, y * 64, 64, 2, 11) * 0.25
    const irr = (hash2(ci % W, cj % H, 5) - 0.5) * 0.25
    return Math.sqrt(h) * (0.85 + irr) + fib
  },
  // loopback cotton face: dense knit + slightly coarser irregular yarn slubs
  loopback: (x, y) => {
    const k = HEIGHTS.knit(x, y)
    const slub = tfbm(x * 16, y * 48, 16, 3, 23)
    return k * 0.8 + slub * 0.35
  },
  rib: (x, y) => {
    const R = 24
    const r = 0.5 + 0.5 * Math.cos(x * R * Math.PI * 2)
    const k = HEIGHTS.knit(x, y)
    return Math.pow(r, 0.7) * 0.85 + k * 0.25
  },
  ripstop: (x, y) => {
    const T = 96 // threads
    const G = 12 // grid every 8 threads
    const wx = 0.5 + 0.5 * Math.cos(x * T * Math.PI * 2)
    const wy = 0.5 + 0.5 * Math.cos(y * T * Math.PI * 2)
    const chk = (Math.floor(x * T) + Math.floor(y * T)) % 2 ? wx : wy
    const gx = Math.abs(((x * G) % 1) - 0.5) * 2, gy = Math.abs(((y * G) % 1) - 0.5) * 2
    const grid = Math.max(smooth(0.86, 0.97, gx), smooth(0.86, 0.97, gy))
    const crinkle = tfbm(x * 6, y * 6, 6, 3, 41)
    return chk * 0.35 + grid * 0.9 + crinkle * 0.5
  },
  nylon: (x, y) => {
    const G = 8
    const gx = Math.abs(((x * G) % 1) - 0.5) * 2, gy = Math.abs(((y * G) % 1) - 0.5) * 2
    const grid = Math.max(smooth(0.9, 0.98, gx), smooth(0.9, 0.98, gy))
    const crinkle = tfbm(x * 5, y * 5, 5, 4, 51)
    return grid * 0.18 + crinkle * 0.9
  },
  twill: (x, y) => {
    const N = 64
    const d = ((x + y * 0.5) * N) % 1
    const wale = Math.pow(0.5 + 0.5 * Math.sin(d * Math.PI * 2), 1.5)
    const yarn = tfbm(x * 128, y * 32, 128, 2, 61) * 0.3
    return wale * 0.8 + yarn + tfbm(x * 8, y * 8, 8, 3, 63) * 0.25
  },
  gabardine: (x, y) => {
    const N = 96
    const d = ((x + y) * N) % 1
    const wale = Math.pow(0.5 + 0.5 * Math.sin(d * Math.PI * 2), 2)
    return wale * 0.6 + tfbm(x * 10, y * 10, 10, 3, 71) * 0.3
  },
  crepe: (x, y) => {
    return tfbm(x * 64, y * 64, 64, 3, 81) * 0.8 + tfbm(x * 12, y * 12, 12, 2, 83) * 0.4
  },
  velvet: (x, y) => {
    // crushed pile: soft low-frequency mottling + extremely fine fibre noise
    return tfbm(x * 6, y * 6, 6, 4, 91) * 0.9 + tfbm(x * 128, y * 128, 128, 1, 93) * 0.15
  },
}

function makeNormalFromHeight(size: number, hf: (x: number, y: number) => number, strength: number) {
  const h = new Float32Array(size * size)
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) h[j * size + i] = hf(i / size, j / size)
  const data = new Uint8Array(size * size * 4)
  const at = (i: number, j: number) => h[((j + size) % size) * size + ((i + size) % size)]
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = (at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i - 1, j) - at(i - 1, j + 1)) * strength
      const dy = (at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i, j - 1) - at(i + 1, j - 1)) * strength
      const nx = -dx, ny = -dy, nz = 1
      const l = Math.hypot(nx, ny, nz)
      const k = (j * size + i) * 4
      data[k] = Math.round((nx / l * 0.5 + 0.5) * 255)
      data[k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255)
      data[k + 2] = Math.round((nz / l * 0.5 + 0.5) * 255)
      data[k + 3] = Math.round(sat(h[j * size + i]) * 255) // height in alpha (unused by three)
    }
  }
  return data
}

export function fabricNormalMap(kind: WeaveKind, size = 512): THREE.DataTexture {
  const key = `n:${kind}:${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const strength = kind === 'velvet' || kind === 'nylon' ? 1.2 : kind === 'crepe' ? 2.2 : 3.0
  const data = makeNormalFromHeight(size, HEIGHTS[kind], strength)
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}

/** Low-frequency roughness/brightness variation (fabric mottling), greyscale. */
export function mottleMap(size = 256): THREE.DataTexture {
  const key = `m:${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const data = new Uint8Array(size * size * 4)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const v = 0.82 + 0.18 * tfbm((i / size) * 4, (j / size) * 4, 4, 4, 101)
      const k = (j * size + i) * 4
      const b = Math.round(sat(v) * 255)
      data[k] = b; data[k + 1] = b; data[k + 2] = b; data[k + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}

/** Dash pattern for topstitching: u runs along the thread. */
export function stitchAlphaMap(): THREE.DataTexture {
  const key = 'stitch'
  const hit = cache.get(key)
  if (hit) return hit
  const w = 64, h = 4
  const data = new Uint8Array(w * h * 4)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = i / w
      const on = x > 0.12 && x < 0.78 ? 255 : 0
      const k = (j * w + i) * 4
      data[k] = on; data[k + 1] = on; data[k + 2] = on; data[k + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}

/** Wordmark texture (white on transparent) for embroidery/labels. */
export function wordmarkTexture(text = 'VÉLOURA', w = 1024, h = 256): THREE.Texture {
  const key = `w:${text}:${w}x${h}`
  const hit = cache.get(key)
  if (hit) return hit as unknown as THREE.DataTexture
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 ${Math.round(h * 0.62)}px "Didot", "Bodoni 72", "Playfair Display", "Times New Roman", serif`
  // letter spacing for a couture feel
  const chars = [...text]
  const spacing = h * 0.16
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)
  let x = (w - total) / 2
  chars.forEach((c, i) => {
    ctx.fillText(c, x + widths[i] / 2, h * 0.54)
    x += widths[i] + spacing
  })
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  cache.set(key, tex as unknown as THREE.DataTexture)
  return tex
}
