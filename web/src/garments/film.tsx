import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { buildGarment, setGarmentExplode, type GarmentUserData } from './build'
import type { GarmentType, GarmentVariant } from './kit'
import type { FabricKind } from './materials'
import { buildSurface } from './geometry'
import { Noise3 } from './noise'
import { velvetMaterial, type TimeRef } from './scenes'
import { GarmentStage } from './GarmentStage'
import { Environment, Lightformer } from '@react-three/drei'

export const FILM_DURATION = 12
const TAU = Math.PI * 2
const CHAMPAGNE = '#d9b98c'
const n3 = new Noise3(4242)

// ---------------------------------------------------------------------------------------------
// shared bits

function softDot() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  return t
}

/** Drifting dust motes; every motion is periodic in FILM_DURATION so the loop is seamless. */
function Dust({ time, count = 1600, radius = 3.2, y0 = -1.3, h = 3.8 }: { time: TimeRef; count?: number; radius?: number; y0?: number; h?: number }) {
  const { geo, mat, base } = useMemo(() => {
    const rnd = (i: number, k: number) => {
      const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
      return x - Math.floor(x)
    }
    const base = new Float32Array(count * 6) // x, y, z, laps, phase, size
    const pos = new Float32Array(count * 3)
    const alpha = new Float32Array(count)
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(rnd(i, 1)) * radius
      const a = rnd(i, 2) * TAU
      base[i * 6] = Math.cos(a) * r
      base[i * 6 + 1] = rnd(i, 3) * h
      base[i * 6 + 2] = Math.sin(a) * r
      base[i * 6 + 3] = rnd(i, 4) < 0.7 ? 1 : 2 // whole laps per loop
      base[i * 6 + 4] = rnd(i, 5)
      base[i * 6 + 5] = 0.6 + rnd(i, 6) * 1.6
      size[i] = base[i * 6 + 5]
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: softDot() }, uColor: { value: new THREE.Color(CHAMPAGNE) }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aAlpha; attribute float aSize; varying float vA; uniform float uScale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vA = aAlpha;
          gl_PointSize = aSize * uScale * 22.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(uColor * a, a); }`,
    })
    return { geo, mat, base }
  }, [count, radius, h])
  const size = useThree((s) => s.size)
  useFrame(() => {
    const t = time.t / FILM_DURATION
    mat.uniforms.uScale.value = size.height / 900
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const al = geo.getAttribute('aAlpha') as THREE.BufferAttribute
    for (let i = 0; i < count; i++) {
      const laps = base[i * 6 + 3], ph = base[i * 6 + 4]
      let y = base[i * 6 + 1] + t * h * laps
      y = ((y % h) + h) % h
      const sway = 0.08
      const x = base[i * 6] + Math.sin(TAU * (t * laps + ph)) * sway
      const z = base[i * 6 + 2] + Math.cos(TAU * (t * laps * 2 + ph)) * sway
      pos.setXYZ(i, x, y0 + y, z)
      const edge = Math.min(1, y / 0.5, (h - y) / 0.5)
      const tw = 0.55 + 0.45 * Math.sin(TAU * (t * 3 + ph * 7))
      al.setX(i, Math.max(0, edge) * tw * 0.85)
    }
    pos.needsUpdate = true
    al.needsUpdate = true
  })
  return <points geometry={geo} material={mat} frustumCulled={false} />
}

/** Soft additive light cone ("god ray") for the champagne sweeps. */
function beamMaterial(color = CHAMPAGNE, strength = 0.22) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uStrength; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(abs(dot(vN, vV)), 2.5); float along = pow(vUv.y, 1.6) * smoothstep(0.0, 0.15, vUv.y);
        float a = f * along * uStrength; gl_FragColor = vec4(uColor * a, a); }`,
  })
}

/** Circular velvet curtain surrounding the set. */
function VelvetRoom({ radius = 4.6, height = 6 }: { radius?: number; height?: number }) {
  const { geo, mat, floorMat } = useMemo(() => {
    const s = buildSurface(
      (u, v, out) => {
        const a = u * TAU
        const y = (v - 0.35) * height
        const fold = Math.sin(a * 46 + n3.noise(Math.cos(a) * 3, Math.sin(a) * 3, y * 0.15) * 3) * 0.13 + Math.sin(a * 113) * 0.03
        const r = radius + fold * (0.7 + 0.3 * v)
        out.set(Math.cos(a) * r, y, Math.sin(a) * r)
      },
      { nu: 420, nv: 24, wrapU: true, orient: 'auto' },
    )
    // we look at the inside of the cylinder
    const g = s.geometry()
    const idx = g.getIndex()!
    const arr = idx.array as Uint32Array | Uint16Array
    for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t }
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i))
    const mat = velvetMaterial('#1a0f1a', '#6a4458')
    const floorMat = velvetMaterial('#120a12', '#4d3040')
    ;(floorMat.normalMap as THREE.Texture).repeat.set(10, 10)
    return { geo: g, mat, floorMat }
  }, [radius, height])
  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow />
      <VelvetFloor material={floorMat} />
    </group>
  )
}

/** Velvet cloth on the floor with slow travelling waves (periodic). */
function VelvetFloor({ material, timeRef }: { material: THREE.Material; timeRef?: TimeRef }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(10, 10, 150, 150)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const base = useMemo(() => (geo.getAttribute('position').array as Float32Array).slice(), [geo])
  const tRef = useRef(0)
  useFrame(() => {
    const t = (timeRef ?? (globalThis as unknown as { __filmTime?: TimeRef }).__filmTime)?.t ?? 0
    if (t === tRef.current && t !== 0) return
    tRef.current = t
    const ph = (t / FILM_DURATION) * TAU
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2]
      const r = Math.hypot(x, z)
      const y = 0.06 * Math.sin(r * 2.2 - ph * 2) * Math.min(1, r / 1.5) + 0.035 * Math.sin(x * 1.3 + z * 0.7 + ph) + 0.025 * Math.sin(z * 2.1 - x * 0.4 - ph * 3)
      pos.setY(i, y)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  })
  return <mesh geometry={geo} material={material} position={[0, -1.25, 0]} receiveShadow />
}

// ---------------------------------------------------------------------------------------------
// Campaign film "NOCTURNE 001"

interface FilmGarment { type: GarmentType; color: string; variant?: GarmentVariant; fabric?: FabricKind; pos: [number, number, number]; rot: number; scale?: number }

const CAST: FilmGarment[] = [
  { type: 'hoodie', color: '#3a1f3d', fabric: 'velour', pos: [0, 0.02, 0], rot: 0, scale: 1.3 },
  { type: 'puffer', color: '#c8873a', fabric: 'iridescent', pos: [1.85, 0.72, 0.55], rot: -1.2 },
  { type: 'corset', color: '#5c1428', fabric: 'silkVelvet', pos: [0.75, -0.5, 1.8], rot: 0.3 },
  { type: 'blazer', color: '#f1ebe1', fabric: 'gabardine', pos: [-1.75, 0.62, 1.05], rot: 0.9 },
  { type: 'cargo', color: '#15121a', pos: [-1.7, -0.32, -1.15], rot: 2.1, scale: 0.7 },
  { type: 'tee', color: '#e6dccb', pos: [0.95, 0.68, -1.75], rot: 3.0 },
]

export function FilmScene({ time, vertical = false }: { time: TimeRef; vertical?: boolean }) {
  ;(globalThis as unknown as { __filmTime?: TimeRef }).__filmTime = time
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const garments = useMemo(
    () =>
      CAST.map((c) => {
        const g = buildGarment(c.type, { color: c.color, variant: c.variant, fabric: c.fabric, detail: 'high' })
        const holder = new THREE.Group()
        holder.add(g)
        holder.position.set(...c.pos)
        holder.scale.setScalar(c.scale ?? 1)
        return { c, holder, g }
      }),
    [],
  )
  const sweepA = useRef<THREE.SpotLight>(null)
  const sweepB = useRef<THREE.SpotLight>(null)
  const beamA = useRef<THREE.Mesh>(null)
  const beamB = useRef<THREE.Mesh>(null)
  const targetA = useMemo(() => new THREE.Object3D(), [])
  const targetB = useMemo(() => new THREE.Object3D(), [])
  const beamGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.75, 5.5, 48, 1, true)
    g.translate(0, -2.75, 0) // apex at the origin, pointing down -Y
    return g
  }, [])
  const beamMatA = useMemo(() => beamMaterial(CHAMPAGNE, 0.3), [])
  const beamMatB = useMemo(() => beamMaterial('#e8d2ae', 0.2), [])

  useFrame(() => {
    const t = time.t
    const p = (t / FILM_DURATION) * TAU
    // camera: one full, slow revolution per loop, breathing in and out between the garments
    const az = p + 0.35
    const R = vertical ? 4.7 + 0.3 * Math.cos(p * 2) : 3.75 + 0.3 * Math.cos(p * 2)
    const camY = 0.22 + 0.16 * Math.sin(p) + 0.05 * Math.sin(p * 3)
    camera.position.set(Math.sin(az) * R, camY, Math.cos(az) * R)
    const look = new THREE.Vector3(0.15 * Math.sin(p * 2), 0.08, 0.15 * Math.cos(p * 2))
    camera.lookAt(look)
    camera.fov = vertical ? 44 : 30
    camera.updateProjectionMatrix()

    for (const { c, holder, g } of garments) {
      const k = c.pos[0] * 1.7 + c.pos[2] * 0.9
      holder.position.y = c.pos[1] + 0.05 * Math.sin(p + k) + 0.02 * Math.sin(p * 2 + k * 2)
      holder.rotation.y = c.rot + (c.type === 'hoodie' && c.pos[0] === 0 ? -p : 0.22 * Math.sin(p + k))
      holder.rotation.z = 0.04 * Math.sin(p + k * 1.3)
      holder.rotation.x = 0.03 * Math.cos(p * 2 + k)
      const ud = g.userData as GarmentUserData
      if (ud.parts && c.type === 'hoodie' && c.pos[0] === 0) setGarmentExplode(g, 0)
    }
    // champagne sweeps (period = loop/2 and loop)
    const sa = p * 2
    targetA.position.set(Math.sin(sa) * 1.6, -1.2, Math.cos(sa) * 1.6)
    targetB.position.set(Math.sin(-p + 2.0) * 2.2, -1.2, Math.cos(-p + 2.0) * 2.2)
    for (const [L, T, B] of [[sweepA, targetA, beamA], [sweepB, targetB, beamB]] as const) {
      if (L.current) {
        L.current.target = T
        T.updateMatrixWorld()
      }
      if (B.current && L.current) {
        B.current.position.copy(L.current.position)
        const dir = T.position.clone().sub(L.current.position).normalize()
        B.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
      }
    }
  })

  return (
    <>
      <color attach="background" args={['#0b070b']} />
      <fogExp2 attach="fog" args={['#0e0a0e', 0.075]} />
      <hemisphereLight args={['#5a4250', '#0a0609', 0.25]} />
      <directionalLight position={[-2.5, 4.5, 2.5]} intensity={1.6} color="#fff0de" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0008} shadow-normalBias={0.03} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} />
      <directionalLight position={[3, 2, -3]} intensity={2.4} color={CHAMPAGNE} />
      <directionalLight position={[-3, 1.5, -2.5]} intensity={1.2} color="#c9a7c4" />
      <spotLight ref={sweepA} position={[0, 4.2, 0]} angle={0.32} penumbra={0.8} intensity={60} distance={0} decay={1.4} color={CHAMPAGNE} />
      <spotLight ref={sweepB} position={[0.5, 4.0, 0.5]} angle={0.28} penumbra={0.9} intensity={35} distance={0} decay={1.4} color="#ecd7b4" />
      <primitive object={targetA} />
      <primitive object={targetB} />
      <mesh ref={beamA} geometry={beamGeo} material={beamMatA} frustumCulled={false} />
      <mesh ref={beamB} geometry={beamGeo} material={beamMatB} frustumCulled={false} />
      <Environment resolution={128} frames={1} environmentIntensity={0.45}>
        <color attach="background" args={['#0b070b']} />
        <Lightformer form="rect" intensity={2} color="#fff1e0" position={[-2, 3, 2]} scale={[3, 2, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={3} color={CHAMPAGNE} position={[3, 1, -2]} scale={[0.6, 4, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1} color="#b39ad0" position={[-3, 0.5, -2]} scale={[0.8, 3, 1]} target={[0, 0, 0]} />
      </Environment>
      <VelvetRoom />
      {garments.map(({ holder }, i) => (
        <primitive key={i} object={holder} />
      ))}
      <Dust time={time} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Scroll sequence: Monolith 500 hoodie rotating 360° while exploding into panels and reassembling

export function SeqScene({ time }: { time: TimeRef }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const garment = useMemo(() => buildGarment('hoodie', { color: '#15121a', detail: 'high' }), [])
  const glow = useMemo(() => softDot(), [])
  const holder = useMemo(() => {
    const h = new THREE.Group()
    h.add(garment)
    return h
  }, [garment])
  useFrame(() => {
    const t = time.t // 0..1
    const e = Math.pow(Math.sin(Math.PI * t), 2) // 0 → 1 → 0
    const ease = t * t * (3 - 2 * t)
    holder.rotation.y = -0.25 - ease * TAU
    setGarmentExplode(garment, e * 0.85)
    const ud = garment.userData as GarmentUserData
    for (const [name, g] of Object.entries(ud.parts)) {
      const s = name === 'sleeveR' ? 1 : name === 'sleeveL' ? -1 : 0
      g.rotation.set(0, 0, 0)
      if (s) g.rotation.z = s * 0.22 * e
      if (name === 'hood') g.rotation.x = -0.25 * e
      if (name === 'pocket') g.rotation.x = 0.18 * e
    }
    holder.position.y = 0.03 * Math.sin(TAU * t)
    camera.position.set(0, 0.22, 3.35)
    camera.lookAt(0, 0.0, 0)
    camera.fov = 30
    camera.updateProjectionMatrix()
  })
  return (
    <>
      <color attach="background" args={['#0e0a0e']} />
      <GarmentStage mood="dramatic" shadow={false} intensity={1.15}>
        <primitive object={holder} />
      </GarmentStage>
      <mesh position={[0, 0.15, -2.4]}>
        <planeGeometry args={[5.5, 5.5]} />
        <meshBasicMaterial map={glow} color="#4a2c40" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </>
  )
}
