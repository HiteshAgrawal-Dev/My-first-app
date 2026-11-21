import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, Float } from '@react-three/drei'
import * as THREE from 'three'
import { GarmentModel } from '../garments'

/** Hero: the flagship hoodie floats in a champagne spotlight, tilts toward the cursor and turns as you scroll. */
function Rig({ type, color, progress }: { type: string; color: string; progress: React.MutableRefObject<number> }) {
  const g = useRef<THREE.Group>(null!)
  const mouse = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const on = (e: PointerEvent) => { mouse.current.x = (e.clientX / innerWidth) * 2 - 1; mouse.current.y = (e.clientY / innerHeight) * 2 - 1 }
    addEventListener('pointermove', on, { passive: true })
    return () => removeEventListener('pointermove', on)
  }, [])
  useFrame((state, dt) => {
    const p = progress.current
    const t = state.clock.elapsedTime
    const targetY = t * 0.25 + p * Math.PI * 1.2 + mouse.current.x * 0.35
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, targetY, 4, dt)
    g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, mouse.current.y * 0.12, 4, dt)
    g.current.position.y = THREE.MathUtils.damp(g.current.position.y, -p * 1.2, 5, dt)
    const base = state.size.width / state.size.height < 0.9 ? 1.3 : 0.86
    const s = base - p * 0.2
    g.current.scale.setScalar(THREE.MathUtils.damp(g.current.scale.x, s, 5, dt))
    state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, mouse.current.x * 0.3, 2, dt)
    state.camera.lookAt(0, 0, 0)
  })
  return (
    <group ref={g}>
      <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.35}>
        <GarmentModel type={type as any} color={color} />
      </Float>
    </group>
  )
}

export default function HeroStage({ type = 'hoodie', color = '#15121a', progress }: { type?: string; color?: string; progress: React.MutableRefObject<number> }) {
  return (
    <Canvas className="hero__canvas" dpr={[1, 1.75]} camera={{ position: [0, 0.05, 2.6], fov: 32 }} gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}>
      <ambientLight intensity={0.15} />
      <spotLight position={[2.5, 4, 3]} angle={0.45} penumbra={0.9} intensity={60} color="#f3dcb4" />
      <spotLight position={[-3, 1.5, -2]} angle={0.6} penumbra={1} intensity={40} color="#9fb2d6" />
      <pointLight position={[0, -1.5, 1.5]} intensity={3} color="#5c1428" />
      <Suspense fallback={null}>
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={3} color="#f6e3c3" position={[3, 3, 3]} scale={[4, 2, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.5} color="#a9b8d8" position={[-4, 1, -2]} scale={[3, 4, 1]} target={[0, 0, 0]} />
          <Lightformer form="ring" intensity={2} color="#d9b98c" position={[0, 4, -4]} scale={3} target={[0, 0, 0]} />
        </Environment>
        <Rig type={type} color={color} progress={progress} />
      </Suspense>
    </Canvas>
  )
}
