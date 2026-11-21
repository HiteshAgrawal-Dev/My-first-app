import * as THREE from 'three'
import { buildSurface, ringLoftFn, type DisplaceFn } from '../geometry'
import { Kit, type GarmentVariant } from '../kit'
import { torsoFn, sleeveSurface, ring, angDiff, clothNoise, noise, type TorsoLevel } from '../parts'
import { bump, smoothstep, mix } from '../noise'
import { addZip } from './hoodie'

const PI = Math.PI

/** Quilted baffle profile: 0 at the stitch line, 1 at the crown of the channel. */
function baffle(f: number) {
  const ff = ((f % 1) + 1) % 1
  return Math.pow(Math.sin(PI * ff), 0.5)
}

export function buildPuffer(k: Kit, variant: GarmentVariant) {
  const cropped = variant === 'cropped'
  const hemY = cropped ? -0.17 : -0.37
  const bindTop = hemY + 0.035
  const neckF = 0.29, neckB = 0.31, neckW = 0.104, neckD = 0.098
  const W = cropped ? 1.04 : 1
  const levels: TorsoLevel[] = [
    { y: hemY, w: 0.29 * W, d: 0.16, sq: 2.3 },
    { y: bindTop, w: 0.3 * W, d: 0.165, sq: 2.3 },
    { y: bindTop + 0.05, w: 0.335 * W, d: 0.185, sq: 2.4 },
    { y: mix(bindTop, 0.08, 0.5), w: 0.34 * W, d: 0.19, sq: 2.4 },
    { y: 0.08, w: 0.335 * W, d: 0.185, sq: 2.4 },
    { y: (th) => 0.215 - 0.035 * Math.cos(th) ** 2, w: 0.315 * W, d: 0.165, sq: 2.6 },
    { y: (th) => mix(neckF, neckB, (1 - Math.cos(th)) / 2), w: neckW, d: neckD, sq: 2, z: -0.01 },
  ]
  const pitch = cropped ? 0.078 : 0.086
  const nu = k.n(112, 32), nv = k.n(100, 28)
  const jb = Math.round(0.06 * nv)
  const disp: DisplaceFn = (p, _n, u) => {
    const th = u * 2 * PI
    if (p.y < bindTop + 0.001) return 0.0009 * Math.cos(th * 70)
    const f = (p.y - bindTop) / pitch
    const zipMask = 1 - bump(angDiff(th, 0), 0, 0.07)
    const sideMask = 1 - 0.35 * (bump(angDiff(th, PI / 2), 0, 0.05) + bump(angDiff(th, -PI / 2), 0, 0.05))
    const fade = smoothstep(bindTop, bindTop + 0.02, p.y) * (1 - smoothstep(0.24, 0.3, p.y) * 0.6)
    const b = baffle(f)
    let d = 0.024 * (b - 0.62) * zipMask * sideMask * fade
    // compression creases that radiate from each stitch line
    const crease = (1 - b) * noise.ridge(th * 6, f * 3, p.z * 8)
    d += 0.004 * crease * fade
    d += clothNoise(p, 0.004, 1.1, 7) * (0.4 + 0.6 * b)
    // zip placket groove
    d -= 0.004 * bump(angDiff(th, 0), 0, 0.03)
    return d
  }
  const torso = buildSurface(torsoFn(levels, { band: jb / nv, crown: 0.008 }), { nu, nv, wrapU: true, displace: disp })
  k.items.push({ part: 'body', geometry: torso.geometry(jb, nv), mat: 'fabric', interior: true })
  k.items.push({ part: 'body', geometry: torso.geometry(0, jb), mat: 'rib', interior: true })
  k.rim('body', torso.row(0, nu), 0.005, { closed: true, mat: 'rib' })
  const proj = k.projector(['body'])
  // baffle stitch lines
  for (let y = bindTop; y < 0.27; y += pitch) {
    const pts = Kit.ringAt(proj, () => y + (y === bindTop ? 0.003 : 0), 0.0008, 0.07, 2 * PI - 0.07, 120)
    if (pts.length > 10) k.stitch('body', pts, { dash: 0.0045 })
  }
  k.setExplode('body', [0, 0, 0])

  // sleeves (baffled)
  const keys = [
    ring(0, [0.25, 0.14, 0], [1, 0, 0], 0.1, 0.13),
    ring(0.12, [0.345, 0.115, 0.004], [0.82, -0.57, 0], 0.11, 0.118),
    ring(0.4, [0.43, -0.04, 0.014], [0.5, -0.87, 0], 0.104, 0.108),
    ring(0.7, [0.5, -0.21, 0.03], [0.36, -0.93, 0.05], 0.096, 0.1),
    ring(0.92, [0.54, -0.33, 0.04], [0.3, -0.95, 0.08], 0.09, 0.094),
    ring(0.94, [0.544, -0.343, 0.042], [0.3, -0.95, 0.08], 0.06, 0.062),
    ring(1, [0.553, -0.375, 0.045], [0.3, -0.95, 0.08], 0.056, 0.058),
  ]
  if (cropped) for (const r of keys) { r.rx *= 0.95; r.ry *= 0.95 }
  const snu = k.n(44, 16), snv = k.n(76, 22)
  const jc = Math.round(0.93 * snv)
  for (const side of [1, -1] as const) {
    const part = side > 0 ? 'sleeveR' : 'sleeveL'
    const s = sleeveSurface({ keys, cuffT: jc / snv, ribCount: 50, stack: 0.25, twist: 0.3, noiseAmp: 0.003, puff: { pitch: 0.12, amp: 0.02 }, seed: 6 }, side, snu, snv)
    k.items.push({ part, geometry: s.geometry(0, jc), mat: 'fabric', interior: true })
    k.items.push({ part, geometry: s.geometry(jc, snv), mat: 'rib', interior: true })
    k.rim(part, s.row(1, snu), 0.004, { closed: true, mat: 'rib' })
    for (let t = 0.06 + 0.12; t < jc / snv - 0.02; t += 0.12) k.stitch(part, s.row(t, snu, 0.0006), { closed: true, dash: 0.0045 })
    k.setExplode(part, [side * 0.55, -0.04, 0])
  }

  // funnel collar (two baffles), open at the zip
  const zc = -0.01
  const tilt = (neckB - neckF) / 0.2
  const ckeys = [
    ring(0, [0, (neckF + neckB) / 2 - 0.012, zc], [0, 1, tilt], neckW + 0.012, neckD + 0.012),
    ring(0.5, [0, (neckF + neckB) / 2 + 0.05, zc], [0, 1, tilt], neckW + 0.006, neckD + 0.006),
    ring(1, [0, (neckF + neckB) / 2 + 0.11, zc + 0.004], [0, 1, tilt * 0.5], neckW + 0.016, neckD + 0.016),
  ]
  const collar = buildSurface(
    ringLoftFn(ckeys, new THREE.Vector3(0, 0, 1)),
    {
      nu: k.n(80, 24), nv: k.n(24, 8), wrapU: true,
      displace: (p, _n, u, v) => {
        const th = u * 2 * PI
        return 0.014 * (baffle(v * 2) - 0.6) * (1 - bump(angDiff(th, 0), 0, 0.1)) + clothNoise(p, 0.002, 2, 8)
      },
    },
  )
  k.surface('collar', collar, 'fabric')
  k.rim('collar', collar.row(1, 80), 0.006, { closed: true })
  k.stitch('collar', collar.row(0.5, 80, 0.0006), { closed: true, dash: 0.0045 })
  k.cavity('collar', new THREE.Vector3(0, (neckF + neckB) / 2 - 0.04, zc), neckW, neckD)
  k.setExplode('collar', [0, 0.2, 0])

  // centre-front zip from hem to collar top
  const zproj = k.projector(['body', 'collar'])
  addZip(k, zproj, hemY + 0.004, (neckF + neckB) / 2 + 0.105, 'body')
  // logo tab on the chest
  const P = new THREE.Vector3(), N = new THREE.Vector3()
  if (Kit.pointAt(proj, 0.62, 0.13, 0.0025, 0, P, N)) {
    const tab = new THREE.BoxGeometry(0.03, 0.012, 0.002)
    const m = new THREE.Object3D()
    m.position.copy(P)
    m.lookAt(P.clone().add(N))
    m.updateMatrix()
    tab.applyMatrix4(m.matrix)
    k.geom('body', tab, 'hardware')
  }
}
