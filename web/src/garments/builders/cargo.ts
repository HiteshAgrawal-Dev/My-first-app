import * as THREE from 'three'
import { buildSurface, ringLoftFn, projectedPatchFn, curveTube, lathe, squircleR, type DisplaceFn, type SurfaceFn, type RingKey } from '../geometry'
import { Kit, type GarmentVariant } from '../kit'
import { ring, clothNoise, noise, angDiff } from '../parts'
import { bump, smoothstep, mix } from '../noise'

const PI = Math.PI

/** Parachute cargo: elastic/drawcord waistband, baggy legs, bellows cargo pockets, bungee hems. */
export function buildCargo(k: Kit, variant: GarmentVariant) {
  const wide = variant === 'wide'
  const waistY = 1.0, bandH = 0.05, crotchY = 0.67
  const legX = 0.082, legR = 0.126
  const S = wide ? 1.08 : 1

  // ---- pelvis: squircle at the waist morphing into a "peanut" hugging both legs at the crotch
  const peanutR = (th: number) => {
    // distance from origin to the union of two circles centred at (±legX, 0) radius legR, along direction th
    const dx = Math.sin(th), dz = Math.cos(th)
    let best = 0
    for (const cx of [legX, -legX]) {
      const b = dx * cx
      const disc = b * b - (cx * cx - legR * legR)
      if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc))
    }
    return best
  }
  const pelvisFn: SurfaceFn = (u, v, out) => {
    const th = u * 2 * PI
    const y = mix(waistY - bandH + 0.004, crotchY - 0.004, v)
    const rTop = squircleR(th, 0.205 * S, 0.138, 2.4)
    const rHip = squircleR(th, 0.214 * S, 0.142, 2.3)
    const rBot = peanutR(th) * (wide ? 1.02 : 1)
    let r: number
    if (v < 0.45) r = mix(rTop, rHip, smoothstep(0, 1, v / 0.45))
    else r = mix(rHip, rBot, smoothstep(0, 1, (v - 0.45) / 0.55))
    // seat sits back
    const zOff = -0.008 * v
    out.set(Math.sin(th) * r, y, Math.cos(th) * r + zOff)
  }
  const pnu = k.n(112, 32), pnv = k.n(34, 10)
  const pelvis = buildSurface(pelvisFn, {
    nu: pnu, nv: pnv, wrapU: true,
    displace: (p, _n, u, v) => {
      const th = u * 2 * PI
      let d = clothNoise(p, 0.003, 1.2, 51)
      // gathers under the elastic waist
      d += 0.004 * (1 - smoothstep(0, 0.25, v)) * Math.sin(th * 26 + noise.noise(Math.cos(th) * 3, Math.sin(th) * 3, 2) * 2)
      // fly / centre seams
      d -= 0.0012 * bump(angDiff(th, PI), 0, 0.02)
      d += 0.0015 * bump(angDiff(th, -0.06), 0, 0.03) * smoothstep(0.1, 0.3, v) // fly placket
      return d
    },
  })
  k.surface('body', pelvis, 'fabric')
  k.setExplode('body', [0, 0.05, 0])

  // ---- legs
  const legKeys = (side: number): RingKey[] => [
    ring(0, [legX, 0.78, -0.004], [0, -1, 0], legR, legR, 2),
    ring(0.12, [legX + 0.004, crotchY, -0.006], [0.02, -1, 0], legR, legR, 2),
    ring(0.35, [0.112, 0.48, 0.0], [0.06, -1, 0.01], 0.122 * S, 0.126 * S, 2.1),
    ring(0.55, [0.13, 0.32, 0.01], [0.04, -1, 0.02], 0.112 * S, 0.116 * S, 2.1),
    ring(0.78, [0.138, 0.14, 0.012], [0.03, -1, 0.0], 0.112 * S, 0.114 * S, 2.1),
    ring(0.9, [0.14, 0.06, 0.014], [0.03, -1, 0], 0.108 * S, 0.11 * S, 2.1),
    ring(0.955, [0.141, 0.03, 0.015], [0.02, -1, 0], wide ? 0.1 : 0.082, wide ? 0.102 : 0.086, 2),
    ring(1, [0.142, 0.0, 0.016], [0, -1, 0], wide ? 0.097 : 0.074, wide ? 0.1 : 0.078, 2),
  ].map((r) => ({ ...r, c: [r.c[0] * side, r.c[1], r.c[2]] as [number, number, number], n: [r.n[0] * side, r.n[1], r.n[2]] as [number, number, number] }))

  const lnu = k.n(64, 18), lnv = k.n(120, 30)
  const hemJ = Math.round(0.955 * lnv)
  for (const side of [1, -1]) {
    const part = side > 0 ? 'legR' : 'legL'
    const seed = side > 0 ? 3 : 11
    const lf = ringLoftFn(legKeys(side), new THREE.Vector3(0, 0, 1))
    const disp: DisplaceFn = (p, _n, u, t) => {
      const th = u * 2 * PI
      let d = 0
      if (t > 0.955) {
        // bungee channel
        return 0.0015 * Math.sin(th * 30) + 0.002
      }
      // parachute volume: vertical drape folds from the hip, stacking above the gathered hem
      const vert = Math.sin(th * 7 + seed + noise.noise(Math.cos(th) * 2 + seed, Math.sin(th) * 2, t * 3) * 2.5)
      d += 0.006 * vert * smoothstep(0.15, 0.4, t) * (1 - smoothstep(0.7, 0.9, t))
      const stackW = smoothstep(0.66, 0.88, t) * (1 - smoothstep(0.93, 0.955, t))
      d += 0.0065 * stackW * Math.sin(t * 95 + noise.noise(Math.cos(th) * 1.2, Math.sin(th) * 1.2 + seed, t * 3) * 4.5 + Math.sin(th * 2 + seed) * 1.6) * (0.6 + 0.4 * noise.noise(Math.cos(th) * 3, Math.sin(th) * 3, t * 8 + seed))
      // radial gathers converging into the bungee hem
      d += 0.007 * smoothstep(0.86, 0.95, t) * Math.sin(th * 13 + seed)
      // knee articulation: curved seam + soft horizontal darts at the front
      const front = Math.max(0, Math.cos(th))
      const kneeT = 0.56 + 0.025 * Math.cos(th * 1.0)
      d -= 0.0022 * bump(t, kneeT, 0.006) * (0.4 + 0.6 * front)
      d += 0.004 * front * bump(t, 0.6, 0.035) * Math.sin(t * 160)
      // crotch / inseam folds
      d += 0.004 * bump(t, 0.2, 0.08) * Math.sin(th * 5 + 2.0) * Math.max(0, -Math.sin(th) * side)
      // outseam
      d -= 0.0014 * bump(angDiff(th, side * PI / 2), 0, 0.035)
      d += clothNoise(p, 0.005, 0.9, seed)
      return d
    }
    const leg = buildSurface(lf, { nu: lnu, nv: lnv, wrapU: true, displace: disp })
    k.items.push({ part, geometry: leg.geometry(0, hemJ), mat: 'fabric', interior: true })
    k.items.push({ part, geometry: leg.geometry(hemJ, lnv), mat: 'rib', interior: true })
    k.rim(part, leg.row(1, lnu), 0.0055)
    k.stitch(part, leg.row((hemJ - 0.6) / lnv, lnu, 0.0012), { closed: true })
    // knee seam stitch
    const knee: THREE.Vector3[] = []
    for (let i = 0; i <= 40; i++) {
      const u = (-0.22 + 0.44 * (i / 40) + 1) % 1
      const th = u * 2 * PI
      const P = new THREE.Vector3(), Nn = new THREE.Vector3()
      leg.sample(u, 0.56 + 0.025 * Math.cos(th) + 0.008, P, Nn)
      knee.push(P.addScaledVector(Nn, 0.0012))
    }
    k.stitch(part, knee)
    k.setExplode(part, [side * 0.18, -0.1, 0])

    // bungee toggle on the outer hem
    const P = new THREE.Vector3(), Nn = new THREE.Vector3()
    leg.sample(side > 0 ? 0.25 : 0.75, 0.985, P, Nn)
    const cordStart = P.clone().addScaledVector(Nn, 0.004)
    const toggle = cordStart.clone().add(new THREE.Vector3(side * 0.028, -0.05, 0.012))
    k.geom(part, curveTube([cordStart, cordStart.clone().add(new THREE.Vector3(side * 0.018, -0.02, 0.01)), toggle], 0.0028, { seg: 20, radial: 6 }), 'cord')
    k.geom(part, curveTube([toggle, toggle.clone().add(new THREE.Vector3(side * 0.006, -0.03, 0.002)), toggle.clone().add(new THREE.Vector3(-side * 0.004, -0.045, 0.006))], 0.0028, { seg: 16, radial: 6 }), 'cord')
    const tg = lathe([[0, -0.012], [0.007, -0.011], [0.0085, -0.004], [0.0085, 0.006], [0.006, 0.012], [0, 0.013]], 18)
    tg.translate(toggle.x, toggle.y - 0.008, toggle.z)
    k.geom(part, tg, 'hardware')
  }

  // ---- waistband with elastic gathers and drawcord
  const bandKeys = [
    ring(0, [0, waistY - bandH - 0.004, -0.002], [0, 1, 0], 0.209 * S, 0.141, 2.4),
    ring(0.5, [0, waistY - bandH / 2, -0.002], [0, 1, 0], 0.212 * S, 0.143, 2.4),
    ring(1, [0, waistY, -0.002], [0, 1, 0], 0.208 * S, 0.14, 2.4),
  ]
  const band = buildSurface(ringLoftFn(bandKeys, new THREE.Vector3(0, 0, 1)), {
    nu: k.n(140, 40), nv: k.n(10, 4), wrapU: true,
    displace: (_p, _n, u, v) => {
      const th = u * 2 * PI
      return 0.0028 * Math.sin(th * 46 + Math.sin(th * 5) * 0.8) * Math.sin(PI * v) + 0.002 * Math.sin(PI * v)
    },
  })
  k.surface('waistband', band, 'rib')
  k.rim('waistband', band.row(1, 140), 0.004, { closed: true, mat: 'rib' })
  k.rim('waistband', band.row(0, 140), 0.003, { closed: true, mat: 'rib' })
  k.stitch('waistband', band.row(0.3, 140, 0.0012), { closed: true })
  k.stitch('waistband', band.row(0.7, 140, 0.0012), { closed: true })
  k.cavity('waistband', new THREE.Vector3(0, waistY - 0.03, -0.002), 0.2 * S, 0.135)
  // drawcord exits + hanging ends
  const P = new THREE.Vector3(), Nn = new THREE.Vector3()
  for (const s of [1, -1]) {
    band.sample((s > 0 ? 0.018 : 1 - 0.018), 0.5, P, Nn)
    const start = P.clone().addScaledVector(Nn, 0.004)
    const eyelet = new THREE.TorusGeometry(0.0055, 0.0018, 8, 16)
    const m = new THREE.Object3D()
    m.position.copy(start)
    m.lookAt(start.clone().add(Nn))
    m.updateMatrix()
    eyelet.applyMatrix4(m.matrix)
    k.geom('waistband', eyelet, 'hardware')
    const pts = [
      start,
      start.clone().add(new THREE.Vector3(s * 0.004, -0.02, 0.012)),
      start.clone().add(new THREE.Vector3(s * 0.01, -0.09, 0.016)),
      start.clone().add(new THREE.Vector3(s * 0.016 + (s > 0 ? 0.006 : 0), -0.2, 0.012)),
    ]
    k.geom('waistband', curveTube(pts, 0.0038, { seg: 40, radial: 8 }), 'cord')
    const end = pts[3]
    const ag = lathe([[0, 0], [0.0044, 0.001], [0.0046, 0.022], [0, 0.025]], 14)
    ag.translate(end.x, end.y - 0.022, end.z)
    k.geom('waistband', ag, 'hardware')
  }
  k.setExplode('waistband', [0, 0.18, 0])

  // ---- fly J-stitch on the front
  const proj = k.projector(['body'])
  const jPts: THREE.Vector3[] = []
  for (let i = 0; i <= 24; i++) {
    const f = i / 24
    const y = mix(waistY - bandH - 0.008, crotchY + 0.06, f)
    const x = -0.032 + (f > 0.75 ? ((f - 0.75) / 0.25) * 0.032 : 0)
    const yy = f > 0.75 ? y - Math.sin(((f - 0.75) / 0.25) * PI * 0.5) * 0.012 : y
    if (proj.cast(new THREE.Vector3(x, yy, 0.6), new THREE.Vector3(0, 0, -1), P, Nn)) jPts.push(P.clone().addScaledVector(Nn, 0.0012))
  }
  k.stitch('body', jPts)

  // ---- bellows cargo pockets with flaps on the outer thighs
  for (const side of [1, -1]) {
    const part = side > 0 ? 'pocketR' : 'pocketL'
    const legProj = k.projector([side > 0 ? 'legR' : 'legL'])
    const cz = 0.02, cy = 0.56, w = 0.15, h = 0.19
    const pocketFn = projectedPatchFn(legProj, (a, t) => {
      const z = cz + (a - 0.5) * w
      const y = cy + (t - 0.5) * h
      const e = Math.min(1, Math.min(a, 1 - a) * 9, t * 9, (1 - t) * 18)
      return { o: new THREE.Vector3(side * 0.6, y, z), d: new THREE.Vector3(-side, 0, 0), off: 0.004 + 0.012 * Math.sqrt(Math.max(0, e)) }
    })
    const pk = buildSurface(pocketFn, {
      nu: k.n(26, 8), nv: k.n(30, 8), orientDir: new THREE.Vector3(side, 0, 0),
      displace: (p) => clothNoise(p, 0.0016, 2.5, 61) + 0.0015 * Math.sin(p.y * 90),
    })
    k.surface(part, pk, 'fabric', true)
    k.rim(part, pk.col(0, 0, 1, 20, -0.0006), 0.0026)
    k.rim(part, pk.col(1, 0, 1, 20, -0.0006), 0.0026)
    k.rim(part, pk.row(0, 20, -0.0006), 0.0026)
    k.stitch(part, pk.col(0.06, 0.04, 0.96, 20, 0.0012))
    k.stitch(part, pk.col(0.94, 0.04, 0.96, 20, 0.0012))
    k.stitch(part, pk.row(0.05, 20, 0.0012))
    // flap
    const fy = cy + h / 2 + 0.012
    const flapFn = projectedPatchFn(legProj, (a, t) => {
      const z = cz + (a - 0.5) * (w + 0.012)
      const y = fy - t * 0.058
      return { o: new THREE.Vector3(side * 0.6, y, z), d: new THREE.Vector3(-side, 0, 0), off: 0.006 + 0.012 * smoothstep(0, 0.6, t) }
    })
    const fl = buildSurface(flapFn, { nu: k.n(26, 8), nv: k.n(8, 4), orientDir: new THREE.Vector3(side, 0, 0), displace: (p) => clothNoise(p, 0.001, 3, 71) })
    k.surface(part, fl, 'trim', true)
    k.rim(part, fl.row(1, 20, -0.0004), 0.003)
    k.rim(part, fl.col(0, 0, 1, 8, -0.0004), 0.0024)
    k.rim(part, fl.col(1, 0, 1, 8, -0.0004), 0.0024)
    k.stitch(part, fl.row(0.82, 20, 0.0012))
    k.stitch(part, fl.col(0.06, 0.1, 0.8, 8, 0.0012))
    k.stitch(part, fl.col(0.94, 0.1, 0.8, 8, 0.0012))
    // snap
    fl.sample(0.5, 0.75, P, Nn)
    const snap = lathe([[0, 0.003], [0.005, 0.0028], [0.0062, 0.0012], [0.006, 0], [0, 0]], 18)
    const m = new THREE.Object3D()
    m.position.copy(P).addScaledVector(Nn, 0.0005)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Nn)
    m.updateMatrix()
    snap.applyMatrix4(m.matrix)
    k.geom(part, snap, 'hardware')
    k.setExplode(part, [side * 0.3, -0.05, 0])
  }

  // back patch pockets with flaps
  for (const side of [1, -1]) {
    const cx = side * 0.1, cy = 0.82, w = 0.12, h = 0.12
    const fn = projectedPatchFn(proj, (a, t) => {
      const x = cx + (a - 0.5) * w
      const y = cy + (t - 0.5) * h
      return { o: new THREE.Vector3(x, y, -0.6), d: new THREE.Vector3(0, 0, 1), off: 0.003 + 0.002 * Math.sin(PI * a) * Math.sin(PI * t) }
    })
    const bp = buildSurface(fn, { nu: k.n(18, 6), nv: k.n(18, 6), orientDir: new THREE.Vector3(0, 0, -1) })
    k.surface('body', bp, 'trim', false)
    k.stitch('body', bp.col(0.06, 0.04, 0.9, 12, 0.001))
    k.stitch('body', bp.col(0.94, 0.04, 0.9, 12, 0.001))
    k.stitch('body', bp.row(0.06, 12, 0.001))
    k.rim('body', bp.row(1, 12, -0.0004), 0.0026)
    k.rim('body', bp.col(0, 0, 1, 10, -0.0004), 0.002)
    k.rim('body', bp.col(1, 0, 1, 10, -0.0004), 0.002)
  }
}
