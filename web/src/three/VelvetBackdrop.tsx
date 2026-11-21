import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import vert from './shaders/velvet.vert'
import frag from './shaders/velvet.frag'

/** Palette per page section — the cloth slowly re-dyes itself as you scroll. */
const PALETTES = [
  { base: '#3a1f3d', deep: '#0b070b', sheen: '#d9b98c' }, // nocturne plum
  { base: '#5c1428', deep: '#0c0608', sheen: '#e8c49a' }, // oxblood
  { base: '#1d2233', deep: '#06070b', sheen: '#aeb9cc' }, // tokyo steel night
  { base: '#2b1a12', deep: '#080504', sheen: '#e2a868' }, // saffron dusk
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
      <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} />
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
