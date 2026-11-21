import * as THREE from 'three'
import { buildSurface, ringLoftFn, squircleR, type RingKey, type Surface, type SurfaceFn, type DisplaceFn } from './geometry'
import { Noise3, bump, smoothstep, mix } from './noise'

export const noise = new Noise3(1337)

// ---------------------------------------------------------------------------------------------
// Torso

export interface TorsoLevel {
  y: number | ((th: number) => number)
  w: number
  d: number
  sq?: number
  z?: number
}

/**
 * Torso shell: for each angle around the body a Catmull-Rom column runs through the levels
 * (hem → chest → shoulder → neck). θ = 0 faces +Z (front), θ = π/2 is +X.
 */
export function torsoFn(levels: TorsoLevel[], opts: { crown?: number; band?: number } = {}): SurfaceFn {
  // opts.band: fraction of v used by a straight band between levels[0] and levels[1] (rib hem)
  const cache = new Map<number, { curve: THREE.CatmullRomCurve3; hem: THREE.Vector3; top: THREE.Vector3 }>()
  const crown = opts.crown ?? 0.01
  const band = opts.band ?? 0
  return (u, v, out) => {
    let c = cache.get(u)
    if (!c) {
      const th = u * Math.PI * 2
      const pts = levels.map((L) => {
        const y = typeof L.y === 'number' ? L.y : L.y(th)
        const r = squircleR(th, L.w, L.d, L.sq ?? 2)
        return new THREE.Vector3(Math.sin(th) * r, y, Math.cos(th) * r + (L.z ?? 0))
      })
      const a = pts[pts.length - 2], b = pts[pts.length - 1]
      const mid = a.clone().lerp(b, 0.45)
      mid.y += crown * Math.pow(Math.abs(Math.sin(th)), 1.5)
      pts.splice(pts.length - 1, 0, mid)
      const hem = pts[0].clone(), top = pts[1].clone()
      const curvePts = band > 0 ? pts.slice(1) : pts
      c = { curve: new THREE.CatmullRomCurve3(curvePts, false, 'centripetal', 0.5), hem, top }
      cache.set(u, c)
    }
    if (band > 0 && v < band) {
      out.copy(c.hem).lerp(c.top, v / band)
    } else {
      c.curve.getPointAt(band > 0 ? (v - band) / (1 - band) : v, out)
    }
  }
}

export const angDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Generic cloth fold field used by most parts. */
export function clothNoise(p: THREE.Vector3, amp: number, scale = 1, seed = 0) {
  const s = scale
  const lo = noise.fbm(p.x * 5 * s + seed, p.y * 3.2 * s, p.z * 5 * s, 3)
  const mid = noise.noise(p.x * 14 * s, p.y * 9 * s + seed, p.z * 14 * s)
  return amp * (lo * 0.75 + mid * 0.35)
}

/** Draping folds hanging vertically, stronger toward a hem. */
export function drapeFolds(p: THREE.Vector3, amp: number, freq: number, seed = 0) {
  const w = noise.noise(p.x * 3 + seed, p.y * 1.2, p.z * 3) * 1.8
  return amp * Math.sin((p.x * 0.8 + p.z * 0.6) * freq + w + seed) * (0.6 + 0.4 * noise.noise(p.x * 9, p.y * 2 + seed, p.z * 9))
}

/** Folds radiating from a point (armpits, crotch, waist cinch). */
export function radialFolds(p: THREE.Vector3, cx: number, cy: number, count: number, reach: number, amp: number, seed = 0) {
  const dx = Math.abs(p.x) - cx, dy = p.y - cy
  const d = Math.hypot(dx, dy)
  const phi = Math.atan2(dy, dx)
  const n = noise.noise(phi * 2 + seed, d * 6, p.z * 4) * 1.6
  const fall = Math.exp(-d / reach) * smoothstep(0.0, 0.03, d)
  return amp * Math.sin(phi * count + n) * fall
}

// ---------------------------------------------------------------------------------------------
// Sleeves

export interface SleeveSpec {
  keys: RingKey[]
  /** t at which the rib cuff starts (1 = no cuff) */
  cuffT?: number
  ribCount?: number
  stack?: number // stacking fold strength near cuff
  twist?: number // elbow twist folds
  hemBand?: number // t where a hem band starts (tees)
  puff?: { pitch: number; amp: number } // puffer baffles along the sleeve
  noiseAmp?: number
  seed?: number
}

export function sleeveSurface(spec: SleeveSpec, side: 1 | -1, nu: number, nv: number): Surface {
  const base = ringLoftFn(spec.keys, new THREE.Vector3(0, 0, 1))
  const fn: SurfaceFn = (u, v, out) => {
    base(u, v, out)
    out.x *= side
  }
  const cuffT = spec.cuffT ?? 1
  const seed = (spec.seed ?? 0) + (side > 0 ? 0 : 17.3)
  const tmp = new THREE.Vector3()
  const displace: DisplaceFn = (p, _n, u, v) => {
    const th = u * Math.PI * 2
    let d = 0
    const t = v
    const ca = Math.cos(th), sa = Math.sin(th)
    if (t > cuffT) {
      // rib cuff
      const rc = spec.ribCount ?? 44
      d += 0.0012 * Math.cos(th * rc)
      d -= 0.0035 * bump(t, cuffT, 0.012) // seam pinch
    } else {
      // stacking folds near the cuff
      const stack = spec.stack ?? 1
      const w = smoothstep(cuffT - 0.26, cuffT - 0.06, t) * (1 - smoothstep(cuffT - 0.02, cuffT, t))
      const ph = noise.noise(ca * 1.1 + seed, sa * 1.1, t * 3) * 2.4
      d += stack * 0.0038 * w * Math.sin(t * 70 + ph * 1.6 + Math.sin(th * 2 + seed) * 0.8)
      // elbow twist folds
      const tw = spec.twist ?? 1
      const we = bump(t, 0.5, 0.18)
      d += tw * 0.0035 * we * Math.sin(t * 42 + th * 1.0 + noise.noise(ca + seed, sa, t * 3) * 2.2) * (0.5 + 0.5 * Math.cos(th - 0.6))
      // armpit compression at the root, on the underside
      const under = Math.max(0, Math.sin(th)) // θ=π/2 faces the armpit for the right sleeve
      d += 0.006 * bump(t, 0.1, 0.09) * under * Math.sin(th * 7 + t * 30 + seed)
      tmp.copy(p)
      d += clothNoise(tmp, spec.noiseAmp ?? 0.004, 1.2, seed)
      if (spec.puff) {
        const f = ((t - 0.06) / spec.puff.pitch) % 1
        const ff = f < 0 ? f + 1 : f
        d += spec.puff.amp * (Math.pow(Math.sin(Math.PI * ff), 0.55) - 0.5)
      }
      if (spec.hemBand && t > spec.hemBand) {
        d -= 0.0025 * bump(t, spec.hemBand, 0.01)
      }
    }
    return d
  }
  return buildSurface(fn, { nu, nv, wrapU: true, displace })
}

/** Helper to make sleeve keys from a few control rings. */
export function ring(t: number, c: [number, number, number], n: [number, number, number], rx: number, ry: number, sq = 2, roll = 0): RingKey {
  return { t, c, n, rx, ry, sq, roll }
}

export { mix, bump, smoothstep }
