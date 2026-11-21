import * as THREE from 'three'
import { buildSurface, ringLoftFn, type DisplaceFn } from '../geometry'
import { Kit, type GarmentVariant } from '../kit'
import { torsoFn, sleeveSurface, ring, angDiff, clothNoise, drapeFolds, radialFolds, noise } from '../parts'
import { bump, smoothstep } from '../noise'
import { topLevels } from './hoodie'

const PI = Math.PI

export function buildTee(k: Kit, variant: GarmentVariant) {
  const fitted = variant === 'fitted' || variant === 'cropped'
  const W = fitted ? 0.74 : 1.02
  const D = fitted ? 0.74 : 0.82
  const hemY = fitted ? -0.235 : -0.31
  const neckFront = 0.292, neckBack = 0.312
  const neckW = fitted ? 0.078 : 0.086, neckD = fitted ? 0.074 : 0.08
  const levels = topLevels({
    W, depth: D, hemY, bandTop: null, neckFront, neckBack, neckW, neckD,
    shoulderY: fitted ? 0.24 : 0.222, shoulderW: fitted ? 0.29 : 0.312, sq: 3.3, shoulderSq: 3.2,
    waist: fitted ? { y: -0.07, w: 0.275 } : undefined,
  })
  const nu = k.n(120, 32), nv = k.n(90, 24)
  const disp: DisplaceFn = (p, _n, u) => {
    const th = u * 2 * PI
    let d = 0
    d -= 0.0015 * (bump(angDiff(th, PI / 2), 0, 0.035) + bump(angDiff(th, -PI / 2), 0, 0.035))
    d += drapeFolds(p, 0.007 * smoothstep(0.05, hemY + 0.02, p.y), 17, 0.4)
    d += radialFolds(p, 0.28 * W, 0.08, 5, 0.12, fitted ? 0 : 0.0045, 1.2) * Math.abs(Math.cos(th))
    d += clothNoise(p, fitted ? 0.0016 : 0.0026, 1.1, 5)
    d -= 0.0016 * bump(p.y, hemY + 0.022, 0.004)
    return d
  }
  const torso = buildSurface(torsoFn(levels, { crown: 0.01 }), { nu, nv, wrapU: true, displace: disp })
  k.surface('body', torso, 'fabric')
  k.rim('body', torso.row(0, nu), 0.0035, { closed: true })
  const proj = k.projector(['body'])
  k.stitch('body', Kit.ringAt(proj, () => hemY + 0.016, 0.0012, 0, PI * 2, 140), { closed: true })
  k.stitch('body', Kit.ringAt(proj, () => hemY + 0.026, 0.0012, 0, PI * 2, 140), { closed: true })
  k.setExplode('body', [0, 0, 0])

  // short boxy sleeves
  const sx = fitted ? 0.86 : 1
  const keys = fitted
    ? [
        ring(0, [0.22, 0.15, 0], [1, 0.05, 0], 0.085, 0.1),
        ring(0.5, [0.285, 0.12, 0.004], [0.72, -0.69, 0], 0.074, 0.084),
        ring(1, [0.33, 0.07, 0.01], [0.66, -0.75, 0], 0.068, 0.078),
      ]
    : [
        ring(0, [0.25, 0.118, 0], [1, 0.0, 0], 0.097, 0.1),
        ring(0.35, [0.325, 0.08, 0.004], [0.72, -0.69, 0], 0.096, 0.086),
        ring(0.75, [0.37, 0.022, 0.008], [0.6, -0.8, 0], 0.094, 0.08),
        ring(1, [0.392, -0.014, 0.01], [0.56, -0.83, 0], 0.092, 0.078),
      ]
  const snu = k.n(48, 14), snv = k.n(30, 10)
  for (const side of [1, -1] as const) {
    const part = side > 0 ? 'sleeveR' : 'sleeveL'
    const s = sleeveSurface({ keys, stack: 0, twist: 0, noiseAmp: 0.003, hemBand: 0.8, seed: 4 }, side, snu, snv)
    k.surface(part, s, 'fabric')
    k.rim(part, s.row(1, snu), 0.0034, { closed: true })
    k.stitch(part, s.row(0.84, snu, 0.0012), { closed: true })
    k.setExplode(part, [side * 0.4 * sx, 0.02, 0])
  }

  // ribbed mock neck
  const tilt = (neckBack - neckFront) / 0.16
  const collarH = fitted ? 0.022 : 0.032
  const zc = -0.012
  const ckeys = [
    ring(0, [0, (neckFront + neckBack) / 2 - 0.008, zc], [0, 1, tilt], neckW + 0.004, neckD + 0.004),
    ring(0.5, [0, (neckFront + neckBack) / 2 + collarH * 0.5, zc], [0, 1, tilt * 0.8], neckW + 0.006, neckD + 0.006),
    ring(1, [0, (neckFront + neckBack) / 2 + collarH, zc], [0, 1, tilt * 0.6], neckW + 0.003, neckD + 0.003),
  ]
  const collar = buildSurface(ringLoftFn(ckeys, new THREE.Vector3(0, 0, 1)), {
    nu: k.n(96, 24), nv: k.n(10, 4), wrapU: true,
    displace: (p, _n, u) => 0.0007 * Math.cos(u * PI * 2 * 70) + noise.noise(p.x * 30, p.y * 30, p.z * 30) * 0.0005,
  })
  k.surface('collar', collar, 'rib')
  k.rim('collar', collar.row(1, 96), 0.0035, { closed: true, mat: 'rib' })
  k.stitch('collar', collar.row(0.18, 96, 0.001), { closed: true })
  k.cavity('body', new THREE.Vector3(0, (neckFront + neckBack) / 2 - 0.05, zc), neckW, neckD)
  k.setExplode('collar', [0, 0.18, 0])
}
