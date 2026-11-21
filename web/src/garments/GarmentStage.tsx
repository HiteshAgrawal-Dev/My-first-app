import { useLayoutEffect, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { Environment, Lightformer, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'

export interface GarmentStageProps {
  children?: ReactNode
  /** soft contact shadow under the garment */
  shadow?: boolean
  /** y of the contact shadow plane */
  shadowY?: number
  shadowOpacity?: number
  /** overall light multiplier */
  intensity?: number
  /** 'studio' = e-commerce softbox; 'dramatic' = low-key editorial with strong champagne rim */
  mood?: 'studio' | 'dramatic'
  /** apply Khronos-neutral tone mapping + exposure to the renderer (default true) */
  toneMapping?: boolean
  exposure?: number
  /** cast shadow-mapped self shadows from the key light (default true) */
  shadows?: boolean
}

const CHAMPAGNE = '#d9b98c'

/**
 * Luxury studio lighting for garments: key softbox, warm champagne rim, cool fill, an environment
 * generated from Lightformers (no HDR downloads) and a contact shadow.
 */
export function GarmentStage({
  children,
  shadow = true,
  shadowY = -0.5,
  shadowOpacity = 0.42,
  intensity = 1,
  mood = 'studio',
  toneMapping = true,
  exposure = 1,
  shadows = true,
}: GarmentStageProps) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    if (!toneMapping) return
    const prevTM = gl.toneMapping, prevExp = gl.toneMappingExposure
    gl.toneMapping = THREE.NeutralToneMapping
    gl.toneMappingExposure = exposure
    if (shadows) {
      gl.shadowMap.enabled = true
      gl.shadowMap.type = THREE.PCFSoftShadowMap
    }
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m) m.needsUpdate = true
    })
    return () => {
      gl.toneMapping = prevTM
      gl.toneMappingExposure = prevExp
    }
  }, [gl, scene, toneMapping, exposure, shadows])

  const d = mood === 'dramatic'
  const k = intensity
  return (
    <>
      <hemisphereLight args={['#f4ece2', '#1a1218', (d ? 0.06 : 0.16) * k]} />
      {/* key softbox: high front-left, warm white */}
      <directionalLight
        position={[-3.0, 2.8, 2.3]}
        intensity={(d ? 2.2 : 2.9) * k}
        color="#fff3e6"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.035}
        shadow-radius={6}
        shadow-camera-left={-1.3}
        shadow-camera-right={1.3}
        shadow-camera-top={1.3}
        shadow-camera-bottom={-1.3}
        shadow-camera-near={0.5}
        shadow-camera-far={10}
      />
      {/* warm champagne rims from behind */}
      <directionalLight position={[2.8, 2.2, -2.6]} intensity={(d ? 3.6 : 2.8) * k} color={CHAMPAGNE} />
      <directionalLight position={[-3.0, 1.2, -2.2]} intensity={(d ? 1.8 : 1.5) * k} color="#e9d2b0" />
      {/* cool fill, front-right low */}
      <directionalLight position={[2.8, 0.3, 2.0]} intensity={(d ? 0.3 : 0.55) * k} color="#b9c6e4" />
      <Environment resolution={256} frames={1} environmentIntensity={(d ? 0.45 : 0.7) * k}>
        <color attach="background" args={['#0d0a0e']} />
        <Lightformer form="rect" intensity={2.2} color="#fff4e8" position={[-1.5, 3, 2.5]} scale={[4, 2.5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.4} color="#ffffff" position={[0, 4, 0]} scale={[3, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2.6} color={CHAMPAGNE} position={[3.2, 1.2, -2.2]} scale={[0.6, 4, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#a8b6d6" position={[-3.4, 0.6, -1.2]} scale={[0.8, 3.5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.7} color="#ffffff" position={[3, 0.2, 3]} scale={[1.5, 1.5, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.2} color={CHAMPAGNE} position={[0, 1.5, -4]} scale={2} target={[0, 0, 0]} />
      </Environment>
      {children}
      {shadow && (
        <ContactShadows position={[0, shadowY, 0]} opacity={shadowOpacity} scale={3} blur={2.8} far={1.2} resolution={512} color="#0a0608" />
      )}
    </>
  )
}

export default GarmentStage
