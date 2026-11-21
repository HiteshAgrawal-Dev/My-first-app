import * as THREE from 'three'
import { buildSurface, projectedPatchFn, curveTube, lathe, interpRing, Projector, type DisplaceFn, type SurfaceFn } from '../geometry'
import { Kit, type GarmentVariant } from '../kit'
import { torsoFn, sleeveSurface, ring, angDiff, clothNoise, drapeFolds, radialFolds, noise, type TorsoLevel } from '../parts'
import { bump, smoothstep, mix } from '../noise'

const PI = Math.PI

function button(r: number, h: number) {
  // domed horn button with a rim and a dished centre
  return lathe([[0, h * 0.55], [r * 0.45, h * 0.6], [r * 0.7, h * 0.85], [r * 0.92, h], [r, h * 0.7], [r * 0.98, 0.0], [0, 0]], 28)
}

export function buildBlazer(k: Kit, _variant: GarmentVariant, corset: boolean) {
  const hemY = corset ? -0.33 : -0.44
  const neckF = 0.255, neckB = 0.325, neckW = 0.086, neckD = 0.08, zc = -0.014
  const yB = corset ? 0.0 : -0.1 // top button / end of the V
  const waistY = corset ? -0.11 : -0.12
  const levels: TorsoLevel[] = corset
    ? [
        { y: hemY, w: 0.305, d: 0.175, sq: 2.6 },
        { y: hemY + 0.06, w: 0.27, d: 0.15, sq: 2.6 },
        { y: -0.19, w: 0.225, d: 0.13, sq: 2.5 },
        { y: waistY, w: 0.205, d: 0.122, sq: 2.5 },
        { y: -0.02, w: 0.228, d: 0.135, sq: 2.6 },
        { y: 0.09, w: 0.262, d: 0.142, sq: 2.8 },
        { y: (th) => 0.235 - 0.03 * Math.cos(th) ** 2, w: 0.272, d: 0.12, sq: 3.6 },
        { y: (th) => mix(neckF, neckB, (1 - Math.cos(th)) / 2), w: neckW, d: neckD, sq: 2, z: zc },
      ]
    : [
        { y: hemY, w: 0.29, d: 0.158, sq: 2.7 },
        { y: hemY + 0.08, w: 0.285, d: 0.152, sq: 2.7 },
        { y: waistY, w: 0.268, d: 0.142, sq: 2.7 },
        { y: 0.06, w: 0.282, d: 0.148, sq: 2.8 },
        { y: (th) => 0.242 - 0.032 * Math.cos(th) ** 2, w: 0.292, d: 0.125, sq: 4.0 },
        { y: (th) => mix(neckF, neckB, (1 - Math.cos(th)) / 2), w: neckW, d: neckD, sq: 2, z: zc },
      ]
  const corsetTop = (th: number) => 0.035 - 0.022 * Math.cos(th) // sweetheart: dips at centre front
  const corsetBot = (_th: number) => -0.21
  const inCorset = (p: THREE.Vector3, th: number) => (corset ? smoothstep(corsetBot(th) - 0.004, corsetBot(th) + 0.004, p.y) * (1 - smoothstep(corsetTop(th) - 0.004, corsetTop(th) + 0.004, p.y)) : 0)
  const boneTh = [0.0, 0.32, 0.72, 1.18, 1.62, 2.1, 2.6, PI]

  // V opening: roll line from the top button to the neck point
  const N = { x: 0.083, y: 0.268 }
  const xV = (y: number) => (y <= yB ? 0 : ((y - yB) / (N.y - yB)) * N.x + 0.004)
  const keep = (p: THREE.Vector3) => {
    if (p.z < 0.0) return true
    if (p.y > yB && Math.abs(p.x) < xV(p.y)) return false
    // curved cutaway at the hem
    const cut = hemY + 0.07
    if (!corset && p.y < cut) {
      const f = (cut - p.y) / 0.07
      if (Math.abs(p.x) < 0.075 * Math.pow(f, 1.6)) return false
    }
    return true
  }

  const nu = k.n(120, 32), nv = k.n(96, 26)
  const disp: DisplaceFn = (p, _n, u) => {
    const th = u * 2 * PI
    let d = 0
    d -= 0.0014 * (bump(angDiff(th, PI / 2 + 0.25), 0, 0.03) + bump(angDiff(th, -PI / 2 - 0.25), 0, 0.03)) // side-back seams
    d -= 0.0012 * bump(angDiff(th, PI), 0, 0.025) // centre back seam
    d += clothNoise(p, corset ? 0.0022 : 0.003, 1, 13)
    // waist suppression pulls
    d += radialFolds(p, 0.24, waistY, 4, 0.1, 0.002, 2)
    if (corset) {
      const c = inCorset(p, th)
      d += 0.0022 * c
      for (const b of boneTh) {
        d += 0.0016 * c * (bump(angDiff(th, b), 0, 0.018) + bump(angDiff(th, -b), 0, 0.018))
      }
      d -= 0.0035 * c * bump(angDiff(th, 0), 0, 0.03) // lacing gap
      // peplum flare folds
      d += drapeFolds(p, 0.007 * smoothstep(-0.22, hemY, p.y), 26, 3)
      // pulled creases above/below the cinch
      d += 0.0018 * (1 - c) * Math.sin(th * 18 + noise.noise(p.x * 9, p.y * 9, 1) * 2) * bump(p.y, waistY + 0.16, 0.04)
    } else {
      d += drapeFolds(p, 0.003 * smoothstep(-0.1, hemY, p.y), 14, 3)
      // front dart
      d -= 0.0011 * (bump(angDiff(th, 0.62), 0, 0.02) + bump(angDiff(th, -0.62), 0, 0.02)) * bump(p.y, -0.08, 0.14)
    }
    return d
  }
  const tf = torsoFn(levels, { crown: 0.006 })
  const torso = buildSurface(tf, { nu, nv, wrapU: true, displace: disp, keep })
  // projector on the un-cut torso so lapels/lacing can be placed over the opening edges
  const km = torso.keepMask
  torso.keepMask = null
  const fullGeo = torso.geometry()
  torso.keepMask = km
  const proj = new Projector(fullGeo)
  k.surface('body', torso, 'fabric')
  k.setExplode('body', [0, 0, 0])

  // front edges (rolled), from hem cutaway up to the neck point
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = []
    const P = new THREE.Vector3(), Nn = new THREE.Vector3()
    const ys: number[] = []
    for (let i = 0; i <= 30; i++) ys.push(mix(hemY + 0.002, N.y - 0.004, i / 30))
    for (const y of ys) {
      let x = xV(y)
      if (!corset && y < hemY + 0.07) x = Math.max(x, 0.075 * Math.pow((hemY + 0.07 - y) / 0.07, 1.6))
      x = Math.max(x, 0.004) * s
      if (proj.cast(new THREE.Vector3(x, y, 0.6), new THREE.Vector3(0, 0, -1), P, Nn)) pts.push(P.clone().addScaledVector(Nn, -0.002))
    }
    if (pts.length > 3) k.rim('body', pts, 0.0042)
  }
  // hem rim + stitches
  k.rim('body', torso.row(0, nu).filter((p) => keep(p)), 0.004)
  k.stitch('body', Kit.ringAt(proj, () => hemY + 0.03, 0.0011, 0.75, 2 * PI - 0.75, 100))

  // ---- lapels
  const lapelTip = corset ? { x: 0.165, y: 0.2 } : { x: 0.178, y: 0.19 }
  for (const s of [1, -1]) {
    const part = 'lapels'
    const I = (t: number) => ({ x: s * (0.004 + xV(mix(yB, N.y, t)) - 0.004), y: mix(yB, N.y, t) })
    const O = (t: number) => {
      const w = Math.pow(t, 0.72)
      return { x: s * mix(0.006, lapelTip.x, w), y: mix(yB - 0.004, lapelTip.y, t) }
    }
    const fn: SurfaceFn = projectedPatchFn(proj, (a, t) => {
      const i = I(t), o = O(t)
      const x = mix(i.x, o.x, a), y = mix(i.y, o.y, a)
      const off = 0.005 + 0.006 * Math.pow(1 - a, 2) * smoothstep(0, 0.3, t) + 0.0015 * Math.sin(PI * a)
      return { o: new THREE.Vector3(x, y, 0.6), d: new THREE.Vector3(0, 0, -1), off }
    })
    const lap = buildSurface(fn, { nu: k.n(16, 6), nv: k.n(40, 12), orientDir: new THREE.Vector3(0, 0, 1), displace: (p) => clothNoise(p, 0.001, 3, 31) })
    k.surface(part, lap, 'trim', true)
    // edges
    k.rim(part, lap.col(1, 0, 1, 30, -0.0005), 0.0028)
    k.rim(part, lap.row(1, 16, -0.0005), 0.0028)
    k.rim(part, lap.col(0, 0, 1, 30, -0.001), 0.0055)
    k.stitch(part, lap.col(0.88, 0.02, 0.97, 30, 0.0012))
    k.setExplode(part, [0, 0.02, 0.3])
  }

  // ---- collar around the back of the neck
  const thN = 1.15
  const collarFn: SurfaceFn = (u, v, out) => {
    const th = mix(thN, 2 * PI - thN, u)
    const y0 = mix(neckF, neckB, (1 - Math.cos(th)) / 2)
    const q = new THREE.Vector3(Math.sin(th) * (neckW + 0.004), y0, Math.cos(th) * (neckD + 0.004) + zc)
    const o = new THREE.Vector3(Math.sin(th), 0, Math.cos(th))
    const standH = 0.03 * (0.6 + 0.4 * Math.abs(Math.cos(th / 2 - PI / 2) ) )
    if (v < 0.35) {
      const f = v / 0.35
      out.copy(q).addScaledVector(o, 0.003 * f)
      out.y += standH * f
    } else {
      const w = (v - 0.35) / 0.65
      const front = smoothstep(2.2, thN, Math.min(th, 2 * PI - th)) // near the lapels the fall widens
      out.copy(q).addScaledVector(o, 0.006 + (0.042 + 0.02 * front) * Math.sin(w * PI * 0.5))
      out.y += standH + 0.004 - (0.04 + 0.01 * front) * Math.pow(w, 1.25)
    }
  }
  const collar = buildSurface(collarFn, { nu: k.n(60, 16), nv: k.n(14, 6), orientDir: new THREE.Vector3(0, 0.3, -1), displace: (p) => clothNoise(p, 0.0008, 3, 41) })
  k.surface('collar', collar, 'trim', true)
  k.rim('collar', collar.row(1, 60), 0.0028)
  k.rim('collar', collar.row(0.36, 60), 0.0035)
  k.stitch('collar', collar.row(0.88, 60, 0.0012))
  k.setExplode('collar', [0, 0.16, -0.1])
  k.cavity('body', new THREE.Vector3(0, 0.22, zc - 0.01), neckW * 0.95, neckD * 0.95)

  // ---- buttons
  const btnG: { y: number; r: number }[] = corset ? [] : [{ y: yB - 0.012, r: 0.0115 }, { y: yB - 0.15, r: 0.0115 }]
  const P = new THREE.Vector3(), Nn = new THREE.Vector3()
  for (const b of btnG) {
    if (!proj.cast(new THREE.Vector3(-0.004, b.y, 0.6), new THREE.Vector3(0, 0, -1), P, Nn)) continue
    const g = button(b.r, 0.0045)
    const m = new THREE.Object3D()
    m.position.copy(P).addScaledVector(Nn, 0.0015)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Nn)
    m.updateMatrix()
    g.applyMatrix4(m.matrix)
    k.geom('buttons', g, 'accent')
  }
  k.setExplode('buttons', [0, 0, 0.45])

  // ---- pocket flaps + chest welt
  const flap = (cx: number, cy: number, w: number, h: number, part: string, welt = false) => {
    const fn = projectedPatchFn(proj, (a, t) => {
      const x = cx + (a - 0.5) * w
      const y = cy + (t - 0.5) * h + (welt ? (a - 0.5) * 0.012 * Math.sign(cx) : 0)
      return { o: new THREE.Vector3(x, y, 0.6), d: new THREE.Vector3(0, 0, -1), off: 0.0028 + 0.002 * Math.sin(PI * a) * (1 - t) }
    })
    const f = buildSurface(fn, { nu: k.n(24, 8), nv: k.n(8, 4), orientDir: new THREE.Vector3(0, 0, 1) })
    k.surface(part, f, 'trim', false)
    k.rim(part, f.row(0, 24, -0.0004), 0.0026)
    k.rim(part, f.col(0, 0, 1, 6, -0.0004), 0.002)
    k.rim(part, f.col(1, 0, 1, 6, -0.0004), 0.002)
    k.stitch(part, f.row(welt ? 0.5 : 0.82, 24, 0.0011))
  }
  if (corset) {
    flap(0.17, -0.26, 0.11, 0.035, 'pockets')
    flap(-0.17, -0.26, 0.11, 0.035, 'pockets')
  } else {
    flap(0.165, -0.255, 0.15, 0.052, 'pockets')
    flap(-0.165, -0.255, 0.15, 0.052, 'pockets')
    flap(0.158, 0.1, 0.1, 0.022, 'pockets', true)
  }
  k.setExplode('pockets', [0, -0.03, 0.35])

  // ---- sleeves: structured, roped sleeve head
  const keys = corset
    ? [
        ring(0, [0.225, 0.155, 0], [1, 0.08, 0], 0.08, 0.095),
        ring(0.1, [0.282, 0.135, 0.004], [0.62, -0.78, 0], 0.074, 0.084),
        ring(0.5, [0.33, -0.1, 0.03], [0.2, -0.98, 0.1], 0.06, 0.064),
        ring(1, [0.36, -0.4, 0.07], [0.12, -0.99, 0.12], 0.05, 0.054),
      ]
    : [
        ring(0, [0.245, 0.16, 0], [1, 0.1, 0], 0.088, 0.1),
        ring(0.1, [0.31, 0.138, 0.004], [0.6, -0.8, 0], 0.08, 0.09),
        ring(0.5, [0.36, -0.11, 0.03], [0.2, -0.98, 0.08], 0.068, 0.072),
        ring(1, [0.39, -0.43, 0.065], [0.12, -0.99, 0.12], 0.057, 0.061),
      ]
  const snu = k.n(44, 14), snv = k.n(64, 18)
  for (const side of [1, -1] as const) {
    const part = side > 0 ? 'sleeveR' : 'sleeveL'
    const s = sleeveSurface({ keys, stack: 0.35, twist: 0.7, noiseAmp: 0.0018, seed: 8 }, side, snu, snv)
    k.surface(part, s, 'fabric')
    k.rim(part, s.row(1, snu), 0.0035)
    k.stitch(part, s.row(0.94, snu, 0.001), { closed: true })
    // sleeve buttons on the back of the cuff
    for (let i = 0; i < 3; i++) {
      const st = interpRing(keys, 0.9 - i * 0.03)
      const back = new THREE.Vector3(0, 0, -1)
      const A = back.clone().addScaledVector(st.n, -back.dot(st.n)).normalize()
      const c = st.c.clone().addScaledVector(A, st.ry * 0.98)
      c.x *= side
      const n = A.clone()
      n.x *= side
      const g = button(0.0065, 0.003)
      const m = new THREE.Object3D()
      m.position.copy(c)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
      m.updateMatrix()
      g.applyMatrix4(m.matrix)
      k.geom(part, g, 'accent')
    }
    k.setExplode(part, [side * 0.45, -0.04, 0])
  }

  // ---- corset: boning channels, seams, front lacing
  if (corset) {
    const P2 = new THREE.Vector3(), N2 = new THREE.Vector3()
    for (const y of [corsetBot(0)]) k.stitch('body', Kit.ringAt(proj, () => y, 0.0024, 0, 2 * PI, 140), { closed: true })
    k.rim('body', Kit.ringAt(proj, corsetTop, 0.0022, 0.06, 2 * PI - 0.06, 140), 0.0022)
    k.rim('body', Kit.ringAt(proj, corsetBot, 0.0022, 0.06, 2 * PI - 0.06, 140), 0.0022)
    for (const b of boneTh.slice(1, -1)) {
      for (const sg of [1, -1]) {
        for (const off of [-0.012, 0.012]) {
          const pts: THREE.Vector3[] = []
          for (let i = 0; i <= 14; i++) {
            const th = sg * (b + off)
            const y = mix(corsetBot(th) + 0.006, corsetTop(th) - 0.006, i / 14)
            const p = Kit.pointAt(proj, th, y, 0.0024, 0, P2, N2)
            if (p) pts.push(p.clone())
          }
          k.stitch('body', pts)
        }
      }
    }
    // eyelets + crisscross lacing
    const rows = 7
    const ey: THREE.Vector3[][] = [[], []]
    for (let i = 0; i < rows; i++) {
      const y = mix(corsetBot(0) + 0.018, corsetTop(0) - 0.012, i / (rows - 1))
      for (const [si, sx] of [[0, -1], [1, 1]] as const) {
        if (proj.cast(new THREE.Vector3(sx * 0.016, y, 0.6), new THREE.Vector3(0, 0, -1), P2, N2)) {
          const p = P2.clone().addScaledVector(N2, 0.0028)
          ey[si].push(p)
          const tg = new THREE.TorusGeometry(0.0042, 0.0013, 8, 18)
          const m = new THREE.Object3D()
          m.position.copy(p)
          m.lookAt(p.clone().add(N2))
          m.updateMatrix()
          tg.applyMatrix4(m.matrix)
          k.geom('body', tg, 'hardware')
        }
      }
    }
    const lace = (pts: THREE.Vector3[]) => k.geom('body', curveTube(pts, 0.0017, { seg: 24, radial: 6 }), 'cord')
    for (let i = 0; i < Math.min(ey[0].length, ey[1].length) - 1; i++) {
      const a = ey[0][i], b = ey[1][i + 1], c = ey[1][i], d = ey[0][i + 1]
      const lift = new THREE.Vector3(0, 0, 0.003)
      lace([a, a.clone().lerp(b, 0.5).add(lift), b])
      lace([c, c.clone().lerp(d, 0.5).add(lift.clone().multiplyScalar(1.6)), d])
    }
    // bow at the top
    const top0 = ey[0][ey[0].length - 1], top1 = ey[1][ey[1].length - 1]
    if (top0 && top1) {
      const mid = top0.clone().lerp(top1, 0.5).add(new THREE.Vector3(0, 0.004, 0.006))
      for (const s of [1, -1]) {
        lace([mid, mid.clone().add(new THREE.Vector3(s * 0.02, 0.012, 0.004)), mid.clone().add(new THREE.Vector3(s * 0.028, -0.004, 0.004)), mid.clone().add(new THREE.Vector3(s * 0.006, -0.002, 0.002))])
        lace([mid, mid.clone().add(new THREE.Vector3(s * 0.01, -0.03, 0.01)), mid.clone().add(new THREE.Vector3(s * 0.016, -0.07, 0.012))])
      }
    }
  }
}
