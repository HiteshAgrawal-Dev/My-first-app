import * as THREE from 'three'
import { buildSurface, ringLoftFn, projectedPatchFn, curveTube, lathe, alignY, type DisplaceFn } from '../geometry'
import { Kit, type GarmentVariant } from '../kit'
import { torsoFn, sleeveSurface, ring, angDiff, clothNoise, drapeFolds, radialFolds, noise, type TorsoLevel } from '../parts'
import { bump, smoothstep, mix } from '../noise'

const PI = Math.PI

export interface TopBodyOpts {
  W: number // width multiplier
  hemY: number
  bandTop: number | null
  neckFront: number
  neckBack: number
  neckW: number
  neckD: number
  shoulderY: number
  shoulderW: number
  depth: number
  sq: number
  waist?: { y: number; w: number; d?: number }
  blouse?: number
  shoulderSq?: number
  shoulderD?: number
  chest?: number
}

export function topLevels(o: TopBodyOpts): TorsoLevel[] {
  const W = o.W, D = o.depth
  const L: TorsoLevel[] = []
  if (o.bandTop !== null) {
    L.push({ y: o.hemY, w: 0.285 * W, d: 0.145 * D, sq: o.sq - 0.2 })
    L.push({ y: o.bandTop, w: 0.29 * W, d: 0.148 * D, sq: o.sq - 0.2 })
    L.push({ y: o.bandTop + 0.035, w: (0.31 + (o.blouse ?? 0.008)) * W, d: 0.16 * D, sq: o.sq - 0.1 })
  } else {
    L.push({ y: o.hemY, w: 0.31 * W, d: 0.152 * D, sq: o.sq })
    L.push({ y: o.hemY + 0.06, w: 0.312 * W, d: 0.154 * D, sq: o.sq })
  }
  if (o.waist) L.push({ y: o.waist.y, w: o.waist.w * W, d: (o.waist.d ?? 0.15) * D, sq: o.sq })
  else L.push({ y: mix(o.hemY, 0.06, 0.55), w: 0.315 * W, d: 0.158 * D, sq: o.sq })
  L.push({ y: 0.08, w: (o.chest ?? 0.31) * W, d: 0.153 * D, sq: o.sq })
  L.push({ y: (th) => o.shoulderY - 0.03 * Math.cos(th) ** 2, w: o.shoulderW * W, d: (o.shoulderD ?? 0.136) * D, sq: o.shoulderSq ?? o.sq + 0.3 })
  L.push({ y: (th) => mix(o.neckFront, o.neckBack, (1 - Math.cos(th)) / 2), w: o.neckW, d: o.neckD, sq: 2, z: -0.012 })
  return L
}

export function buildHoodie(k: Kit, variant: GarmentVariant) {
  const zip = variant === 'zip'
  const cocoon = variant === 'cocoon'
  const W = cocoon ? 1.07 : 1
  const hemY = cocoon ? -0.39 : -0.4
  const bandTop = hemY + 0.068
  const neckFront = 0.282, neckBack = 0.335

  const levels = topLevels({ W, hemY, bandTop, neckFront, neckBack, neckW: 0.1, neckD: 0.09, shoulderY: 0.218, shoulderW: 0.312, depth: cocoon ? 0.98 : 0.9, sq: 2.8, blouse: cocoon ? 0.02 : 0.008 })
  const nu = k.n(120, 32), nv = k.n(100, 26)
  const bandFrac = 0.1
  const jb = Math.round(bandFrac * nv)
  const tf = torsoFn(levels, { band: jb / nv, crown: 0.012 })

  const torsoDisp: DisplaceFn = (p, _n, u) => {
    const th = u * 2 * PI
    let d = 0
    if (p.y < bandTop + 0.001) {
      d += 0.0011 * Math.cos(th * 64)
      d += 0.0012 * Math.sin(th * 7 + 1.3) * noise.noise(Math.cos(th) * 2, Math.sin(th) * 2, 1)
      return d
    }
    // band seam
    d -= 0.0022 * bump(p.y, bandTop + 0.002, 0.006)
    // side seams (running up over the shoulder to the neck)
    d -= 0.0016 * (bump(angDiff(th, PI / 2), 0, 0.035) + bump(angDiff(th, -PI / 2), 0, 0.035))
    // blousing gathers above the rib band
    d += 0.0035 * bump(p.y, bandTop + 0.025, 0.03) * Math.sin(th * 30 + noise.noise(Math.cos(th) * 3, Math.sin(th) * 3, 0.5) * 3)
    // drape
    d += drapeFolds(p, 0.006 * smoothstep(0.12, -0.25, p.y), 20, 1.7)
    // folds radiating from the armpits
    d += radialFolds(p, 0.285, 0.07, 6, 0.15, 0.008, 0.5) * Math.abs(Math.cos(th))
    d += clothNoise(p, 0.0055, 0.8, 3)
    if (zip) d -= 0.002 * bump(angDiff(th, 0), 0, 0.025)
    return d
  }
  const torso = buildSurface(tf, { nu, nv, wrapU: true, displace: torsoDisp })
  k.items.push({ part: 'body', geometry: torso.geometry(jb, nv), mat: 'fabric', interior: true })
  k.items.push({ part: 'body', geometry: torso.geometry(0, jb), mat: 'rib', interior: true })
  k.rim('body', torso.row(0, nu), 0.0045, { closed: true })
  k.stitch('body', torso.row((jb + 1.2) / nv, nu, 0.0012), { closed: true })
  k.stitch('body', torso.row((jb + 2.6) / nv, nu, 0.0012), { closed: true })
  k.setExplode('body', [0, 0, 0])

  // ---- sleeves
  const keys = [
    ring(0, [0.25, 0.135, 0], [1, 0.0, 0], 0.096, 0.118),
    ring(0.12, [0.336, 0.118, 0.004], [0.86, -0.5, 0], 0.093, 0.104),
    ring(0.36, [0.413, -0.02, 0.012], [0.5, -0.87, 0], 0.086, 0.091),
    ring(0.6, [0.474, -0.17, 0.025], [0.36, -0.93, 0.05], 0.078, 0.082),
    ring(0.82, [0.518, -0.305, 0.038], [0.3, -0.95, 0.08], 0.072, 0.075),
    ring(0.885, [0.529, -0.342, 0.042], [0.28, -0.96, 0.08], 0.064, 0.066),
    ring(0.905, [0.533, -0.356, 0.044], [0.28, -0.96, 0.08], 0.049, 0.051),
    ring(1, [0.552, -0.428, 0.05], [0.26, -0.965, 0.08], 0.045, 0.047),
  ]
  if (cocoon) for (const r of keys) { r.rx *= 1.08; r.ry *= 1.08; r.c[0] *= 1.05 }
  const snu = k.n(48, 16), snv = k.n(72, 20)
  const jc = Math.round(0.9 * snv)
  for (const side of [1, -1] as const) {
    const part = side > 0 ? 'sleeveR' : 'sleeveL'
    const s = sleeveSurface({ keys, cuffT: jc / snv, ribCount: 40, stack: 1.0, twist: 0.8, noiseAmp: 0.0028, seed: 2 }, side, snu, snv)
    k.items.push({ part, geometry: s.geometry(0, jc), mat: 'fabric', interior: true })
    k.items.push({ part, geometry: s.geometry(jc, snv), mat: 'rib', interior: true })
    k.rim(part, s.row(1, snu), 0.0042, { closed: true })
    k.stitch(part, s.row((jc - 1.0) / snv, snu, 0.0012), { closed: true })
    k.setExplode(part, [side * 0.55, -0.05, 0])
  }

  // ---- hood (up, architectural, double layer)
  const hoodKeys = [
    ring(0, [0, 0.452, 0.108], [0, 0.32, -1], 0.104, 0.162, 2.3),
    ring(0.07, [0, 0.46, 0.094], [0, 0.22, -1], 0.126, 0.178, 2.3),
    ring(0.3, [0, 0.47, 0.03], [0, 0.05, -1], 0.148, 0.192, 2.2),
    ring(0.6, [0, 0.462, -0.062], [0, 0.12, -1], 0.146, 0.183, 2.2),
    ring(0.84, [0, 0.438, -0.13], [0, 0.42, -1], 0.112, 0.15, 2.1),
    ring(1, [0, 0.405, -0.168], [0, 0.85, -1], 0.0002, 0.0003, 2),
  ]
  const hfn = ringLoftFn(hoodKeys, new THREE.Vector3(0, 1, 0), (th, t, st) => {
    // bury the lower part of each ring inside the body (neck seam), fading out at the back point
    const size = Math.min(1, st.rx / 0.09)
    const dip = 0.12 * smoothstep(0.02, 0.22, t) * bump(angDiff(th, PI), 0, 0.95) * size
    // let the lower hood flare out and settle onto the shoulders
    const below = Math.max(0, -Math.cos(th))
    const flare = 0.42 * smoothstep(0.1, 0.35, t) * (1 - smoothstep(0.8, 1, t)) * Math.pow(below, 1.6)
    return { dy: -dip, dr: flare }
  })
  const hnu = k.n(64, 20), hnv = k.n(48, 14)
  const hood = buildSurface(hfn, {
    nu: hnu, nv: hnv, wrapU: true,
    displace: (p, _n, u, v) => {
      const th = u * 2 * PI
      let d = -0.0022 * bump(angDiff(th, 0), 0, 0.07) * smoothstep(0.03, 0.1, v)
      d += clothNoise(p, 0.004, 1.3, 9) * smoothstep(0.0, 0.08, v)
      // soft vertical gravity folds on the sides of the hood
      d += 0.003 * Math.sin(p.y * 40 + p.z * 25 + noise.noise(p.x * 6, p.y * 6, p.z * 6) * 2) * Math.abs(Math.sin(th)) * smoothstep(0.1, 0.4, v)
      return d
    },
  })
  k.surface('hood', hood, 'fabric')
  const rimPts = hood.row(0, hnu)
  k.rim('hood', rimPts, 0.0115, { closed: true, radial: 10 })
  k.stitch('hood', hood.row(0.06, hnu, 0.0015), { closed: true })
  // center seam topstitch
  k.stitch('hood', hood.col(0.012, 0.04, 0.97, 40, 0.0013))
  k.stitch('hood', hood.col(1 - 0.012, 0.04, 0.97, 40, 0.0013))
  k.setExplode('hood', [0, 0.32, -0.12])
  k.cavity('body', new THREE.Vector3(0, 0.25, -0.01), 0.1, 0.09)
  k.cavity('body', new THREE.Vector3(0, 0.265, -0.035), 0.15, 0.1)

  // ---- projector for details on the body
  const bodyProj = k.projector(['body'])

  // ---- kangaroo pocket (split in two for the zip version)
  const pocketBottom = bandTop + 0.006, pocketTop = -0.075
  const openY = bandTop + 0.085
  const halfW = (t: number) => {
    const y = mix(pocketBottom, pocketTop, t)
    if (y < openY) return 0.19 * W
    const f = (y - openY) / (pocketTop - openY)
    return mix(0.19 * W, 0.125 * W, Math.pow(f, 0.8))
  }
  const pocketParts = zip ? [[-1, -0.012], [0.012, 1]] : [[-1, 1]]
  for (const [s0, s1] of pocketParts) {
    const pfn = projectedPatchFn(bodyProj, (s, t) => {
      const ss = mix(s0, s1, s)
      const x = ss * halfW(t)
      const y = mix(pocketBottom, pocketTop, t)
      const edgeS = Math.min(1, (1 - Math.abs(ss)) * 8)
      const edgeT = Math.min(1, t * 10, (1 - t) * 10)
      const lift = 0.003 + 0.0045 * Math.sqrt(Math.max(0, Math.min(edgeS, edgeT)))
      // free opening edges stand off the body
      const open = y > openY ? smoothstep(0.6, 1, Math.abs(ss)) * 0.004 : 0
      return { o: new THREE.Vector3(x, y, 0.6), d: new THREE.Vector3(0, 0, -1), off: lift + open }
    })
    const pocket = buildSurface(pfn, {
      nu: k.n(44, 12), nv: k.n(26, 8), orientDir: new THREE.Vector3(0, 0, 1),
      displace: (p) => clothNoise(p, 0.0015, 2, 21) + 0.0012 * Math.sin(p.x * 60 + noise.noise(p.x * 9, p.y * 9, 0) * 2) * smoothstep(-0.1, -0.2, p.y),
    })
    k.surface('pocket', pocket, 'fabric', true)
    // opening edges (rolled) + outline stitching
    const tOpen = (openY - pocketBottom) / (pocketTop - pocketBottom)
    const edgeL: THREE.Vector3[] = [], edgeR: THREE.Vector3[] = []
    const P = new THREE.Vector3(), N = new THREE.Vector3()
    for (let i = 0; i <= 14; i++) {
      const t = mix(tOpen, 1, i / 14)
      if (s0 < -0.5) { pocket.sample(0, t, P, N); edgeL.push(P.clone().addScaledVector(N, -0.001)) }
      if (s1 > 0.5) { pocket.sample(1, t, P, N); edgeR.push(P.clone().addScaledVector(N, -0.001)) }
    }
    if (edgeL.length) k.rim('pocket', edgeL, 0.0032)
    if (edgeR.length) k.rim('pocket', edgeR, 0.0032)
    k.stitch('pocket', pocket.row(0.93, 30, 0.0012))
    k.stitch('pocket', pocket.row(0.045, 30, 0.0012))
    if (s0 < -0.5) k.stitch('pocket', pocket.col(0.025, tOpen - 0.02, 1, 16, 0.0012))
    if (s1 > 0.5) k.stitch('pocket', pocket.col(0.975, tOpen - 0.02, 1, 16, 0.0012))
  }
  k.setExplode('pocket', [0, -0.05, 0.42])

  // ---- drawcords with aglets
  const P = new THREE.Vector3(), N = new THREE.Vector3()
  for (const side of [1, -1]) {
    const uu = (PI - side * 0.42) / (2 * PI)
    const start = hood.sample(uu, 0, new THREE.Vector3(), new THREE.Vector3())
    const pts: THREE.Vector3[] = [start.clone().add(new THREE.Vector3(0, -0.004, 0.008))]
    const len = 0.27
    for (let i = 1; i <= 10; i++) {
      const f = i / 10
      const x = start.x + side * (0.006 * f + 0.004 * Math.sin(f * 5 + side))
      const y = start.y - 0.012 - f * len
      if (bodyProj.cast(new THREE.Vector3(x, y, 0.6), new THREE.Vector3(0, 0, -1), P, N)) {
        pts.push(P.clone().addScaledVector(N, 0.0085 + (y < pocketTop + 0.01 ? 0.006 : 0)))
      }
    }
    const cord = curveTube(pts, 0.0042, { seg: 60, radial: 8 })
    k.geom('cords', cord, 'cord')
    // aglet
    const end = pts[pts.length - 1], prev = pts[pts.length - 2]
    const dir = end.clone().sub(prev).normalize()
    const ag = lathe([[0, 0], [0.0047, 0.001], [0.005, 0.004], [0.005, 0.026], [0.0046, 0.029], [0, 0.03]], 16)
    const m = new THREE.Mesh(ag)
    m.position.copy(end).addScaledVector(dir, -0.006)
    alignY(m, dir)
    m.updateMatrix()
    ag.applyMatrix4(m.matrix)
    k.geom('cords', ag, 'hardware')
    // eyelet
    const ey = new THREE.TorusGeometry(0.0065, 0.0022, 8, 20)
    const em = new THREE.Mesh(ey)
    hood.sample(uu, 0.02, P, N)
    em.position.copy(P).addScaledVector(N, 0.003)
    em.lookAt(P.clone().add(N))
    em.updateMatrix()
    ey.applyMatrix4(em.matrix)
    k.geom('cords', ey, 'hardware')
  }
  k.setExplode('cords', [0, 0.08, 0.5])

  if (zip) addZip(k, bodyProj, bandTop - 0.06, neckFront + 0.012)
}

export function addZip(k: Kit, proj: ReturnType<Kit['projector']>, y0: number, y1: number, part = 'body') {
  const P = new THREE.Vector3(), N = new THREE.Vector3()
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 40; i++) {
    const y = mix(y0, y1, i / 40)
    if (proj.cast(new THREE.Vector3(0, y, 0.6), new THREE.Vector3(0, 0, -1), P, N)) pts.push(P.clone().addScaledVector(N, 0.0015))
  }
  if (pts.length < 4) return
  // tape + teeth
  k.geom(part, curveTube(pts, 0.0036, { seg: 160, radial: 6 }), 'dark')
  const teeth = new THREE.BoxGeometry(0.009, 0.0022, 0.003)
  const curve = new THREE.CatmullRomCurve3(pts)
  const L = curve.getLength()
  const count = Math.floor(L / 0.004)
  const g: THREE.BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const t = i / count
    const p = curve.getPointAt(t)
    const m = new THREE.Matrix4().makeTranslation(p.x + (i % 2 ? 0.0012 : -0.0012), p.y, p.z + 0.0018)
    g.push(teeth.clone().applyMatrix4(m))
  }
  for (const gg of g) k.geom(part, gg, 'hardware', false)
  // slider + pull at the top
  const top = curve.getPointAt(0.985)
  const slider = new THREE.BoxGeometry(0.014, 0.02, 0.007)
  slider.translate(top.x, top.y - 0.01, top.z + 0.004)
  k.geom(part, slider, 'hardware')
  const pull = new THREE.CapsuleGeometry(0.0045, 0.03, 4, 10)
  pull.scale(1, 1, 0.45)
  pull.translate(top.x, top.y - 0.04, top.z + 0.008)
  k.geom(part, pull, 'hardware')
}
