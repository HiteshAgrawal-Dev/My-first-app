import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type GroupProps } from '@react-three/fiber'
import type * as THREE from 'three'
import { buildGarment, disposeGarment, setGarmentExplode, type GarmentOptions } from './build'
import type { GarmentType, GarmentVariant } from './kit'
import type { FabricKind } from './materials'

export interface GarmentModelProps extends Omit<GroupProps, 'type'> {
  type: GarmentType
  color: string
  accent?: string
  detail?: 'high' | 'low'
  variant?: GarmentVariant
  fabric?: FabricKind
  /** true = 0.35 rad/s, or a number in rad/s */
  autoRotate?: boolean | number
  /** 0 = assembled … 1 = exploded into panels */
  explode?: number
}

/** R3F wrapper around buildGarment — memoised, disposes its materials on unmount/change. */
export function GarmentModel({ type, color, accent, detail = 'high', variant, fabric, autoRotate = false, explode = 0, ...rest }: GarmentModelProps) {
  const ref = useRef<THREE.Group>(null)
  const garment = useMemo(() => {
    const opts: GarmentOptions = { color, accent, detail, variant, fabric }
    return buildGarment(type, opts)
  }, [type, color, accent, detail, variant, fabric])

  useEffect(() => () => disposeGarment(garment), [garment])
  useEffect(() => setGarmentExplode(garment, explode), [garment, explode])

  useFrame((_, dt) => {
    if (!autoRotate || !ref.current) return
    const speed = typeof autoRotate === 'number' ? autoRotate : 0.35
    ref.current.rotation.y += speed * Math.min(dt, 0.1)
  })

  return (
    <group ref={ref} {...rest}>
      <primitive object={garment} />
    </group>
  )
}

export default GarmentModel
