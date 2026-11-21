import * as THREE from 'three'
import { fabricNormalMap, stitchAlphaMap, type WeaveKind } from './textures'

export type FabricKind =
  | 'loopback' // heavyweight loopback cotton (hoodies)
  | 'velour' // velour-faced cotton
  | 'terry' // french terry
  | 'jersey' // cotton jersey (tees)
  | 'rib' // rib knit (baby tee, cuffs, hems)
  | 'ripstop' // ripstop nylon (cargos)
  | 'nylon' // puffer shell, matte-satin
  | 'satin' // satin-sheen nylon
  | 'iridescent' // iridescent nylon
  | 'wool' // wool twill (blazers)
  | 'gabardine'
  | 'crepe' // wool crepe (corset)
  | 'silkVelvet'

interface FabricSpec {
  weave: WeaveKind
  tile: number // texture tile size in metres
  normalScale: number
  roughness: number
  sheen: number
  sheenRoughness: number
  /** how much lighter the sheen colour is than the base (0..1) */
  sheenLift: number
  clearcoat?: number
  clearcoatRoughness?: number
  iridescence?: number
  specularIntensity?: number
}

export const FABRICS: Record<FabricKind, FabricSpec> = {
  loopback: { weave: 'cotton', tile: 0.12, normalScale: 0.35, roughness: 0.9, sheen: 1, sheenRoughness: 0.55, sheenLift: 0.35, specularIntensity: 0.35 },
  velour: { weave: 'velvet', tile: 0.18, normalScale: 0.35, roughness: 0.95, sheen: 1, sheenRoughness: 0.32, sheenLift: 0.6, specularIntensity: 0.25 },
  terry: { weave: 'cotton', tile: 0.1, normalScale: 0.3, roughness: 0.88, sheen: 0.9, sheenRoughness: 0.5, sheenLift: 0.32, specularIntensity: 0.35 },
  jersey: { weave: 'cotton', tile: 0.1, normalScale: 0.28, roughness: 0.85, sheen: 0.7, sheenRoughness: 0.55, sheenLift: 0.25, specularIntensity: 0.4 },
  rib: { weave: 'rib', tile: 0.12, normalScale: 0.32, roughness: 0.82, sheen: 0.8, sheenRoughness: 0.5, sheenLift: 0.28, specularIntensity: 0.4 },
  ripstop: { weave: 'ripstop', tile: 0.045, normalScale: 0.3, roughness: 0.55, sheen: 0.35, sheenRoughness: 0.45, sheenLift: 0.2, clearcoat: 0.18, clearcoatRoughness: 0.5, specularIntensity: 0.6 },
  nylon: { weave: 'nylon', tile: 0.22, normalScale: 0.35, roughness: 0.48, sheen: 0.3, sheenRoughness: 0.4, sheenLift: 0.2, clearcoat: 0.45, clearcoatRoughness: 0.38, specularIntensity: 0.7 },
  satin: { weave: 'nylon', tile: 0.25, normalScale: 0.25, roughness: 0.3, sheen: 0.4, sheenRoughness: 0.3, sheenLift: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.2, specularIntensity: 0.9 },
  iridescent: { weave: 'nylon', tile: 0.22, normalScale: 0.3, roughness: 0.42, sheen: 0.35, sheenRoughness: 0.35, sheenLift: 0.25, clearcoat: 0.5, clearcoatRoughness: 0.3, iridescence: 0.55, specularIntensity: 0.9 },
  wool: { weave: 'twill', tile: 0.06, normalScale: 0.4, roughness: 0.82, sheen: 0.55, sheenRoughness: 0.5, sheenLift: 0.22, specularIntensity: 0.45 },
  gabardine: { weave: 'gabardine', tile: 0.05, normalScale: 0.35, roughness: 0.72, sheen: 0.5, sheenRoughness: 0.45, sheenLift: 0.22, specularIntensity: 0.5 },
  crepe: { weave: 'crepe', tile: 0.05, normalScale: 0.4, roughness: 0.86, sheen: 0.45, sheenRoughness: 0.55, sheenLift: 0.2, specularIntensity: 0.4 },
  silkVelvet: { weave: 'velvet', tile: 0.16, normalScale: 0.3, roughness: 0.92, sheen: 1, sheenRoughness: 0.3, sheenLift: 0.5, specularIntensity: 0.3 },
}

function lift(c: THREE.Color, amt: number) {
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  const out = new THREE.Color()
  // dark colours need a stronger lift for the velvet "glow"; light colours sheen toward white
  const l = hsl.l + (1 - hsl.l) * amt
  out.setHSL(hsl.h, Math.min(1, hsl.s * 0.5 + 0.03), l)
  return out
}

export interface FabricMaterialOpts {
  color: string
  fabric: FabricKind
  /** multiply on texture tile (finer < 1) */
  tileScale?: number
  side?: THREE.Side
  vertexColors?: boolean
  normalScale?: number
}

export function fabricMaterial(o: FabricMaterialOpts): THREE.MeshPhysicalMaterial {
  const spec = FABRICS[o.fabric]
  const base = new THREE.Color(o.color)
  const nmap = fabricNormalMap(spec.weave).clone()
  nmap.needsUpdate = true
  const rep = 1 / (spec.tile * (o.tileScale ?? 1))
  nmap.repeat.set(rep, rep)
  const ns = (o.normalScale ?? 1) * spec.normalScale
  const m = new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: spec.roughness,
    metalness: 0,
    sheen: spec.sheen,
    sheenColor: lift(base, spec.sheenLift),
    sheenRoughness: spec.sheenRoughness,
    normalMap: nmap,
    normalScale: new THREE.Vector2(ns, ns),
    clearcoat: spec.clearcoat ?? 0,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0.3,
    iridescence: spec.iridescence ?? 0,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [180, 520],
    specularIntensity: spec.specularIntensity ?? 0.5,
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
  })
  m.userData.fabric = o.fabric
  return m
}

/** Inside of the garment: darker, flat, no sheen — reads as cavity/thickness. */
export function interiorMaterial(color: string, fabric: FabricKind) {
  const base = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  base.getHSL(hsl)
  const c = new THREE.Color().setHSL(hsl.h, hsl.s * 0.8, hsl.l * 0.42)
  const spec = FABRICS[fabric]
  const nmap = fabricNormalMap(spec.weave === 'velvet' ? 'velvet' : 'knit').clone()
  nmap.needsUpdate = true
  nmap.repeat.set(20, 20)
  return new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.95,
    sheen: 0.4,
    sheenColor: c.clone().multiplyScalar(1.6),
    sheenRoughness: 0.6,
    specularIntensity: 0.15,
    normalMap: nmap,
    normalScale: new THREE.Vector2(0.3, 0.3),
    side: THREE.BackSide,
  })
}

/** Thread for topstitching (dashed via alpha test). */
export function stitchMaterial(color: string, amount = 0.18) {
  const base = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  base.getHSL(hsl)
  const c = new THREE.Color().setHSL(hsl.h, hsl.s * 0.85, Math.min(0.92, hsl.l + amount * (hsl.l < 0.5 ? 1.1 : -0.6)))
  const a = stitchAlphaMap()
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.75,
    alphaMap: a,
    alphaTest: 0.5,
    transparent: false,
  })
}

export function hardwareMaterial(color: string, metal = true) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: metal ? 1 : 0,
    roughness: metal ? 0.28 : 0.45,
    clearcoat: metal ? 0.4 : 0.6,
    clearcoatRoughness: 0.2,
  })
}

/** Variant of the fabric colour (e.g. slightly darker rib). */
export function shade(color: string, l = 0, s = 0) {
  const c = new THREE.Color(color)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, Math.min(1, Math.max(0, hsl.s + s)), Math.min(1, Math.max(0, hsl.l + l)))
  return '#' + c.getHexString()
}
