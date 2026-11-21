/**
 * Pure geometry + sizing maths for the virtual try-on.
 * No DOM access in here so it can be unit-checked from node.
 */

export interface Vec {
  x: number
  y: number
}

export interface Landmark {
  x: number
  y: number
  z?: number
  visibility?: number
}

export type GarmentKind = 'top' | 'bottom' | 'corset'

export interface SizeRow {
  size: string
  chest: [number, number]
  height: [number, number]
  shoulder: number
}

/** Mirror of shared/catalog.json → sizeChart (embedded so the module is self-contained). */
export const DEFAULT_SIZE_CHART: SizeRow[] = [
  { size: 'XS', chest: [82, 88], height: [155, 163], shoulder: 40 },
  { size: 'S', chest: [88, 94], height: [160, 168], shoulder: 43 },
  { size: 'M', chest: [94, 100], height: [166, 175], shoulder: 46 },
  { size: 'L', chest: [100, 108], height: [172, 181], shoulder: 49 },
  { size: 'XL', chest: [108, 116], height: [178, 187], shoulder: 52 },
  { size: 'XXL', chest: [116, 126], height: [184, 195], shoulder: 55 },
]

/** MediaPipe pose landmark indices we use. */
export const LM = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
} as const

export function garmentKind(garment: string): GarmentKind {
  const g = garment.toLowerCase()
  if (g === 'cargo' || g === 'trouser' || g === 'pants' || g === 'jeans') return 'bottom'
  if (g === 'corset') return 'corset'
  return 'top'
}

export function isSleeved(garment: string): boolean {
  return garmentKind(garment) === 'top'
}

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const len = (a: Vec): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y

export function normAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

// ---------------------------------------------------------------------------
// One-Euro filter (Casiez et al. 2012) — kills jitter at rest, stays responsive on motion.
// ---------------------------------------------------------------------------

function smoothingFactor(tE: number, cutoff: number): number {
  const r = 2 * Math.PI * cutoff * tE
  return r / (r + 1)
}

export class OneEuroFilter {
  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev = 0
  constructor(
    public minCutoff = 1.2,
    public beta = 6,
    public dCutoff = 1,
  ) {}

  reset(): void {
    this.xPrev = null
    this.dxPrev = 0
  }

  /** @param t seconds */
  filter(x: number, t: number): number {
    if (this.xPrev === null) {
      this.xPrev = x
      this.tPrev = t
      return x
    }
    const tE = Math.max(1e-3, t - this.tPrev)
    const aD = smoothingFactor(tE, this.dCutoff)
    const dx = (x - this.xPrev) / tE
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const a = smoothingFactor(tE, cutoff)
    const xHat = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat
    this.dxPrev = dxHat
    this.tPrev = t
    return xHat
  }
}

/** Smooths a full 33-point landmark set (normalised coords). Resets after tracking gaps. */
export class LandmarkSmoother {
  private fx: OneEuroFilter[] = []
  private fy: OneEuroFilter[] = []
  private fv: number[] = []
  private lastT = -1

  constructor(
    private minCutoff = 1.2,
    private beta = 6,
  ) {}

  reset(): void {
    this.fx = []
    this.fy = []
    this.fv = []
    this.lastT = -1
  }

  smooth(lms: Landmark[], tSec: number): Landmark[] {
    if (this.lastT >= 0 && tSec - this.lastT > 0.5) this.reset()
    this.lastT = tSec
    return lms.map((p, i) => {
      if (!this.fx[i]) {
        this.fx[i] = new OneEuroFilter(this.minCutoff, this.beta)
        this.fy[i] = new OneEuroFilter(this.minCutoff, this.beta)
        this.fv[i] = p.visibility ?? 1
      }
      const v = (this.fv[i] = this.fv[i] * 0.7 + (p.visibility ?? 1) * 0.3)
      return { x: this.fx[i].filter(p.x, tSec), y: this.fy[i].filter(p.y, tSec), z: p.z, visibility: v }
    })
  }
}

// ---------------------------------------------------------------------------
// Garment image analysis (alpha channel scan)
// ---------------------------------------------------------------------------

export interface SleeveInfo {
  /** Image-space pivot (near the shoulder seam) the sleeve rotates around. */
  pivot: Vec
  /** Alpha-mass centroid of the sleeve region. */
  centroid: Vec
  /** Polygon (image px) that encloses the sleeve region. */
  region: Vec[]
  /** Whether the sleeve is separated from the body by transparent pixels (safe to articulate). */
  articulable: boolean
}

export interface GarmentMeta {
  width: number
  height: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
  kind: GarmentKind
  /** Row of the shoulder line (tops) / waistband (bottoms) / neckline (corset). */
  anchorY: number
  /** Horizontal span measured at anchorY (shoulder-to-shoulder / waist width). */
  spanL: number
  spanR: number
  /** Bottom-most opaque row. */
  hemY: number
  sleeves: { left: SleeveInfo | null; right: SleeveInfo | null }
  meanLum: number
  meanColor: [number, number, number]
}

const lumOf = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Opaque runs in row y between x ∈ [xa, xb) — returns [start, endExclusive][] */
function rowRuns(data: ArrayLike<number>, w: number, y: number, xa: number, xb: number, thr: number): [number, number][] {
  const runs: [number, number][] = []
  let start = -1
  const base = y * w * 4 + 3
  for (let x = xa; x < xb; x++) {
    const on = data[base + x * 4] > thr
    if (on && start < 0) start = x
    else if (!on && start >= 0) {
      if (x - start > 1) runs.push([start, x])
      start = -1
    }
  }
  if (start >= 0 && xb - start > 1) runs.push([start, xb])
  return runs
}

/**
 * Scan an RGBA buffer and work out where the garment actually is, where its
 * shoulder line / waistband sits, and how the sleeves can be split off.
 */
export function analyzeGarmentAlpha(
  data: ArrayLike<number>,
  w: number,
  h: number,
  kind: GarmentKind,
  sleeved = kind === 'top',
  thr = 24,
): GarmentMeta {
  const left = new Int32Array(h).fill(-1)
  const right = new Int32Array(h).fill(-1)
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1
  let lumSum = 0,
    rS = 0,
    gS = 0,
    bS = 0,
    wSum = 0
  for (let y = 0; y < h; y++) {
    let l = -1,
      r = -1
    const row = y * w * 4
    for (let x = 0; x < w; x++) {
      const i = row + x * 4
      const a = data[i + 3]
      if (a > thr) {
        if (l < 0) l = x
        r = x
        if ((x & 1) === 0 && (y & 1) === 0) {
          const k = a / 255
          lumSum += lumOf(data[i], data[i + 1], data[i + 2]) * k
          rS += data[i] * k
          gS += data[i + 1] * k
          bS += data[i + 2] * k
          wSum += k
        }
      }
    }
    if (l >= 0) {
      left[y] = l
      right[y] = r
      if (l < x0) x0 = l
      if (r > x1) x1 = r
      if (y < y0) y0 = y
      y1 = y
    }
  }
  if (x1 < 0) {
    // Fully transparent — treat the whole frame as the garment.
    x0 = 0
    y0 = 0
    x1 = w - 1
    y1 = h - 1
    for (let y = 0; y < h; y++) {
      left[y] = 0
      right[y] = w - 1
    }
  }
  const bh = Math.max(1, y1 - y0)
  const widthAt = (y: number) => (left[y] >= 0 ? right[y] - left[y] : 0)
  const meanLum = wSum > 0 ? lumSum / wSum : 0.5
  const meanColor: [number, number, number] = wSum > 0 ? [rS / wSum, gS / wSum, bS / wSum] : [128, 128, 128]

  let anchorY = y0
  if (kind === 'top') {
    const ref: number[] = []
    for (let y = Math.round(y0 + 0.35 * bh); y <= Math.round(y0 + 0.6 * bh); y++) ref.push(widthAt(y))
    const refW = median(ref)
    let sy = y0
    for (let y = y0; y < y0 + 0.5 * bh; y++) {
      if (widthAt(y) >= 0.72 * refW) {
        sy = y
        break
      }
    }
    anchorY = Math.min(y1, Math.round(sy + 0.025 * bh))
  } else if (kind === 'corset') {
    anchorY = Math.min(y1, Math.round(y0 + 0.04 * bh))
  } else {
    anchorY = Math.min(y1, Math.round(y0 + 0.02 * bh))
  }
  // Use the median extent of a few rows around the anchor for stability.
  const ls: number[] = [],
    rs: number[] = []
  for (let y = Math.max(y0, anchorY - 3); y <= Math.min(y1, anchorY + 3); y++) {
    if (left[y] >= 0) {
      ls.push(left[y])
      rs.push(right[y])
    }
  }
  const spanL = ls.length ? median(ls) : x0
  const spanR = rs.length ? median(rs) : x1
  const sw = Math.max(1, spanR - spanL)

  const sleeves: GarmentMeta['sleeves'] = { left: null, right: null }
  if (sleeved && kind === 'top') {
    const midX = Math.round((spanL + spanR) / 2)
    for (const side of ['left', 'right'] as const) {
      const dir = side === 'left' ? 1 : -1 // +1: scanning inward goes to +x
      const edge = side === 'left' ? spanL : spanR
      const cutX = edge + dir * 0.1 * sw
      const topY = Math.max(y0, Math.round(anchorY - 0.06 * bh))
      const step = Math.max(1, Math.round(bh / 80))
      const boundary: Vec[] = []
      let gapSeen = false
      let prevB = cutX
      let mass = 0,
        cx = 0,
        cy = 0
      for (let y = anchorY; y <= y1; y += step) {
        const runs = side === 'left' ? rowRuns(data, w, y, 0, midX, thr) : rowRuns(data, w, y, midX, w, thr).reverse()
        // For the right side, normalise runs so that runs[0] is the outermost.
        let b = prevB
        if (runs.length >= 2) {
          const outer = runs[0],
            inner = runs[1]
          b = side === 'left' ? (outer[1] + inner[0]) / 2 : (inner[1] + outer[0]) / 2
          gapSeen = true
        } else if (runs.length === 1) {
          const run = runs[0]
          const runOuter = side === 'left' ? run[0] : run[1]
          if (!gapSeen) b = cutX
          else if (side === 'left' ? runOuter < prevB - 2 : runOuter > prevB + 2) b = prevB
          else b = side === 'left' ? run[0] - 1 : run[1] + 1
        }
        prevB = b
        boundary.push({ x: b, y })
        // sleeve alpha mass (outer side of boundary)
        const xa = side === 'left' ? 0 : Math.max(0, Math.ceil(b))
        const xb = side === 'left' ? Math.min(w, Math.floor(b)) : w
        for (let x = xa; x < xb; x += 2) {
          const a = data[(y * w + x) * 4 + 3]
          if (a > thr) {
            mass += a
            cx += x * a
            cy += y * a
          }
        }
      }
      if (mass <= 0) continue
      const centroid = { x: cx / mass, y: cy / mass }
      const outerX = side === 'left' ? -2 : w + 2
      const region: Vec[] = [
        { x: outerX, y: topY },
        { x: cutX, y: topY },
        ...boundary,
        { x: outerX, y: y1 + 2 },
      ]
      const pivot = { x: cutX, y: anchorY + 0.06 * sw }
      // A sleeve is only worth articulating if it's clearly outside the body and has real mass.
      const totalMass = wSum * 255 * 4 // approximate (sampled every 2px both axes)
      const relMass = (mass * 2 * step) / Math.max(1, totalMass)
      sleeves[side] = { pivot, centroid, region, articulable: gapSeen && relMass > 0.01 }
    }
  }

  return {
    width: w,
    height: h,
    bbox: { x0, y0, x1, y1 },
    kind,
    anchorY,
    spanL,
    spanR,
    hemY: y1,
    sleeves,
    meanLum,
    meanColor,
  }
}

// ---------------------------------------------------------------------------
// Garment → body fit
// ---------------------------------------------------------------------------

/** Garment shoulder width relative to the landmark shoulder (joint) distance. */
export function fitFactor(fit: string, garment: string): number {
  const f = fit.toLowerCase()
  let k = 1.4
  if (f.includes('fitted') || f.includes('slim')) k = 1.34
  else if (f.includes('sculpt')) k = 1.3
  else if (f.includes('regular')) k = 1.38
  else if (f.includes('relaxed')) k = 1.42
  else if (f.includes('crop')) k = 1.44
  else if (f.includes('boxy')) k = 1.46
  else if (f.includes('oversize')) k = 1.5
  if (garment === 'puffer') k += 0.04
  return k
}

/** Where the hem falls, as a fraction of the shoulder→hip landmark distance. */
export function hemRatio(garment: string, fit: string): number {
  const f = fit.toLowerCase()
  let r = 1.1
  if (garment === 'tee') r = 1.04
  else if (garment === 'hoodie') r = 1.12
  else if (garment === 'puffer') r = 1.02
  else if (garment === 'blazer') r = 1.3
  else if (garment === 'corset') r = 0.98
  if (f.includes('crop')) r *= 0.82
  if (f.includes('oversize')) r += 0.05
  return r
}

export interface Affine {
  /** image-space point that is pinned to anchorScreen */
  anchorImg: Vec
  anchorScreen: Vec
  angle: number
  sx: number
  sy: number
}

export interface SleeveFit {
  info: SleeveInfo
  pivotScreen: Vec
  /** extra rotation (radians, screen space) applied around pivotScreen */
  delta: number
}

export interface GarmentFit extends Affine {
  sleeves: { left: SleeveFit | null; right: SleeveFit | null }
}

/** Matrix [a,b,c,d,e,f] for CanvasRenderingContext2D.setTransform. */
export function affineMatrix(t: Affine): [number, number, number, number, number, number] {
  const c = Math.cos(t.angle),
    s = Math.sin(t.angle)
  const a = c * t.sx,
    b = s * t.sx,
    cc = -s * t.sy,
    d = c * t.sy
  const e = t.anchorScreen.x - (a * t.anchorImg.x + cc * t.anchorImg.y)
  const f = t.anchorScreen.y - (b * t.anchorImg.x + d * t.anchorImg.y)
  return [a, b, cc, d, e, f]
}

export function applyMatrix(m: [number, number, number, number, number, number], p: Vec): Vec {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}

/** Rotate matrix m about screen point p by angle. */
export function rotateAbout(
  m: [number, number, number, number, number, number],
  p: Vec,
  angle: number,
): [number, number, number, number, number, number] {
  const c = Math.cos(angle),
    s = Math.sin(angle)
  // R = T(p) * Rot * T(-p);  result = R * m
  const r: [number, number, number, number, number, number] = [c, s, -s, c, p.x - c * p.x + s * p.y, p.y - s * p.x - c * p.y]
  return [
    r[0] * m[0] + r[2] * m[1],
    r[1] * m[0] + r[3] * m[1],
    r[0] * m[2] + r[2] * m[3],
    r[1] * m[2] + r[3] * m[3],
    r[0] * m[4] + r[2] * m[5] + r[4],
    r[1] * m[4] + r[3] * m[5] + r[5],
  ]
}

/** Screen-space body points; "left" = smaller screen x (works mirrored or not). */
export interface BodyPoints {
  ls: Vec
  rs: Vec
  lh?: Vec
  rh?: Vec
  le?: Vec
  re?: Vec
  lk?: Vec
  rk?: Vec
  la?: Vec
  ra?: Vec
}

export interface FitOptions {
  garment: string
  fit: string
  /** Max sleeve articulation (degrees). */
  maxSleeveDeg?: number
  articulate?: boolean
}

/** Upper body: shoulders + hips (+ elbows for sleeves). */
export function computeTopFit(p: BodyPoints, meta: GarmentMeta, opts: FitOptions): GarmentFit {
  const v = sub(p.rs, p.ls)
  const sd = Math.max(1, len(v))
  const angle = Math.atan2(v.y, v.x)
  const down: Vec = { x: -v.y / sd, y: v.x / sd }
  const sMid = mid(p.ls, p.rs)
  let torso = sd * 1.4
  if (p.lh && p.rh) {
    const hMid = mid(p.lh, p.rh)
    const t = dot(sub(hMid, sMid), down)
    if (t > sd * 0.6) torso = t
  }

  const imgSpan = Math.max(1, meta.spanR - meta.spanL)
  const isCorset = meta.kind === 'corset'
  const sx = isCorset ? (sd * 1.05) / imgSpan : (sd * fitFactor(opts.fit, opts.garment)) / imgSpan

  // Collar / shoulder seam sits slightly above the shoulder joints.
  const lift = isCorset ? -torso * 0.24 : sd * 0.13
  const anchorScreen = sub(sMid, mul(down, lift))
  const anchorImg = { x: (meta.spanL + meta.spanR) / 2, y: meta.anchorY }

  const imgLen = Math.max(1, meta.hemY - meta.anchorY)
  const wantLen = torso * hemRatio(opts.garment, opts.fit) + (isCorset ? -torso * 0.24 : lift)
  const sy = clamp(wantLen / imgLen, sx * 0.88, sx * 1.18)

  const fit: GarmentFit = { anchorImg, anchorScreen, angle, sx, sy, sleeves: { left: null, right: null } }
  if (opts.articulate !== false && meta.kind === 'top') {
    const m = affineMatrix(fit)
    const maxD = ((opts.maxSleeveDeg ?? 55) * Math.PI) / 180
    for (const side of ['left', 'right'] as const) {
      const info = meta.sleeves[side]
      const elbow = side === 'left' ? p.le : p.re
      const shoulder = side === 'left' ? p.ls : p.rs
      if (!info || !info.articulable || !elbow) continue
      const pivotScreen = applyMatrix(m, info.pivot)
      const cScreen = applyMatrix(m, info.centroid)
      const rest = Math.atan2(cScreen.y - pivotScreen.y, cScreen.x - pivotScreen.x)
      const arm = Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x)
      let delta = normAngle(arm - rest)
      if (Math.abs(delta) < (7 * Math.PI) / 180) delta = 0
      delta = clamp(delta, -maxD, maxD)
      fit.sleeves[side] = { info, pivotScreen, delta }
    }
  }
  return fit
}

/** Lower body: hips + ankles (falls back to knees / proportions). */
export function computeBottomFit(p: BodyPoints, meta: GarmentMeta, opts: FitOptions): GarmentFit {
  const lh = p.lh ?? p.ls
  const rh = p.rh ?? p.rs
  const v = sub(rh, lh)
  const hd = Math.max(1, len(v))
  const hMid = mid(lh, rh)
  let legLen: number
  let axis: Vec
  if (p.la && p.ra) {
    const aMid = mid(p.la, p.ra)
    legLen = dist(hMid, aMid)
    axis = sub(aMid, hMid)
  } else if (p.lk && p.rk) {
    const kMid = mid(p.lk, p.rk)
    legLen = dist(hMid, kMid) * 2.05
    axis = sub(kMid, hMid)
  } else {
    legLen = hd * 4.4
    axis = { x: -v.y, y: v.x }
  }
  const al = Math.max(1, len(axis))
  const down: Vec = { x: axis.x / al, y: axis.y / al }
  // Rotation: blend of hip line and leg axis.
  const angleAxis = Math.atan2(down.y, down.x) - Math.PI / 2
  const angleHip = Math.atan2(v.y, v.x)
  const angle = normAngle(angleHip + normAngle(angleAxis - angleHip) * 0.5)

  const relaxed = /relaxed|oversize|baggy|wide/i.test(opts.fit) ? 1.08 : 1
  const imgSpan = Math.max(1, meta.spanR - meta.spanL)
  const sx = (hd * 1.68 * relaxed) / imgSpan
  const lift = hd * 0.34
  const anchorScreen = sub(hMid, mul(down, lift))
  const anchorImg = { x: (meta.spanL + meta.spanR) / 2, y: meta.anchorY }
  const imgLen = Math.max(1, meta.hemY - meta.anchorY)
  const wantLen = lift + legLen * 1.04
  const sy = clamp(wantLen / imgLen, sx * 0.8, sx * 1.3)
  return { anchorImg, anchorScreen, angle, sx, sy, sleeves: { left: null, right: null } }
}

// ---------------------------------------------------------------------------
// Body measurement + size recommendation
// ---------------------------------------------------------------------------

/** Proportions of stature (Drillis & Contini / NASA anthropometry, rounded). */
export const NOSE_TO_ANKLE_RATIO = 0.87
export const SHOULDER_TO_HIP_RATIO = 0.29
/** Joint-centre shoulder distance → garment shoulder measurement. */
export const SHOULDER_CAL = 1.25
/** Shoulder–hip joint distance → torso (seam-to-hip) length. */
export const TORSO_CAL = 1.2

export interface BodyEstimate {
  shoulderCm: number
  torsoCm: number
  cmPerPx: number
  basis: 'full-body' | 'torso'
}

/**
 * @param px landmarks in real pixel units (not normalised) — x and y on the same scale.
 * @param vis visibility threshold
 */
export function estimateBody(px: Landmark[], heightCm: number, vis = 0.5): BodyEstimate | null {
  const ok = (i: number) => !!px[i] && (px[i].visibility ?? 1) >= vis
  if (!ok(LM.lShoulder) || !ok(LM.rShoulder)) return null
  const shoulderPx = dist(px[LM.lShoulder], px[LM.rShoulder])
  const sMid = mid(px[LM.lShoulder], px[LM.rShoulder])
  const hipsOk = ok(LM.lHip) && ok(LM.rHip)
  const torsoPx = hipsOk ? dist(sMid, mid(px[LM.lHip], px[LM.rHip])) : 0
  let cmPerPx = 0
  let basis: BodyEstimate['basis'] = 'torso'
  const ankles = [LM.lAnkle, LM.rAnkle].filter(ok)
  if (ok(LM.nose) && ankles.length) {
    const aMid =
      ankles.length === 2 ? mid(px[LM.lAnkle], px[LM.rAnkle]) : { x: px[ankles[0]].x, y: px[ankles[0]].y }
    const d = dist(px[LM.nose], aMid)
    if (d > shoulderPx * 2.5) {
      cmPerPx = (heightCm * NOSE_TO_ANKLE_RATIO) / d
      basis = 'full-body'
    }
  }
  if (!cmPerPx) {
    if (!torsoPx) return null
    cmPerPx = (heightCm * SHOULDER_TO_HIP_RATIO) / torsoPx
  }
  const torsoCm = (torsoPx || shoulderPx * 1.4) * cmPerPx * TORSO_CAL
  return { shoulderCm: shoulderPx * cmPerPx * SHOULDER_CAL, torsoCm, cmPerPx, basis }
}

/** Typical garment-shoulder (cm) for a given stature and build (0 slim … 1 athletic … 2 broad). */
export function shoulderFromStature(heightCm: number, build = 1): number {
  return heightCm * 0.263 * (0.92 + 0.08 * build)
}

export interface SizeRecommendation {
  size: string
  match: number
  basis: 'shoulder+height' | 'height'
}

const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma))

export function recommendSize(
  shoulderCm: number | null,
  heightCm: number,
  chart: SizeRow[] = DEFAULT_SIZE_CHART,
  available?: string[],
  confidence = 1,
): SizeRecommendation {
  const rows = available?.length ? chart.filter((r) => available.includes(r.size)) : chart
  const use = rows.length ? rows : chart
  let best = use[0]
  let bestScore = -1
  for (const r of use) {
    const [hLo, hHi] = r.height
    const hd = heightCm < hLo ? hLo - heightCm : heightCm > hHi ? heightCm - hHi : 0
    const hs = gauss(hd, 4)
    const score = shoulderCm != null ? 0.68 * gauss(shoulderCm - r.shoulder, 2.4) + 0.32 * hs : hs
    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }
  const conf = clamp(confidence, 0, 1)
  const base = shoulderCm != null ? 58 + 40 * bestScore : 52 + 30 * bestScore
  const match = Math.round(clamp(base * (0.75 + 0.25 * conf), 40, 99))
  return { size: best.size, match, basis: shoulderCm != null ? 'shoulder+height' : 'height' }
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return [128, 128, 128]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/**
 * Re-colour a garment while keeping its folds: luminance relative to the garment's mean
 * drives a multiply for shadows and a soft roll-off toward white for highlights.
 * Writes into dst (may equal src). Alpha is preserved.
 */
export function tintPixels(src: ArrayLike<number>, dst: Uint8ClampedArray, hex: string, meanLum: number): void {
  const [tr, tg, tb] = hexToRgb(hex).map((c) => c / 255)
  const tl = lumOf(tr * 255, tg * 255, tb * 255)
  const ml = Math.max(0.04, meanLum)
  const hl = 0.22 + 0.3 * (1 - tl) // dark colourways get more visible sheen so folds still read
  const floor = 0.18 + 0.25 * (1 - tl)
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]
    dst[i + 3] = a
    if (a === 0) continue
    const l = lumOf(src[i], src[i + 1], src[i + 2])
    const s = clamp(l / ml, 0, 2.6)
    let r: number, g: number, b: number
    if (s <= 1) {
      const k = floor + (1 - floor) * Math.pow(s, 1.15)
      r = tr * k
      g = tg * k
      b = tb * k
    } else {
      const k = Math.min(1, (s - 1) * 0.9) * hl
      r = tr + (1 - tr) * k
      g = tg + (1 - tg) * k
      b = tb + (1 - tb) * k
    }
    dst[i] = r * 255
    dst[i + 1] = g * 255
    dst[i + 2] = b * 255
  }
}
