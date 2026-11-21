import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()

export type SurfaceFn = (u: number, v: number, out: THREE.Vector3) => void
export type DisplaceFn = (p: THREE.Vector3, n: THREE.Vector3, u: number, v: number) => number

export interface SurfaceOpts {
  nu: number
  nv: number
  /** u is periodic (tube). fn(1,v) must equal fn(0,v). */
  wrapU?: boolean
  displace?: DisplaceFn
  /** 'auto' orients normals away from each row's centroid. */
  orient?: 'auto' | 'none' | 'flip'
  /** if set, normals are flipped so that they (on average) point along this direction */
  orientDir?: THREE.Vector3
  /** Optional per-vertex triangle filter (return false to drop quads touching this vertex). */
  keep?: (p: THREE.Vector3, u: number, v: number) => boolean
}

/**
 * A parametric grid surface. Positions/normals are stored on a (nu+1)x(nv+1) lattice so that
 * other parts (pockets, seams, lapels) can be laid onto it by bilinear sampling.
 */
export class Surface {
  nu: number
  nv: number
  wrapU: boolean
  pos: Float32Array
  nrm: Float32Array
  uv: Float32Array
  flipped = false
  keepMask: Uint8Array | null = null

  constructor(nu: number, nv: number, wrapU: boolean) {
    this.nu = nu
    this.nv = nv
    this.wrapU = wrapU
    const n = (nu + 1) * (nv + 1)
    this.pos = new Float32Array(n * 3)
    this.nrm = new Float32Array(n * 3)
    this.uv = new Float32Array(n * 2)
  }

  idx(i: number, j: number) {
    return j * (this.nu + 1) + i
  }

  getP(i: number, j: number, out: THREE.Vector3) {
    const k = this.idx(i, j) * 3
    return out.set(this.pos[k], this.pos[k + 1], this.pos[k + 2])
  }

  getN(i: number, j: number, out: THREE.Vector3) {
    const k = this.idx(i, j) * 3
    return out.set(this.nrm[k], this.nrm[k + 1], this.nrm[k + 2])
  }

  /** Bilinear sample position + normal at parametric (u,v) in [0,1]. */
  sample(u: number, v: number, outP: THREE.Vector3, outN?: THREE.Vector3) {
    if (this.wrapU) u = ((u % 1) + 1) % 1
    else u = Math.min(1, Math.max(0, u))
    v = Math.min(1, Math.max(0, v))
    const fu = u * this.nu, fv = v * this.nv
    const i = Math.min(this.nu - 1, Math.floor(fu)), j = Math.min(this.nv - 1, Math.floor(fv))
    const su = fu - i, sv = fv - j
    const k00 = this.idx(i, j) * 3, k10 = this.idx(i + 1, j) * 3
    const k01 = this.idx(i, j + 1) * 3, k11 = this.idx(i + 1, j + 1) * 3
    const w00 = (1 - su) * (1 - sv), w10 = su * (1 - sv), w01 = (1 - su) * sv, w11 = su * sv
    const P = this.pos, N = this.nrm
    outP.set(
      P[k00] * w00 + P[k10] * w10 + P[k01] * w01 + P[k11] * w11,
      P[k00 + 1] * w00 + P[k10 + 1] * w10 + P[k01 + 1] * w01 + P[k11 + 1] * w11,
      P[k00 + 2] * w00 + P[k10 + 2] * w10 + P[k01 + 2] * w01 + P[k11 + 2] * w11,
    )
    if (outN) {
      outN.set(
        N[k00] * w00 + N[k10] * w10 + N[k01] * w01 + N[k11] * w11,
        N[k00 + 1] * w00 + N[k10 + 1] * w10 + N[k01 + 1] * w01 + N[k11 + 1] * w11,
        N[k00 + 2] * w00 + N[k10 + 2] * w10 + N[k01 + 2] * w01 + N[k11 + 2] * w11,
      ).normalize()
    }
    return outP
  }

  /** Points of an iso-v row (for rims / seams). */
  row(v: number, count = this.nu, offset = 0): THREE.Vector3[] {
    const pts: THREE.Vector3[] = []
    const n = new THREE.Vector3()
    const end = this.wrapU ? count : count + 1
    for (let i = 0; i < end; i++) {
      const p = new THREE.Vector3()
      this.sample(i / count, v, p, n)
      if (offset) p.addScaledVector(n, offset)
      pts.push(p)
    }
    return pts
  }

  /** Points of an iso-u column. */
  col(u: number, v0 = 0, v1 = 1, count = this.nv, offset = 0): THREE.Vector3[] {
    const pts: THREE.Vector3[] = []
    const n = new THREE.Vector3()
    for (let j = 0; j <= count; j++) {
      const p = new THREE.Vector3()
      this.sample(u, v0 + (v1 - v0) * (j / count), p, n)
      if (offset) p.addScaledVector(n, offset)
      pts.push(p)
    }
    return pts
  }

  computeNormals() {
    const { nu, nv, wrapU, pos, nrm } = this
    const pu = _a, pv = _b, n = _c
    const bad: number[] = []
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        let i0 = i - 1, i1 = i + 1
        if (wrapU) {
          if (i0 < 0) i0 = nu - 1
          if (i1 > nu) i1 = 1
        } else {
          i0 = Math.max(0, i0)
          i1 = Math.min(nu, i1)
        }
        const j0 = Math.max(0, j - 1), j1 = Math.min(nv, j + 1)
        const a0 = this.idx(i0, j) * 3, a1 = this.idx(i1, j) * 3
        const b0 = this.idx(i, j0) * 3, b1 = this.idx(i, j1) * 3
        pu.set(pos[a1] - pos[a0], pos[a1 + 1] - pos[a0 + 1], pos[a1 + 2] - pos[a0 + 2])
        pv.set(pos[b1] - pos[b0], pos[b1 + 1] - pos[b0 + 1], pos[b1 + 2] - pos[b0 + 2])
        n.crossVectors(pu, pv)
        const k = this.idx(i, j) * 3
        const l = n.length()
        if (l < 1e-12) {
          bad.push(i, j)
          nrm[k] = 0; nrm[k + 1] = 0; nrm[k + 2] = 0
        } else {
          const s = this.flipped ? -1 / l : 1 / l
          nrm[k] = n.x * s; nrm[k + 1] = n.y * s; nrm[k + 2] = n.z * s
        }
      }
    }
    // Degenerate (pole) vertices: average the normals of the neighbouring row.
    for (let q = 0; q < bad.length; q += 2) {
      const i = bad[q], j = bad[q + 1]
      const jj = j === 0 ? 1 : j === nv ? nv - 1 : j + 1
      const s = new THREE.Vector3()
      for (let ii = 0; ii <= nu; ii++) s.add(this.getN(ii, jj, n))
      // pole: point the normal away along the surface direction
      if (s.lengthSq() < 1e-8) s.set(0, 1, 0)
      s.normalize()
      const k = this.idx(i, j) * 3
      nrm[k] = s.x; nrm[k + 1] = s.y; nrm[k + 2] = s.z
    }
  }

  computeUVs() {
    // Arc-length UVs (world units) so tileable fabric textures have uniform density.
    const { nu, nv, pos, uv } = this
    const ic = Math.floor(nu / 2)
    // v: cumulative along the centre column, then per column
    for (let i = 0; i <= nu; i++) {
      let acc = 0
      for (let j = 0; j <= nv; j++) {
        if (j > 0) {
          const a = this.idx(i, j - 1) * 3, b = this.idx(i, j) * 3
          acc += Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2])
        }
        uv[this.idx(i, j) * 2 + 1] = acc
      }
    }
    for (let j = 0; j <= nv; j++) {
      uv[this.idx(ic, j) * 2] = 0
      let acc = 0
      for (let i = ic + 1; i <= nu; i++) {
        const a = this.idx(i - 1, j) * 3, b = this.idx(i, j) * 3
        acc += Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2])
        uv[this.idx(i, j) * 2] = acc
      }
      acc = 0
      for (let i = ic - 1; i >= 0; i--) {
        const a = this.idx(i + 1, j) * 3, b = this.idx(i, j) * 3
        acc -= Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2])
        uv[this.idx(i, j) * 2] = acc
      }
    }
  }

  /** Triangulate rows [j0, j1) (default: all). */
  geometry(j0 = 0, j1 = this.nv): THREE.BufferGeometry {
    const { nu } = this
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(), 3))
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(), 2))
    const idx: number[] = []
    const km = this.keepMask
    for (let j = j0; j < j1; j++) {
      for (let i = 0; i < nu; i++) {
        const a = this.idx(i, j), b = this.idx(i + 1, j), c = this.idx(i, j + 1), d = this.idx(i + 1, j + 1)
        if (km && (!km[a] || !km[b] || !km[c] || !km[d])) continue
        if (this.flipped) {
          idx.push(a, c, b, b, c, d)
        } else {
          idx.push(a, b, c, b, d, c)
        }
      }
    }
    g.setIndex(idx)
    return g
  }
}

export function buildSurface(fn: SurfaceFn, opts: SurfaceOpts): Surface {
  const { nu, nv, wrapU = false } = opts
  const s = new Surface(nu, nv, wrapU)
  const p = new THREE.Vector3()
  for (let j = 0; j <= nv; j++) {
    const v = j / nv
    for (let i = 0; i <= nu; i++) {
      const k = s.idx(i, j) * 3
      if (wrapU && i === nu) {
        const k0 = s.idx(0, j) * 3
        s.pos[k] = s.pos[k0]; s.pos[k + 1] = s.pos[k0 + 1]; s.pos[k + 2] = s.pos[k0 + 2]
        continue
      }
      fn(i / nu, v, p)
      s.pos[k] = p.x; s.pos[k + 1] = p.y; s.pos[k + 2] = p.z
    }
  }
  s.computeNormals()
  const orient = opts.orient ?? 'auto'
  if (opts.orientDir) {
    let dot = 0
    const n = new THREE.Vector3()
    for (let k = 0; k < (nu + 1) * (nv + 1); k++) {
      n.set(s.nrm[k * 3], s.nrm[k * 3 + 1], s.nrm[k * 3 + 2])
      dot += n.dot(opts.orientDir)
    }
    if (dot < 0) {
      s.flipped = true
      s.computeNormals()
    }
  } else if (orient === 'flip') {
    s.flipped = true
    s.computeNormals()
  } else if (orient === 'auto') {
    let dot = 0
    const c = new THREE.Vector3(), q = new THREE.Vector3(), n = new THREE.Vector3()
    for (let j = 0; j <= nv; j++) {
      c.set(0, 0, 0)
      for (let i = 0; i <= nu; i++) c.add(s.getP(i, j, q))
      c.multiplyScalar(1 / (nu + 1))
      for (let i = 0; i <= nu; i++) {
        s.getP(i, j, q).sub(c)
        dot += q.dot(s.getN(i, j, n))
      }
    }
    if (dot < 0) {
      s.flipped = true
      s.computeNormals()
    }
  }
  if (opts.displace) {
    const n = new THREE.Vector3()
    const disp = new Float32Array((nu + 1) * (nv + 1))
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        s.getP(i, j, p)
        s.getN(i, j, n)
        disp[s.idx(i, j)] = opts.displace(p, n, i / nu, j / nv)
      }
    }
    if (wrapU) for (let j = 0; j <= nv; j++) disp[s.idx(nu, j)] = disp[s.idx(0, j)]
    for (let k = 0; k < disp.length; k++) {
      const d = disp[k]
      s.pos[k * 3] += s.nrm[k * 3] * d
      s.pos[k * 3 + 1] += s.nrm[k * 3 + 1] * d
      s.pos[k * 3 + 2] += s.nrm[k * 3 + 2] * d
    }
    s.computeNormals()
  }
  if (opts.keep) {
    s.keepMask = new Uint8Array((nu + 1) * (nv + 1))
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        s.getP(i, j, p)
        s.keepMask[s.idx(i, j)] = opts.keep(p, i / nu, j / nv) ? 1 : 0
      }
    }
  }
  s.computeUVs()
  return s
}

// ---------------------------------------------------------------------------------------------
// Ring lofts (sleeves, legs, collars, hoods)

export interface RingKey {
  t: number
  c: [number, number, number]
  /** ring plane normal (direction of travel) */
  n: [number, number, number]
  rx: number // half-size along the in-plane "side" axis
  ry: number // half-size along the in-plane reference axis
  sq?: number // superellipse exponent (2 = ellipse)
  /** rotation of the ring around its normal (radians) */
  roll?: number
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

export interface RingState {
  c: THREE.Vector3
  n: THREE.Vector3
  rx: number
  ry: number
  sq: number
  roll: number
}

export function interpRing(keys: RingKey[], t: number, out?: RingState): RingState {
  const o = out ?? { c: new THREE.Vector3(), n: new THREE.Vector3(), rx: 0, ry: 0, sq: 2, roll: 0 }
  let k = 0
  while (k < keys.length - 2 && t > keys[k + 1].t) k++
  const k1 = keys[k], k2 = keys[k + 1]
  const k0 = keys[Math.max(0, k - 1)], k3 = keys[Math.min(keys.length - 1, k + 2)]
  const s = Math.min(1, Math.max(0, (t - k1.t) / Math.max(1e-6, k2.t - k1.t)))
  const f = (g: (r: RingKey) => number) => catmull(g(k0), g(k1), g(k2), g(k3), s)
  o.c.set(f((r) => r.c[0]), f((r) => r.c[1]), f((r) => r.c[2]))
  o.n.set(f((r) => r.n[0]), f((r) => r.n[1]), f((r) => r.n[2])).normalize()
  o.rx = f((r) => r.rx)
  o.ry = f((r) => r.ry)
  o.sq = f((r) => r.sq ?? 2)
  o.roll = f((r) => r.roll ?? 0)
  return o
}

/** Polar squircle radius (uniform angular spacing). */
export function squircleR(theta: number, a: number, b: number, n: number) {
  const c = Math.abs(Math.cos(theta)) / b, s = Math.abs(Math.sin(theta)) / a
  return 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n)
}

/**
 * Loft of rings. u goes around the ring (theta = 2πu, theta=0 along the reference axis),
 * v along the keys. ref is the world direction the ring's "ry" axis should face.
 */
export function ringLoftFn(
  keys: RingKey[],
  ref: THREE.Vector3,
  shape?: (theta: number, t: number, st: RingState) => { dr?: number; dx?: number; dy?: number },
): SurfaceFn {
  const st: RingState = { c: new THREE.Vector3(), n: new THREE.Vector3(), rx: 0, ry: 0, sq: 2, roll: 0 }
  const A = new THREE.Vector3(), B = new THREE.Vector3()
  const t0 = keys[0].t, t1 = keys[keys.length - 1].t
  return (u, v, out) => {
    const t = t0 + (t1 - t0) * v
    interpRing(keys, t, st)
    A.copy(ref).addScaledVector(st.n, -ref.dot(st.n)).normalize()
    B.crossVectors(st.n, A).normalize()
    if (st.roll) {
      const ca = Math.cos(st.roll), sa = Math.sin(st.roll)
      const ax = A.clone(), bx = B.clone()
      A.copy(ax).multiplyScalar(ca).addScaledVector(bx, sa)
      B.copy(bx).multiplyScalar(ca).addScaledVector(ax, -sa)
    }
    const th = u * Math.PI * 2
    let r = squircleR(th, 1, 1, st.sq)
    let ox = 0, oy = 0
    if (shape) {
      const m = shape(th, t, st)
      if (m.dr) r += m.dr
      if (m.dx) ox = m.dx
      if (m.dy) oy = m.dy
    }
    const x = Math.sin(th) * r * st.rx + ox
    const y = Math.cos(th) * r * st.ry + oy
    out.copy(st.c).addScaledVector(B, x).addScaledVector(A, y)
  }
}

// ---------------------------------------------------------------------------------------------
// Tubes, cords, stitches

export function curveTube(points: THREE.Vector3[], radius: number | ((t: number) => number), opts: { closed?: boolean; seg?: number; radial?: number; uvScale?: number } = {}) {
  const closed = opts.closed ?? false
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal')
  const seg = opts.seg ?? Math.max(8, points.length * 3)
  const radial = opts.radial ?? 8
  const frames = curve.computeFrenetFrames(seg, closed)
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = []
  const len = curve.getLength()
  const P = new THREE.Vector3(), N = new THREE.Vector3()
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    curve.getPointAt(t, P)
    const r = typeof radius === 'function' ? radius(t) : radius
    const fi = closed && i === seg ? 0 : i
    const nn = frames.normals[fi], bb = frames.binormals[fi]
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      N.copy(nn).multiplyScalar(Math.cos(a)).addScaledVector(bb, Math.sin(a))
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r)
      nrm.push(N.x, N.y, N.z)
      uv.push(t * len * (opts.uvScale ?? 1), j / radial)
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Resample a polyline to evenly spaced points (n points). */
export function resample(points: THREE.Vector3[], n: number, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal')
  return curve.getSpacedPoints(closed ? n : n - 1).slice(0, closed ? n : n)
}

// ---------------------------------------------------------------------------------------------
// Projection onto meshes (lay pockets/lapels/cords onto a surface)

export class Projector {
  bvh: MeshBVH
  geom: THREE.BufferGeometry
  private ray = new THREE.Ray()
  private tri = new THREE.Triangle()
  private na = new THREE.Vector3()
  private nb = new THREE.Vector3()
  private nc = new THREE.Vector3()
  private bary = new THREE.Vector3()

  constructor(geom: THREE.BufferGeometry) {
    this.geom = geom
    this.bvh = new MeshBVH(geom)
  }

  /** Cast from origin along dir; returns hit point and interpolated normal (facing against dir). */
  cast(origin: THREE.Vector3, dir: THREE.Vector3, outP: THREE.Vector3, outN: THREE.Vector3): boolean {
    this.ray.origin.copy(origin)
    this.ray.direction.copy(dir).normalize()
    const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide)
    if (!hit || !hit.face) return false
    outP.copy(hit.point)
    const nAttr = this.geom.getAttribute('normal') as THREE.BufferAttribute
    const pAttr = this.geom.getAttribute('position') as THREE.BufferAttribute
    const { a, b, c } = hit.face
    this.tri.a.fromBufferAttribute(pAttr, a)
    this.tri.b.fromBufferAttribute(pAttr, b)
    this.tri.c.fromBufferAttribute(pAttr, c)
    this.tri.getBarycoord(hit.point, this.bary)
    this.na.fromBufferAttribute(nAttr, a)
    this.nb.fromBufferAttribute(nAttr, b)
    this.nc.fromBufferAttribute(nAttr, c)
    outN.set(0, 0, 0)
      .addScaledVector(this.na, this.bary.x)
      .addScaledVector(this.nb, this.bary.y)
      .addScaledVector(this.nc, this.bary.z)
      .normalize()
    if (outN.dot(this.ray.direction) > 0) outN.negate()
    return true
  }
}

/** Build a SurfaceFn that projects a 2D parametric patch onto a mesh. */
export function projectedPatchFn(
  proj: Projector,
  map: (s: number, t: number) => { o: THREE.Vector3; d: THREE.Vector3; off: number },
): SurfaceFn {
  const P = new THREE.Vector3(), N = new THREE.Vector3()
  return (s, t, out) => {
    const m = map(s, t)
    if (proj.cast(m.o, m.d, P, N)) out.copy(P).addScaledVector(N, m.off)
    else out.copy(m.o)
  }
}

export function lathe(profile: [number, number][], seg = 24) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg)
}

/** Orient an object so its +Y axis points along n. */
export function alignY(obj: THREE.Object3D, n: THREE.Vector3) {
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize())
}
