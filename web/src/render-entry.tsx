/**
 * Offline render harness (served by `npx vite` at /render.html). Used by tools/render/*.mjs.
 *
 *   ?mode=product&id=vl-m-hoodie-01&view=front|back|side&c=0&bg=transparent|dark
 *   ?mode=category&garment=hoodie
 *   ?mode=debug&type=hoodie&color=%2315121a&view=front
 *   ?mode=film&aspect=wide|vertical      → window.__frame(t) renders time t (seconds)
 *   ?mode=seq                            → window.__frame(i / 90)
 *
 * window.__READY becomes true once the first frame with environment + shadows is on screen.
 */
import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useThree, advance } from '@react-three/fiber'
import * as THREE from 'three'
import raw from '../../shared/catalog.json'
import { buildGarment, GarmentStage, productGarment, type GarmentType, type GarmentVariant, type FabricKind } from './garments'
import { VelvetDrape, FilmScene, SeqScene } from './garments/scenes'

declare global {
  interface Window {
    __READY?: boolean
    __frame?: (t: number) => Promise<void> | void
    __info?: Record<string, unknown>
  }
}

interface P { id: string; garment: string; name: string; colors: { name: string; hex: string }[] }
const products = (raw as unknown as { products: P[] }).products

const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'product'
const view = (q.get('view') ?? 'front') as 'front' | 'back' | 'side'
const bg = q.get('bg') ?? 'transparent'

const VIEW_ROT: Record<string, number> = { front: -0.19, back: Math.PI + 0.12, side: -1.32 }

function markReady(frames = 4) {
  let n = 0
  const tick = () => {
    if (++n >= frames) window.__READY = true
    else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Fit the camera to the object's bounding box. */
function FitCamera({ target, fill = 0.82, yBias = 0, xShift = 0 }: { target: THREE.Object3D; fill?: number; yBias?: number; xShift?: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    target.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(target)
    const c = box.getCenter(new THREE.Vector3())
    const s = box.getSize(new THREE.Vector3())
    const aspect = size.width / size.height
    const vfov = THREE.MathUtils.degToRad(camera.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const dH = (s.y / fill) / 2 / Math.tan(vfov / 2)
    const dW = (s.x / fill) / 2 / Math.tan(hfov / 2)
    const dist = Math.max(dH, dW) + s.z / 2
    const elev = 0.06
    camera.position.set(c.x - xShift * dist, c.y + yBias + dist * elev, c.z + dist)
    camera.lookAt(c.x - xShift * dist, c.y + yBias, c.z)
    camera.near = dist * 0.05
    camera.far = dist * 10
    camera.updateProjectionMatrix()
    invalidate()
  }, [target, camera, size, fill, yBias, xShift, invalidate])
  return null
}

function ProductShot({ type, color, accent, variant, fabric, rotY, dark }: { type: GarmentType; color: string; accent?: string; variant?: GarmentVariant; fabric?: FabricKind; rotY: number; dark?: boolean }) {
  const garment = useMemo(() => {
    const t0 = performance.now()
    const g = buildGarment(type, { color, accent, variant, fabric, detail: 'high' })
    g.rotation.y = rotY
    window.__info = { buildMs: Math.round(performance.now() - t0), triangles: (g.userData as { triangles: number }).triangles }
    return g
  }, [type, color, accent, variant, fabric, rotY])
  useEffect(() => markReady(6), [garment])
  const h = type === 'cargo' ? 1.7 : 0.9
  return (
    <>
      {dark && <color attach="background" args={['#120c12']} />}
      <GarmentStage shadowY={-h / 2 - 0.06} shadowOpacity={0.38} mood={dark ? 'dramatic' : 'studio'}>
        <primitive object={garment} />
      </GarmentStage>
      <FitCamera target={garment} fill={type === 'cargo' ? 0.9 : 0.84} />
    </>
  )
}

function CategoryShot({ type, color, accent, variant, fabric }: { type: GarmentType; color: string; accent?: string; variant?: GarmentVariant; fabric?: FabricKind }) {
  const garment = useMemo(() => {
    const g = buildGarment(type, { color, accent, variant, fabric, detail: 'high' })
    g.rotation.y = -0.42
    return g
  }, [type, color, accent, variant, fabric])
  useEffect(() => markReady(6), [garment])
  const h = type === 'cargo' ? 1.7 : 0.9
  return (
    <>
      <color attach="background" args={['#120c12']} />
      <fog attach="fog" args={['#120c12', 3, 9]} />
      <VelvetDrape />
      <GarmentStage shadowY={-h / 2 - 0.08} shadowOpacity={0.6} mood="dramatic">
        <primitive object={garment} />
      </GarmentStage>
      <FitCamera target={garment} fill={type === 'cargo' ? 0.86 : 0.72} xShift={-0.12} />
    </>
  )
}

function FrameDriver({ fn }: { fn: (t: number) => void }) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    window.__frame = async (t: number) => {
      ref.current(t)
      advance(performance.now())
      await new Promise((r) => setTimeout(r, 0))
    }
    // let suspense/environment settle with a few warm-up frames
    let n = 0
    const warm = () => {
      ref.current(0)
      advance(performance.now())
      if (++n < 4) setTimeout(warm, 30)
      else window.__READY = true
    }
    setTimeout(warm, 50)
  }, [])
  return null
}

function App() {
  if (mode === 'film' || mode === 'seq') {
    const time = { t: 0 }
    return (
      <Canvas
        frameloop="never"
        dpr={1}
        shadows
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false, toneMapping: THREE.NeutralToneMapping }}
        camera={{ fov: mode === 'seq' ? 28 : 30, near: 0.05, far: 60, position: [0, 0, 4] }}
      >
        {mode === 'film' ? <FilmScene time={time} vertical={q.get('aspect') === 'vertical'} /> : <SeqScene time={time} />}
        <FrameDriver fn={(t) => { time.t = t }} />
      </Canvas>
    )
  }

  let type: GarmentType = 'hoodie', color = '#15121a', accent: string | undefined, variant: GarmentVariant | undefined, fabric: FabricKind | undefined
  if (mode === 'debug') {
    type = (q.get('type') ?? 'hoodie') as GarmentType
    color = q.get('color') ?? color
    variant = (q.get('variant') ?? undefined) as GarmentVariant | undefined
    fabric = (q.get('fabric') ?? undefined) as FabricKind | undefined
  } else if (mode === 'category') {
    const g = q.get('garment') ?? 'hoodie'
    const pid = q.get('id')
    const p = (pid && products.find((x) => x.id === pid)) || products.find((x) => x.garment === g)!
    const spec = productGarment(p)
    type = spec.type; variant = spec.variant; fabric = spec.fabric; accent = spec.accent
    color = q.get('color') ?? p.colors[0].hex
  } else {
    const p = products.find((x) => x.id === q.get('id')) ?? products[0]
    const spec = productGarment(p)
    type = spec.type; variant = spec.variant; fabric = spec.fabric; accent = spec.accent
    const ci = Math.min(p.colors.length - 1, Number(q.get('c') ?? 0))
    color = p.colors[ci].hex
  }
  const dark = bg !== 'transparent'
  return (
    <Canvas
      frameloop="always"
      dpr={1}
      shadows
      gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false, toneMapping: THREE.NeutralToneMapping }}
      camera={{ fov: mode === 'category' ? 26 : 22, position: [0, 0, 4] }}
      style={{ background: 'transparent' }}
    >
      {mode === 'category' ? (
        <CategoryShot type={type} color={color} accent={accent} variant={variant} fabric={fabric} />
      ) : (
        <ProductShot type={type} color={color} accent={accent} variant={variant} fabric={fabric} rotY={VIEW_ROT[view] ?? 0} dark={dark} />
      )}
    </Canvas>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
