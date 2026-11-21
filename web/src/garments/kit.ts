import * as THREE from 'three'
import { Surface, curveTube, Projector } from './geometry'
import { fabricMaterial, interiorMaterial, stitchMaterial, hardwareMaterial, shade, type FabricKind } from './materials'

export type GarmentType = 'hoodie' | 'tee' | 'cargo' | 'puffer' | 'blazer' | 'corset'
export type GarmentVariant =
  | 'default'
  | 'zip' // zip-through hoodie
  | 'cocoon' // oversized cocoon hoodie
  | 'cropped' // cropped puffer / baby tee
  | 'fitted' // fitted baby tee
  | 'wide' // wide-leg cargo

export type MatKey = 'fabric' | 'rib' | 'trim' | 'lining' | 'hardware' | 'cord' | 'accent' | 'dark' | 'stitch' | 'stitchContrast' | 'logo' | 'cavity'

/** A geometry + material slot + part, before materials are instantiated. */
export interface TemplateItem {
  part: string
  geometry: THREE.BufferGeometry
  mat: MatKey
  interior?: boolean
  castShadow?: boolean
  matrix?: THREE.Matrix4
}

export interface GarmentTemplate {
  type: GarmentType
  items: TemplateItem[]
  /** explode directions per part, in local garment units */
  explode: Record<string, THREE.Vector3>
  scale: number
  offset: THREE.Vector3
  fabric: FabricKind
  ribFabric: FabricKind
  triangles: number
}

export class Kit {
  items: TemplateItem[] = []
  explode: Record<string, THREE.Vector3> = {}
  q: number
  constructor(q: number) {
    this.q = q
  }

  n(base: number, min = 6) {
    return Math.max(min, Math.round(base * this.q))
  }

  surface(part: string, s: Surface, mat: MatKey = 'fabric', interior = true) {
    const g = s.geometry()
    this.items.push({ part, geometry: g, mat, interior })
    return g
  }

  geom(part: string, g: THREE.BufferGeometry, mat: MatKey, castShadow = true) {
    this.items.push({ part, geometry: g, mat, castShadow })
    return g
  }

  /** Dashed topstitch along a polyline. dash length in metres. */
  stitch(part: string, pts: THREE.Vector3[], opts: { closed?: boolean; r?: number; dash?: number; contrast?: boolean } = {}) {
    if (pts.length < 2) return
    const dash = opts.dash ?? 0.0055
    const g = curveTube(pts, opts.r ?? 0.0011, {
      closed: opts.closed,
      seg: Math.max(12, Math.round(this.lenOf(pts) / 0.007)),
      radial: 3,
      uvScale: 1 / dash,
    })
    this.items.push({ part, geometry: g, mat: opts.contrast ? 'stitchContrast' : 'stitch', castShadow: false })
  }

  /** Rolled edge (fabric thickness) along a polyline. */
  rim(part: string, pts: THREE.Vector3[], r: number, opts: { closed?: boolean; mat?: MatKey; radial?: number } = {}) {
    const g = curveTube(pts, r, {
      closed: opts.closed,
      seg: Math.max(16, Math.round(this.lenOf(pts) / 0.008)),
      radial: opts.radial ?? 7,
    })
    this.items.push({ part, geometry: g, mat: opts.mat ?? 'trim', castShadow: true })
    return g
  }

  lenOf(pts: THREE.Vector3[]) {
    let l = 0
    for (let i = 1; i < pts.length; i++) l += pts[i].distanceTo(pts[i - 1])
    return l
  }

  setExplode(part: string, dir: [number, number, number]) {
    this.explode[part] = new THREE.Vector3(...dir)
  }

  /** Dark cap hidden inside an opening so you never see through the garment. */
  cavity(part: string, c: THREE.Vector3, rx: number, rz: number, normal = new THREE.Vector3(0, 1, 0)) {
    const g = new THREE.CircleGeometry(1, 32)
    g.scale(rx, rz, 1)
    const m = new THREE.Object3D()
    m.position.copy(c)
    m.lookAt(c.clone().add(normal))
    m.updateMatrix()
    g.applyMatrix4(m.matrix)
    this.items.push({ part, geometry: g, mat: 'cavity', castShadow: false })
  }

  /** Point on a body-like surface at angle θ (0 = front, π/2 = +X) and height y, via a horizontal ray toward the axis. */
  static pointAt(proj: Projector, th: number, y: number, off: number, axisZ = 0, out = new THREE.Vector3(), nOut = new THREE.Vector3()) {
    const o = new THREE.Vector3(Math.sin(th) * 2, y, Math.cos(th) * 2 + axisZ)
    const d = new THREE.Vector3(-Math.sin(th), 0, -Math.cos(th))
    if (!proj.cast(o, d, out, nOut)) return null
    return out.addScaledVector(nOut, off)
  }

  /** Horizontal ring of points around a body at height y(θ). */
  static ringAt(proj: Projector, y: (th: number) => number, off: number, th0 = 0, th1 = Math.PI * 2, n = 120, axisZ = 0) {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= n; i++) {
      const th = th0 + (th1 - th0) * (i / n)
      const p = Kit.pointAt(proj, th, y(th), off, axisZ)
      if (p) pts.push(p.clone())
    }
    return pts
  }

  /** Projector for laying details on everything built so far for a part (or given geometries). */
  projector(parts: string[]) {
    const gs = this.items.filter((it) => parts.includes(it.part) && it.interior !== undefined).map((it) => it.geometry)
    const merged = mergePositions(gs)
    return new Projector(merged)
  }
}

export function mergePositions(gs: THREE.BufferGeometry[], matrices?: (THREE.Matrix4 | undefined)[]) {
  let nv = 0, ni = 0
  for (const g of gs) {
    nv += g.getAttribute('position').count
    ni += g.index ? g.index.count : g.getAttribute('position').count
  }
  const pos = new Float32Array(nv * 3)
  const nrm = new Float32Array(nv * 3)
  const idx = new Uint32Array(ni)
  let vo = 0, io = 0
  const v = new THREE.Vector3()
  const nm = new THREE.Matrix3()
  gs.forEach((g, gi) => {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const n = g.getAttribute('normal') as THREE.BufferAttribute
    const m = matrices?.[gi]
    if (m) nm.getNormalMatrix(m)
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      if (m) v.applyMatrix4(m)
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z
      if (n) {
        v.fromBufferAttribute(n, i)
        if (m) v.applyMatrix3(nm).normalize()
        nrm[(vo + i) * 3] = v.x; nrm[(vo + i) * 3 + 1] = v.y; nrm[(vo + i) * 3 + 2] = v.z
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo
      io += g.index.count
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i
      io += p.count
    }
    vo += p.count
  })
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  return out
}

export interface MaterialSet {
  fabric: THREE.MeshPhysicalMaterial
  rib: THREE.MeshPhysicalMaterial
  trim: THREE.MeshPhysicalMaterial
  lining: THREE.MeshPhysicalMaterial
  interior: THREE.MeshPhysicalMaterial
  hardware: THREE.MeshPhysicalMaterial
  cord: THREE.MeshPhysicalMaterial
  accent: THREE.MeshPhysicalMaterial
  dark: THREE.MeshPhysicalMaterial
  stitch: THREE.MeshStandardMaterial
  stitchContrast: THREE.MeshStandardMaterial
  logo: THREE.MeshPhysicalMaterial
  cavity: THREE.MeshBasicMaterial
}

export function makeMaterials(color: string, accent: string, fabric: FabricKind, ribFabric: FabricKind, type: GarmentType): MaterialSet {
  const lum = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l
  const isDark = lum < 0.05
  const fabricM = fabricMaterial({ color, fabric, vertexColors: true })
  const rib = fabricMaterial({ color: shade(color, isDark ? 0.0 : -0.015), fabric: ribFabric, vertexColors: true })
  const trim = fabricMaterial({ color: shade(color, isDark ? 0.005 : -0.03), fabric, vertexColors: true, tileScale: 0.8 })
  trim.sheen *= 0.7
  trim.normalScale.multiplyScalar(0.4)
  const liningColor = type === 'blazer' || type === 'corset' ? shade(color, isDark ? 0.02 : -0.12, -0.05) : shade(color, -0.04)
  const lining = fabricMaterial({ color: liningColor, fabric: type === 'blazer' || type === 'corset' ? 'satin' : fabric, vertexColors: true })
  const interior = interiorMaterial(color, fabric)
  const hardware = hardwareMaterial(accent, true)
  const cord = fabricMaterial({ color: shade(color, isDark ? 0.03 : -0.03), fabric: 'rib', tileScale: 0.25, vertexColors: false })
  const accentM = hardwareMaterial(accent, false)
  const dark = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#0b090c'), roughness: 0.5, metalness: 0.2, clearcoat: 0.5 })
  const stitch = stitchMaterial(color, 0.12)
  const stitchContrast = stitchMaterial(color, 0.3)
  const logo = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(shade(color, isDark ? 0.05 : -0.06)),
    roughness: 0.55,
    sheen: 1,
    sheenColor: new THREE.Color(isDark ? '#a89a8a' : '#ffffff'),
    sheenRoughness: 0.3,
    transparent: false,
    alphaTest: 0.5,
  })
  const cavity = new THREE.MeshBasicMaterial({ color: interior.color.clone().multiplyScalar(0.35), side: THREE.DoubleSide })
  return { cavity, fabric: fabricM, rib, trim, lining, interior, hardware, cord, accent: accentM, dark, stitch, stitchContrast, logo }
}
