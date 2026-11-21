import { useMemo } from 'react'
import * as THREE from 'three'
import { buildSurface } from './geometry'
import { Noise3 } from './noise'
import { fabricNormalMap } from './textures'

const n3 = new Noise3(77)

export function velvetMaterial(color = '#1b111c', sheen = '#6b4a5e') {
  const nm = fabricNormalMap('velvet').clone()
  nm.needsUpdate = true
  nm.repeat.set(4, 4)
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.95,
    sheen: 1,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.35,
    specularIntensity: 0.2,
    normalMap: nm,
    normalScale: new THREE.Vector2(0.4, 0.4),
  })
}

/** Heavy velvet curtain backdrop (vertical folds) + soft floor. */
export function VelvetDrape({ z = -1.6, width = 7, height = 4.5, y = 0.6, color = '#1d111d', sheen = '#7a5468', floor = true }: { z?: number; width?: number; height?: number; y?: number; color?: string; sheen?: string; floor?: boolean }) {
  const { geo, mat, floorMat } = useMemo(() => {
    const s = buildSurface(
      (u, v, out) => {
        const x = (u - 0.5) * width
        const yy = (v - 0.5) * height
        const fold = Math.sin(x * 4.2 + n3.noise(x * 0.6, yy * 0.25, 0) * 2.5) * 0.11 + Math.sin(x * 9.1 + 1.3) * 0.03
        out.set(x, yy, fold * (0.75 + 0.25 * v) + n3.noise(x * 1.5, yy * 0.8, 3) * 0.04)
      },
      { nu: 220, nv: 40, orientDir: new THREE.Vector3(0, 0, 1) },
    )
    const g = s.geometry()
    const fm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#0f0a10'), roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color('#3b2433'), sheenRoughness: 0.5 })
    return { geo: g, mat: velvetMaterial(color, sheen), floorMat: fm }
  }, [width, height, color, sheen])
  return (
    <group>
      <mesh geometry={geo} material={mat} position={[0, y, z]} receiveShadow />
      {floor && (
        <mesh rotation-x={-Math.PI / 2} position={[0, -1.2, 0]} material={floorMat} receiveShadow>
          <planeGeometry args={[20, 20]} />
        </mesh>
      )}
    </group>
  )
}

export interface TimeRef { t: number }

// Film + scroll-sequence scenes live in film.tsx (kept separate so the product viewer bundle stays lean).
export { FilmScene, SeqScene } from './film'
