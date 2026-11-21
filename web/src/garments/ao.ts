import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { mergePositions, type TemplateItem } from './kit'

/**
 * Bakes per-vertex ambient occlusion for all fabric surfaces of a garment into a `color`
 * attribute (multiplied into the material via vertexColors). Deterministic and view-independent,
 * so a garment looks grounded in any viewer — even without screen-space AO.
 */
export function bakeVertexAO(items: TemplateItem[], opts: { rays?: number; dist?: number; strength?: number } = {}) {
  const rays = opts.rays ?? 20
  const dist = opts.dist ?? 0.11
  const strength = opts.strength ?? 0.85
  const occluders = items.filter((it) => it.mat !== 'stitch' && it.mat !== 'stitchContrast')
  const merged = mergePositions(occluders.map((it) => it.geometry), occluders.map((it) => it.matrix))
  const bvh = new MeshBVH(merged)

  // cosine-weighted hemisphere directions (Fibonacci spiral), in tangent space
  const dirs: THREE.Vector3[] = []
  const ga = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < rays; i++) {
    const r = Math.sqrt((i + 0.5) / rays)
    const a = i * ga
    dirs.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(Math.max(0, 1 - r * r))))
  }

  const ray = new THREE.Ray()
  const p = new THREE.Vector3(), n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3()
  const up = new THREE.Vector3()
  for (const it of items) {
    if (!(it.mat === 'fabric' || it.mat === 'rib' || it.mat === 'trim' || it.mat === 'lining')) continue
    const g = it.geometry
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute
    if (!nrm) continue
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i)
      n.fromBufferAttribute(nrm, i)
      if (it.matrix) {
        p.applyMatrix4(it.matrix)
        n.transformDirection(it.matrix)
      }
      up.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0)
      t1.crossVectors(up, n).normalize()
      t2.crossVectors(n, t1)
      let occ = 0
      ray.origin.copy(p).addScaledVector(n, 0.0018)
      for (let k = 0; k < rays; k++) {
        const d = dirs[k]
        ray.direction.set(0, 0, 0).addScaledVector(t1, d.x).addScaledVector(t2, d.y).addScaledVector(n, d.z).normalize()
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, dist)
        if (hit) occ += 1 - Math.pow(hit.distance / dist, 0.7)
      }
      const ao = 1 - strength * (occ / rays)
      const c = 0.25 + 0.75 * Math.max(0, ao)
      col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  merged.dispose()
}

export function whiteVertexColors(g: THREE.BufferGeometry) {
  const n = g.getAttribute('position').count
  const col = new Float32Array(n * 3).fill(1)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
}
