import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { GarmentModel } from '../garments'
import { LITE } from '../lib/perf'

/** Drag-to-rotate 3D viewer for the product page and the Try-On Lab. */
export default function ProductViewer({ type, color, autoRotate = true }: { type: string; color: string; autoRotate?: boolean }) {
  const tall = type === 'cargo'
  return (
    <Canvas dpr={LITE ? 1 : [1, 2]} camera={{ position: [0, 0.1, tall ? 3.6 : 2.4], fov: 32 }} gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}>
      <ambientLight intensity={0.25} />
      <spotLight position={[2.5, 4, 3]} angle={0.5} penumbra={0.9} intensity={55} color="#f3dcb4" />
      <spotLight position={[-3, 2, -2]} angle={0.6} penumbra={1} intensity={30} color="#9fb2d6" />
      <Suspense fallback={null}>
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={3} color="#f6e3c3" position={[3, 3, 3]} scale={[4, 2, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.4} color="#a9b8d8" position={[-4, 1, -2]} scale={[3, 4, 1]} target={[0, 0, 0]} />
        </Environment>
        <GarmentModel type={type as any} color={color} detail={LITE ? 'low' : 'high'} />
        <ContactShadows position={[0, tall ? -0.95 : -0.62, 0]} opacity={0.55} scale={3} blur={2.6} far={1.5} color="#000" />
      </Suspense>
      <OrbitControls enablePan={false} minDistance={1.4} maxDistance={5} autoRotate={autoRotate} autoRotateSpeed={1.2} enableDamping />
    </Canvas>
  )
}
