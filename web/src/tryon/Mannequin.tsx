import { Suspense, useEffect, useMemo, useRef, type ComponentType } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { fitFactor, type GarmentMeta } from './fit-math'

export interface MannequinGarment {
  /** colour-tinted garment, cropped to its alpha bbox */
  canvas: HTMLCanvasElement
  /** crop offset of `canvas` inside the original image */
  ox: number
  oy: number
  meta: GarmentMeta
  garment: string
  fit: string
}

export interface MannequinProps {
  heightCm: number
  /** 0 slim · 1 athletic · 2 broad */
  build: number
  garment: MannequinGarment | null
  colorHex?: string
  reducedMotion?: boolean
  onCanvas?: (el: HTMLCanvasElement | null) => void
  /** Optional external 3D garment (from src/garments) — used instead of the printed overlay when present. */
  GarmentModel?: ComponentType<{ type: string; color: string }> | null
}

const BONE = '#e6dccb'

function lathe(profile: [number, number][], segments = 56): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)))
  const pts = curve.getPoints(80).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
  const g = new THREE.LatheGeometry(pts, segments)
  g.computeVertexNormals()
  return g
}

const TORSO: [number, number][] = [
  [0, 0.8],
  [0.11, 0.808],
  [0.152, 0.855],
  [0.163, 0.925],
  [0.148, 1.0],
  [0.132, 1.06],
  [0.142, 1.14],
  [0.158, 1.22],
  [0.163, 1.3],
  [0.152, 1.37],
  [0.115, 1.42],
  [0.055, 1.452],
  [0, 1.46],
]
const ARM: [number, number][] = [
  [0, 0.02],
  [0.05, -0.01],
  [0.047, -0.15],
  [0.039, -0.28],
  [0.034, -0.32],
  [0.037, -0.38],
  [0.029, -0.52],
  [0.024, -0.555],
  [0, -0.565],
]
const LEG: [number, number][] = [
  [0, 0.02],
  [0.084, -0.02],
  [0.079, -0.2],
  [0.058, -0.42],
  [0.054, -0.47],
  [0.05, -0.6],
  [0.034, -0.77],
  [0.028, -0.795],
  [0, -0.805],
]

function useBodyMaterial() {
  return useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: BONE,
        roughness: 0.58,
        metalness: 0,
        clearcoat: 0.22,
        clearcoatRoughness: 0.55,
        sheen: 0.35,
        sheenColor: new THREE.Color('#fff2dc'),
        sheenRoughness: 0.6,
      }),
    [],
  )
}

function Body({ bx }: { bx: number }) {
  const mat = useBodyMaterial()
  const geo = useMemo(
    () => ({ torso: lathe(TORSO), arm: lathe(ARM, 32), leg: lathe(LEG, 40) }),
    [],
  )
  useEffect(
    () => () => {
      geo.torso.dispose()
      geo.arm.dispose()
      geo.leg.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  const sx = 0.182 * bx
  return (
    <group>
      <mesh geometry={geo.torso} material={mat} scale={[1.16 * bx, 1, 0.66 * (0.94 + 0.06 * bx)]} castShadow />
      {/* shoulder caps */}
      {[-1, 1].map((s) => (
        <mesh key={`sh${s}`} position={[s * sx, 1.375, 0]} scale={[1, 0.9, 0.95]} material={mat} castShadow>
          <sphereGeometry args={[0.058, 32, 24]} />
        </mesh>
      ))}
      {/* neck + head */}
      <mesh position={[0, 1.5, 0]} material={mat} castShadow>
        <cylinderGeometry args={[0.044, 0.05, 0.13, 32]} />
      </mesh>
      <mesh position={[0, 1.655, 0.005]} scale={[0.86, 1.13, 0.97]} material={mat} castShadow>
        <sphereGeometry args={[0.1, 48, 36]} />
      </mesh>
      {/* arms */}
      {[-1, 1].map((s) => (
        <group key={`arm${s}`} position={[s * (sx + 0.012), 1.385, 0]} rotation={[0, 0, s * 0.11]}>
          <mesh geometry={geo.arm} material={mat} castShadow />
          <mesh position={[0, -0.6, 0.004]} scale={[0.62, 1.25, 0.42]} material={mat} castShadow>
            <sphereGeometry args={[0.045, 24, 18]} />
          </mesh>
        </group>
      ))}
      {/* legs */}
      {[-1, 1].map((s) => (
        <group key={`leg${s}`} position={[s * 0.088 * (0.95 + 0.05 * bx), 0.86, 0]}>
          <mesh geometry={geo.leg} material={mat} castShadow />
          <mesh position={[0, -0.82, 0.045]} scale={[0.9, 0.5, 2.1]} material={mat} castShadow>
            <sphereGeometry args={[0.042, 24, 18]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function GarmentShell({ g, bx }: { g: MannequinGarment; bx: number }) {
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(g.canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    t.needsUpdate = true
    return t
  }, [g.canvas])
  useEffect(() => () => tex.dispose(), [tex])

  const layout = useMemo(() => {
    const { meta } = g
    const span = Math.max(1, meta.spanR - meta.spanL)
    const cw = g.canvas.width,
      ch = g.canvas.height
    const anchorX = (meta.spanL + meta.spanR) / 2 - g.ox
    const anchorY = meta.anchorY - g.oy
    let k: number, anchorWorldY: number, baseR: number
    if (meta.kind === 'bottom') {
      const relaxed = /relaxed|oversize|wide/i.test(g.fit) ? 1.08 : 1
      k = (0.176 * (0.95 + 0.05 * bx) * 1.68 * relaxed) / span
      anchorWorldY = 0.92
      baseR = 0.2 * bx
    } else if (meta.kind === 'corset') {
      k = (0.38 * bx * 0.98) / span
      anchorWorldY = 1.25
      baseR = 0.19 * bx
    } else {
      k = (0.38 * bx * fitFactor(g.fit, g.garment)) / span
      anchorWorldY = 1.43
      baseR = 0.25 * bx
    }
    const w = cw * k,
      h = ch * k
    const R = Math.max(baseR, w / (0.9 * Math.PI))
    const theta = w / R
    const top = anchorWorldY + anchorY * k
    return { R, theta, h, cy: top - h / 2, dx: (cw / 2 - anchorX) * k }
  }, [g, bx])

  return (
    <mesh position={[layout.dx, layout.cy, 0]} scale={[1, 1, 0.56]} renderOrder={2}>
      <cylinderGeometry args={[layout.R, layout.R, layout.h, 64, 1, true, -layout.theta / 2, layout.theta]} />
      <meshStandardMaterial
        map={tex}
        emissiveMap={tex}
        emissive="#ffffff"
        emissiveIntensity={0.16}
        transparent
        alphaTest={0.35}
        side={THREE.DoubleSide}
        roughness={0.86}
        metalness={0}
      />
    </mesh>
  )
}

/**
 * Placement for the sibling GarmentModel (ghost-mannequin meshes normalised to a bounding
 * height of 0.9 units for tops / 1.7 for trousers, centred at the origin, facing +Z).
 * Values are world metres on the 175 cm figure: [target height, top edge y].
 */
const EXTERNAL_FIT: Record<string, { norm: number; h: number; top: number }> = {
  hoodie: { norm: 0.9, h: 0.98, top: 1.78 },
  tee: { norm: 0.9, h: 0.7, top: 1.5 },
  puffer: { norm: 0.9, h: 0.76, top: 1.58 },
  blazer: { norm: 0.9, h: 0.86, top: 1.53 },
  corset: { norm: 0.9, h: 0.56, top: 1.43 },
  cargo: { norm: 1.7, h: 0.99, top: 1.0 },
}

function ExternalGarment({ C, type, color, bx }: { C: NonNullable<MannequinProps['GarmentModel']>; type: string; color: string; bx: number }) {
  const f = EXTERNAL_FIT[type] ?? EXTERNAL_FIT.hoodie
  const k = f.h / f.norm
  return (
    <group position={[0, f.top - f.h / 2, 0.005]} scale={[k * bx, k, k * (0.96 + 0.04 * bx)]}>
      <C type={type} color={color} />
    </group>
  )
}

function Figure({ heightCm, build, garment, colorHex, reducedMotion, GarmentModel }: MannequinProps) {
  const group = useRef<THREE.Group>(null)
  const s = heightCm / 175
  const bx = 0.9 + 0.1 * build + (build > 1 ? 0.04 * (build - 1) : 0)
  useFrame(({ clock }) => {
    if (!group.current) return
    group.current.rotation.y = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.35) * 0.22
  })
  return (
    <group ref={group} scale={[s, s, s]}>
      <Body bx={bx} />
      {GarmentModel && garment ? (
        <ExternalGarment C={GarmentModel} type={garment.garment} color={colorHex ?? BONE} bx={bx} />
      ) : (
        garment && <GarmentShell g={garment} bx={bx} />
      )}
    </group>
  )
}

export default function Mannequin(props: MannequinProps) {
  const { onCanvas } = props
  useEffect(() => () => onCanvas?.(null), [onCanvas])
  return (
    <Canvas
      className="vt-mannequin-canvas"
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 1.12, 4.5], fov: 30, near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        onCanvas?.(gl.domElement)
      }}
    >
      <hemisphereLight args={['#fff4e6', '#2a1a22', 0.55]} />
      <directionalLight position={[2.6, 4.2, 3.2]} intensity={2.1} color="#fff1dd" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3.2, 2.4, -2.4]} intensity={1.6} color="#d9b98c" />
      <directionalLight position={[-2.4, 1.2, 3]} intensity={0.35} color="#c9d2ff" />
      <pointLight position={[0, 0.3, 1.6]} intensity={0.4} color="#5c1428" />
      <Suspense fallback={null}>
        <Figure {...props} />
      </Suspense>
      {/* plinth */}
      <mesh position={[0, -0.02, 0]} receiveShadow>
        <cylinderGeometry args={[0.62, 0.66, 0.04, 96]} />
        <meshStandardMaterial color="#1b1219" roughness={0.42} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.615, 0.622, 128]} />
        <meshBasicMaterial color="#d9b98c" transparent opacity={0.7} />
      </mesh>
      <ContactShadows position={[0, 0.002, 0]} opacity={0.55} scale={2.4} blur={2.6} far={2} resolution={512} color="#000000" />
      <OrbitControls
        target={[0, 0.9, 0]}
        enablePan={false}
        minDistance={2.6}
        maxDistance={5.5}
        minPolarAngle={Math.PI * 0.32}
        maxPolarAngle={Math.PI * 0.56}
        minAzimuthAngle={-0.6}
        maxAzimuthAngle={0.6}
        enableDamping
      />
    </Canvas>
  )
}
