// Deterministic gradient noise + helpers used for fabric folds and textures.

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rng(seed: number) {
  return mulberry32(seed)
}

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
]

export class Noise3 {
  private perm = new Uint8Array(512)
  constructor(seed = 1) {
    const r = mulberry32(seed)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      const t = p[i]; p[i] = p[j]; p[j] = t
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
  }

  /** Classic Perlin noise, range roughly [-1, 1]. */
  noise(x: number, y: number, z: number): number {
    const P = this.perm
    let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z)
    x -= X; y -= Y; z -= Z
    X &= 255; Y &= 255; Z &= 255
    const u = fade(x), v = fade(y), w = fade(z)
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z
    const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z
    return lerp(
      lerp(lerp(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u),
        lerp(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u), v),
      w,
    ) * 1.1
  }

  fbm(x: number, y: number, z: number, oct = 4, lac = 2.03, gain = 0.5): number {
    let a = 1, f = 1, s = 0, n = 0
    for (let i = 0; i < oct; i++) {
      s += a * this.noise(x * f, y * f, z * f)
      n += a
      a *= gain
      f *= lac
    }
    return s / n
  }

  /** Ridged noise in [0,1] — sharp crease lines. */
  ridge(x: number, y: number, z: number): number {
    const n = 1 - Math.abs(this.noise(x, y, z))
    return n * n
  }
}

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function grad(h: number, x: number, y: number, z: number) {
  const g = GRAD3[h % 12]
  return g[0] * x + g[1] * y + g[2] * z
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
/** Smooth bump centred on c with half-width w (gaussian). */
export const bump = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (w * w))
/** Superellipse cross-section point. */
export function superellipse(theta: number, a: number, b: number, n: number): [number, number] {
  const s = Math.sin(theta), c = Math.cos(theta)
  const e = 2 / n
  return [a * Math.sign(s) * Math.pow(Math.abs(s), e), b * Math.sign(c) * Math.pow(Math.abs(c), e)]
}
