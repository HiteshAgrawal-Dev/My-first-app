import * as THREE from 'three'
import { Kit, makeMaterials, type GarmentTemplate, type GarmentType, type GarmentVariant, type MaterialSet } from './kit'
import type { FabricKind } from './materials'
import { bakeVertexAO, whiteVertexColors } from './ao'
import { buildHoodie } from './builders/hoodie'
import { buildTee } from './builders/tee'
import { buildCargo } from './builders/cargo'
import { buildPuffer } from './builders/puffer'
import { buildBlazer } from './builders/blazer'

export interface GarmentOptions {
  /** base fabric colour (hex) */
  color: string
  /** hardware / aglets / zips / toggles (hex). Defaults to champagne. */
  accent?: string
  /** 'high' ≈ 40–60k triangles with baked AO; 'low' ≈ ¼ of that */
  detail?: 'high' | 'low'
  /** construction variant (zip hoodie, cropped puffer, baby tee, …) */
  variant?: GarmentVariant
  /** override the default fabric for the garment type */
  fabric?: FabricKind
  /** bake vertex ambient occlusion (default: true) */
  ao?: boolean
}

export const GARMENT_TYPES: GarmentType[] = ['hoodie', 'tee', 'cargo', 'puffer', 'blazer', 'corset']

export const DEFAULT_FABRIC: Record<GarmentType, FabricKind> = {
  hoodie: 'loopback',
  tee: 'jersey',
  cargo: 'ripstop',
  puffer: 'nylon',
  blazer: 'wool',
  corset: 'crepe',
}

const RIB_FABRIC: Record<GarmentType, FabricKind> = {
  hoodie: 'rib',
  tee: 'rib',
  cargo: 'ripstop',
  puffer: 'rib',
  blazer: 'wool',
  corset: 'crepe',
}

/** Bounding height each garment is normalised to (units). */
export const GARMENT_HEIGHT: Record<GarmentType, number> = {
  hoodie: 0.9,
  tee: 0.9,
  cargo: 1.7,
  puffer: 0.9,
  blazer: 0.9,
  corset: 0.9,
}

const BUILDERS: Record<GarmentType, (k: Kit, v: GarmentVariant) => void> = {
  hoodie: buildHoodie,
  tee: buildTee,
  cargo: buildCargo,
  puffer: buildPuffer,
  blazer: (k, v) => buildBlazer(k, v, false),
  corset: (k, v) => buildBlazer(k, v, true),
}

const templateCache = new Map<string, GarmentTemplate>()
const MAX_TEMPLATES = 10

export function getGarmentTemplate(type: GarmentType, variant: GarmentVariant = 'default', detail: 'high' | 'low' = 'high', ao = true): GarmentTemplate {
  const key = `${type}|${variant}|${detail}|${ao}`
  const hit = templateCache.get(key)
  if (hit) {
    // refresh LRU order
    templateCache.delete(key)
    templateCache.set(key, hit)
    return hit
  }
  const k = new Kit(detail === 'high' ? 1 : 0.5)
  BUILDERS[type](k, variant)
  if (ao) bakeVertexAO(k.items, { rays: detail === 'high' ? 20 : 10 })
  else for (const it of k.items) if (!it.geometry.getAttribute('color')) whiteVertexColors(it.geometry)
  for (const it of k.items) {
    if (!it.geometry.getAttribute('color')) whiteVertexColors(it.geometry)
    it.geometry.computeBoundingSphere()
    it.geometry.userData.cached = true
  }

  const box = new THREE.Box3()
  for (const it of k.items) {
    it.geometry.computeBoundingBox()
    box.union(it.geometry.boundingBox!)
  }
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const scale = GARMENT_HEIGHT[type] / size.y
  let triangles = 0
  for (const it of k.items) triangles += (it.geometry.index ? it.geometry.index.count : it.geometry.getAttribute('position').count) / 3 * (it.interior ? 1 : 1)

  const tpl: GarmentTemplate = {
    type,
    items: k.items,
    explode: k.explode,
    scale,
    offset: center.multiplyScalar(-1),
    fabric: DEFAULT_FABRIC[type],
    ribFabric: RIB_FABRIC[type],
    triangles: Math.round(triangles),
  }
  templateCache.set(key, tpl)
  while (templateCache.size > MAX_TEMPLATES) {
    const first = templateCache.keys().next().value as string
    const old = templateCache.get(first)!
    templateCache.delete(first)
    for (const it of old.items) it.geometry.dispose()
  }
  return tpl
}

export interface GarmentUserData {
  type: GarmentType
  parts: Record<string, THREE.Group>
  explode: Record<string, THREE.Vector3>
  materials: MaterialSet
  triangles: number
}

/**
 * Build a floating "ghost mannequin" garment, centred at the origin, facing +Z.
 * Tops are ~0.9 units tall, trousers ~1.7.
 */
export function buildGarment(type: GarmentType, opts: GarmentOptions): THREE.Group {
  const detail = opts.detail ?? 'high'
  const tpl = getGarmentTemplate(type, opts.variant ?? 'default', detail, opts.ao ?? true)
  const fabric = opts.fabric ?? tpl.fabric
  const ribFabric = opts.fabric && (opts.fabric === 'velour' || opts.fabric === 'silkVelvet') ? tpl.ribFabric : tpl.ribFabric
  const mats = makeMaterials(opts.color, opts.accent ?? '#d9b98c', fabric, ribFabric, type)

  const root = new THREE.Group()
  root.name = `garment-${type}`
  const inner = new THREE.Group()
  inner.name = 'garment-inner'
  inner.scale.setScalar(tpl.scale)
  inner.position.copy(tpl.offset).multiplyScalar(tpl.scale)
  root.add(inner)

  const parts: Record<string, THREE.Group> = {}
  const partFor = (name: string) => {
    let g = parts[name]
    if (!g) {
      g = new THREE.Group()
      g.name = name
      parts[name] = g
      inner.add(g)
    }
    return g
  }
  for (const it of tpl.items) {
    const g = partFor(it.part)
    const mat = mats[it.mat]
    const mesh = new THREE.Mesh(it.geometry, mat)
    mesh.castShadow = it.castShadow ?? true
    mesh.receiveShadow = true
    if (it.matrix) {
      mesh.matrixAutoUpdate = false
      mesh.matrix.copy(it.matrix)
    }
    g.add(mesh)
    if (it.interior) {
      const inside = new THREE.Mesh(it.geometry, mats.interior)
      inside.castShadow = false
      inside.receiveShadow = true
      g.add(inside)
    }
  }
  const explode: Record<string, THREE.Vector3> = {}
  for (const [k, v] of Object.entries(tpl.explode)) explode[k] = v.clone()
  const ud: GarmentUserData = { type, parts, explode, materials: mats, triangles: tpl.triangles }
  root.userData = ud
  return root
}

/** Dispose materials/textures of a garment (cached geometries are kept for reuse). */
export function disposeGarment(root: THREE.Object3D) {
  const seen = new Set<THREE.Material>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    if (!m.geometry.userData.cached) m.geometry.dispose()
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      if (seen.has(mat)) continue
      seen.add(mat)
      const anyMat = mat as THREE.MeshPhysicalMaterial
      anyMat.normalMap?.dispose()
      mat.dispose()
    }
  })
}

/** Move exploded parts outward (0 = assembled, 1 = fully exploded). */
export function setGarmentExplode(root: THREE.Object3D, amount: number) {
  const ud = root.userData as GarmentUserData
  if (!ud?.parts) return
  for (const [name, g] of Object.entries(ud.parts)) {
    const d = ud.explode[name]
    if (!d) continue
    g.position.copy(d).multiplyScalar(amount)
  }
}
