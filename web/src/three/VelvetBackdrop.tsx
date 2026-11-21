import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import vert from './shaders/velvet.vert'
import frag from './shaders/velvet.frag'

/** Palette per page section — the cloth slowly re-dyes itself as you scroll. */
const PALETTES = [
  { base: '#e9e6e0', deep: '#c9c3ba', sheen: '#ffffff' }, // plaster silk
  { base: '#e8e1df', deep: '#c8b9b8', sheen: '#fff8f6' }, // blush plaster (women)
  { base: '#e2e4e6', deep: '#bfc3c8', sheen: '#ffffff' }, // tokyo concrete (lab)
  { base: '#e8e3da', deep: '#c6bba9', sheen: '#fffaf0' }, // sandstone (drops)
]

function Cloth({ tone }: { tone: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const { viewport } = useThree()
  const mouse = useRef(new THREE.Vector2(0, 0))
  const target = useRef(new THREE.Vector2(0, 0))
  const cols = useMemo(() => PALETTES.map((p) => ({ base: new THREE.Color(p.base), deep: new THREE.Color(p.deep), sheen: new THREE.Color(p.sheen) })), [])
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uScroll: { value: 0 }, uMouse: { value: new THREE.Vector2() },
    uBase: { value: cols[0].base.clone() }, uDeep: { value: cols[0].deep.clone() }, uSheen: { value: cols[0].sheen.clone() },
  }), [cols])

  useEffect(() => {
    const on = (e: PointerEvent) => target.current.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1))
    addEventListener('pointermove', on, { passive: true })
    return () => removeEventListener('pointermove', on)
  }, [])

  useFrame((_, dt) => {
    const u = mat.current.uniforms
    u.uTime.value += Math.min(dt, 0.05)
    u.uScroll.value = scrollY / innerHeight
    mouse.current.lerp(target.current, 0.04)
    u.uMouse.value.copy(mouse.current)
    const c = cols[Math.max(0, Math.min(cols.length - 1, tone))]
    u.uBase.value.lerp(c.base, 0.03); u.uDeep.value.lerp(c.deep, 0.03); u.uSheen.value.lerp(c.sheen, 0.03)
  })

  const w = viewport.width * 1.35, h = viewport.height * 1.35
  return (
    <mesh rotation={[-0.18, 0, 0]} position={[0, 0, -1.2]}>
      <planeGeometry args={[w, h, 220, 140]} />
      <shaderMaterial toneMapped={false} ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} />
    </mesh>
  )
}

export default function VelvetBackdrop({ tone = 0 }: { tone?: number }) {
  return (
    <div className="velvet-backdrop" aria-hidden>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
        <Cloth tone={tone} />
      </Canvas>
    </div>
  )
}
