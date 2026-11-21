import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react'
import './tryon.css'
import type { StudioMode, TryOnProduct, TryOnStudioProps } from './types'
import { CAMERA_ERROR_COPY, CameraError, TryOnEngine, brandSnapshot, type EngineStats } from './engine'
import { cropToContent, loadGarment, resolveAssetUrl, tintedGarment, type PreparedGarment } from './garment'
import { DEFAULT_SIZE_CHART, garmentKind, recommendSize, shoulderFromStature } from './fit-math'
import type { MannequinGarment } from './Mannequin'

const Mannequin = lazy(() => import('./Mannequin'))

// Optional richer 3D garments from a sibling module; resolved at build time, empty if absent.
const garmentModules = import.meta.glob('../garments/index.ts') as Record<string, () => Promise<Record<string, unknown>>>
const USE_EXTERNAL_GARMENTS = false

interface Notice {
  title: string
  body: string
  actions: ('photo' | 'retry' | 'mannequin')[]
}

const INITIAL_STATS: EngineStats = {
  source: null,
  model: 'idle',
  delegate: null,
  tracking: false,
  hint: null,
  shoulderCm: null,
  torsoCm: null,
  confidence: 0,
  basis: null,
  fps: 0,
}

const BUILD_LABELS = ['Slim', 'Athletic', 'Broad']

const formatPrice = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setR(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return r
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* ------------------------------------------------------------------ icons */

const Icon = {
  close: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.6l1.4-2h7l1.4 2h2.6A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M12 16V4M7 9l5-5 5 5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  figure: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="12" cy="4.5" r="2" />
      <path d="M8 21l1-8-2-5h10l-2 5 1 8M9 13h6" strokeLinejoin="round" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  snap: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  bag: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8" strokeLinejoin="round" />
    </svg>
  ),
}

/* ------------------------------------------------------------------ start screen art */

function ScannerArt({ garment }: { garment: string }) {
  const pts: [number, number][] = [
    [100, 38],
    [70, 92],
    [130, 92],
    [58, 150],
    [142, 150],
    [52, 200],
    [148, 200],
    [82, 190],
    [118, 190],
    [80, 262],
    [120, 262],
    [80, 330],
    [120, 330],
  ]
  return (
    <svg className="vt-scanner-art" viewBox="0 0 200 360" aria-hidden="true">
      <defs>
        <linearGradient id="vt-sweep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9b98c" stopOpacity="0" />
          <stop offset="1" stopColor="#d9b98c" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <path
        className="vt-scanner-body"
        d="M100 14c13 0 22 10 22 23s-9 25-22 25-22-12-22-25 9-23 22-23zM74 76c-14 3-22 12-24 26l-8 96c-1 8 10 10 12 2l12-80 4 70-6 136c0 9 13 10 14 1l14-128h8l14 128c1 9 14 8 14-1l-6-136 4-70 12 80c2 8 13 6 12-2l-8-96c-2-14-10-23-24-26z"
      />
      <g className="vt-scanner-links">
        <path d="M70 92L130 92M70 92L82 190M130 92L118 190M82 190L118 190M70 92L58 150L52 200M130 92L142 150L148 200M82 190L80 262L80 330M118 190L120 262L120 330" />
      </g>
      {pts.map(([x, y], i) => (
        <g key={i} className="vt-scanner-dot" style={{ animationDelay: `${i * 90}ms` }}>
          <circle cx={x} cy={y} r="5.5" />
          <circle cx={x} cy={y} r="1.8" />
        </g>
      ))}
      <g className="vt-scanner-sweep">
        <rect x="0" y="-40" width="200" height="40" fill="url(#vt-sweep)" />
        <rect x="10" y="0" width="180" height="1" fill="#d9b98c" />
      </g>
      <text x="100" y="356" textAnchor="middle" className="vt-scanner-caption">
        {garment.toUpperCase()} · 33 POINT MAP
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ component */

export function TryOnStudio(props: TryOnStudioProps) {
  const { onAddToBag, onClose } = props
  const products = props.products?.length ? props.products : [props.product]
  const [productId, setProductId] = useState(props.product.id)
  const product: TryOnProduct = products.find((p) => p.id === productId) ?? props.product
  const [colorIndex, setColorIndex] = useState(() => Math.max(0, Math.min((props.colorIndex ?? 0), product.colors.length - 1)))
  const [heightCm, setHeightCm] = useState(() => Math.round(props.heightCm ?? 175))
  const [build, setBuild] = useState(1)
  const [mode, setMode] = useState<StudioMode>('start')
  const [stats, setStats] = useState<EngineStats>(INITIAL_STATS)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [prepared, setPrepared] = useState<PreparedGarment | null>(null)
  const [pickedSize, setPickedSize] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)
  const [GarmentModel, setGarmentModel] = useState<ComponentType<{ type: string; color: string }> | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hudRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const engineRef = useRef<TryOnEngine | null>(null)
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const ids = useId()

  const color = product.colors[colorIndex] ?? product.colors[0]

  /* ---------- engine lifecycle */
  useEffect(() => {
    if (!canvasRef.current || !hudRef.current) return
    const engine = new TryOnEngine({
      canvas: canvasRef.current,
      hud: hudRef.current,
      onStats: setStats,
      onModelError: () => {
        if (modeRef.current !== 'camera' && modeRef.current !== 'photo') return
        engine.stopSource()
        setMode('mannequin')
        setNotice({
          title: 'Body scanner unavailable',
          body: 'The on-device fitting model couldn’t load on this browser, so we’ve opened the 3D atelier mannequin instead. Set your height and build to preview the fit.',
          actions: ['retry'],
        })
      },
    })
    engineRef.current = engine
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  /* ---------- garment loading + colourway */
  useEffect(() => {
    let live = true
    loadGarment(product.image, product.garment).then((g) => live && setPrepared(g))
    return () => {
      live = false
    }
  }, [product.image, product.garment])

  const tinted = useMemo(() => (prepared ? tintedGarment(prepared, color?.hex) : null), [prepared, color?.hex])

  useEffect(() => {
    if (!prepared || !tinted) return engineRef.current?.setGarment(null)
    engineRef.current?.setGarment({ canvas: tinted, meta: prepared.meta, garment: product.garment, fit: product.fit })
  }, [prepared, tinted, product.garment, product.fit])

  const mannequinGarment: MannequinGarment | null = useMemo(() => {
    if (!prepared || !tinted || mode !== 'mannequin') return null
    const { canvas, ox, oy } = cropToContent(tinted, prepared.meta)
    return { canvas, ox, oy, meta: prepared.meta, garment: product.garment, fit: product.fit }
  }, [prepared, tinted, mode, product.garment, product.fit])

  useEffect(() => engineRef.current?.setHeight(heightCm), [heightCm])

  useEffect(() => {
    const load = garmentModules['../garments/index.ts']
    if (!USE_EXTERNAL_GARMENTS || !load || mode !== 'mannequin' || GarmentModel) return
    load()
      .then((m) => {
        const C = m.GarmentModel as ComponentType<{ type: string; color: string }> | undefined
        if (C) setGarmentModel(() => C)
      })
      .catch(() => {})
  }, [mode, GarmentModel])

  /* ---------- focus management, ESC, scroll lock */
  const close = useCallback(() => {
    engineRef.current?.stopSource()
    onClose?.()
  }, [onClose])

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 30)
    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (snapshot) setSnapshot(null)
        else close()
        return
      }
      if (e.key !== 'Tab' || !rootRef.current) return
      const scope = (snapshot && rootRef.current.querySelector<HTMLElement>('.vt-snapshot')) || rootRef.current
      const els = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!els.length) return
      const first = els[0],
        last = els[els.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (!active || !scope.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close, snapshot])

  useEffect(() => {
    if (snapshot) window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>('.vt-snapshot [data-autofocus]')?.focus(), 20)
  }, [snapshot])

  /* ---------- modes */
  const startCamera = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    setNotice(null)
    setMode('camera')
    setBusy(true)
    try {
      await engine.startCamera()
    } catch (e) {
      const code = e instanceof CameraError ? e.code : 'unknown'
      const copy = CAMERA_ERROR_COPY[code]
      engine.stopSource()
      setMode('mannequin')
      setNotice({ title: copy.title, body: copy.body, actions: code === 'insecure' || code === 'no-camera' ? ['photo'] : ['photo', 'retry'] })
    } finally {
      setBusy(false)
    }
  }, [])

  const pickPhoto = useCallback(() => fileRef.current?.click(), [])

  const onFile = useCallback(async (file: File | undefined) => {
    const engine = engineRef.current
    if (!file || !engine) return
    setNotice(null)
    setMode('photo')
    setBusy(true)
    try {
      await engine.startPhoto(file)
    } catch (e) {
      setNotice({ title: 'That photo didn’t work', body: (e as Error)?.message || 'Try a JPEG or PNG portrait photo.', actions: ['photo', 'mannequin'] })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [])

  const startMannequin = useCallback(() => {
    engineRef.current?.stopSource()
    setNotice(null)
    setMode('mannequin')
  }, [])

  const switchProduct = useCallback(
    (id: string) => {
      if (id === productId) return
      setProductId(id)
      setColorIndex(0)
      setPickedSize(null)
      setAdded(false)
    },
    [productId],
  )

  /* ---------- sizing */
  const liveMeasure = (mode === 'camera' || mode === 'photo') && stats.tracking && stats.shoulderCm != null
  const rec = useMemo(() => {
    const chart = DEFAULT_SIZE_CHART
    if (liveMeasure) return recommendSize(stats.shoulderCm, heightCm, chart, product.sizes, stats.confidence)
    if (mode === 'mannequin') return recommendSize(shoulderFromStature(heightCm, build), heightCm, chart, product.sizes, 0.82)
    return recommendSize(null, heightCm, chart, product.sizes, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMeasure, Math.round((stats.shoulderCm ?? 0) * 2), Math.round(stats.confidence * 20), heightCm, build, mode, product.sizes])
  const recBasis = liveMeasure ? 'From your live scan' : mode === 'mannequin' ? 'From your height & build' : 'From your height'
  const size = pickedSize && product.sizes.includes(pickedSize) ? pickedSize : rec.size

  /* ---------- snapshot + bag */
  const takeSnapshot = useCallback(() => {
    let url: string | null = null
    if (mode === 'mannequin' && glCanvasRef.current) url = brandSnapshot(glCanvasRef.current)
    else if (mode === 'camera' || mode === 'photo') url = engineRef.current?.snapshot() ?? null
    if (url) setSnapshot(url)
    else setNotice({ title: 'Nothing to capture yet', body: 'Start the camera, upload a photo or open the 3D mannequin, then take your snapshot.', actions: [] })
  }, [mode])

  const addToBag = useCallback(() => {
    onAddToBag?.({ productId: product.id, size, colorIndex })
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2200)
  }, [onAddToBag, product.id, size, colorIndex])

  const onGlCanvas = useCallback((el: HTMLCanvasElement | null) => {
    glCanvasRef.current = el
  }, [])

  /* ---------- derived HUD copy */
  const kind = garmentKind(product.garment)
  const statusLabel =
    mode === 'photo'
      ? stats.model === 'loading'
        ? 'ANALYSING PHOTO'
        : stats.tracking
          ? 'PHOTO · MAPPED'
          : 'PHOTO'
      : stats.model === 'loading' || busy
        ? 'CALIBRATING'
        : stats.tracking
          ? 'LIVE · TRACKING'
          : 'LIVE · SEARCHING'
  const fmt = (v: number | null, d = 1) => (v == null ? '—' : v.toFixed(d))

  const canCapture = mode === 'camera' || mode === 'photo' || mode === 'mannequin'

  return (
    <div
      ref={rootRef}
      className={`vt-root${reducedMotion ? ' vt-reduced' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Virtual try-on — ${product.name}`}
      data-vt-mode={mode}
      data-vt-model={stats.model}
      data-vt-delegate={stats.delegate ?? ''}
    >
      <div className="vt-velvet" aria-hidden="true" />

      <header className="vt-top">
        <div className="vt-brand">
          <span className="vt-brand-mark">VÉLOURA</span>
          <span className="vt-brand-sub">Atelier · Virtual Fitting</span>
        </div>
        {mode !== 'start' && (
          <nav className="vt-modes" aria-label="Try-on mode">
            <button type="button" className="vt-mode" aria-pressed={mode === 'camera'} onClick={startCamera} disabled={busy}>
              Live
            </button>
            <button type="button" className="vt-mode" aria-pressed={mode === 'photo'} onClick={pickPhoto} disabled={busy}>
              Photo
            </button>
            <button type="button" className="vt-mode" aria-pressed={mode === 'mannequin'} onClick={startMannequin}>
              3D Atelier
            </button>
          </nav>
        )}
        <button type="button" className="vt-icon-btn vt-close" aria-label="Close virtual try-on" onClick={close} data-autofocus={mode !== 'start' ? '' : undefined}>
          {Icon.close}
        </button>
      </header>

      <div className="vt-body">
        <section className="vt-stage" aria-label="Fitting stage">
          <canvas
            ref={canvasRef}
            className={`vt-canvas${mode === 'camera' || mode === 'photo' ? '' : ' vt-hidden'}`}
            role="img"
            aria-label={`${product.name} overlaid on your ${mode === 'photo' ? 'photo' : 'camera image'}`}
          />
          <canvas ref={hudRef} className={`vt-hud-canvas${mode === 'camera' || mode === 'photo' ? '' : ' vt-hidden'}`} aria-hidden="true" />

          {(mode === 'camera' || mode === 'photo') && (
            <div className="vt-hud" aria-live="polite">
              <span className="vt-corner vt-tl" aria-hidden="true" />
              <span className="vt-corner vt-tr" aria-hidden="true" />
              <span className="vt-corner vt-bl" aria-hidden="true" />
              <span className="vt-corner vt-br" aria-hidden="true" />
              <div className="vt-hud-top">
                <span className={`vt-chip${stats.tracking ? ' is-live' : ''}`}>
                  <i className="vt-pulse" aria-hidden="true" />
                  {statusLabel}
                </span>
                <span className="vt-chip vt-chip-ghost vt-mono">
                  {stats.delegate ? `${stats.delegate} · ` : ''}
                  {mode === 'camera' ? `${stats.fps} FPS` : 'STILL'}
                </span>
              </div>
              {stats.hint && (
                <div className="vt-hint" role="status">
                  {stats.hint}
                </div>
              )}
              <div className="vt-readouts vt-mono" aria-label="Body measurements">
                <span>
                  SHOULDER <b>{fmt(stats.shoulderCm)}</b>
                  <small>cm</small>
                </span>
                <i aria-hidden="true">·</i>
                <span>
                  TORSO <b>{fmt(stats.torsoCm, 0)}</b>
                  <small>cm</small>
                </span>
                <i aria-hidden="true">·</i>
                <span>
                  CONFIDENCE <b>{stats.tracking ? Math.round(stats.confidence * 100) : '—'}</b>
                  <small>%</small>
                </span>
              </div>
            </div>
          )}

          {mode === 'mannequin' && (
            <div className="vt-mannequin">
              <Suspense
                fallback={
                  <div className="vt-loading vt-mono" role="status">
                    <span className="vt-spinner" aria-hidden="true" /> PREPARING ATELIER
                  </div>
                }
              >
                <Mannequin
                  heightCm={heightCm}
                  build={build}
                  garment={mannequinGarment}
                  colorHex={color?.hex}
                  reducedMotion={reducedMotion}
                  onCanvas={onGlCanvas}
                  GarmentModel={GarmentModel}
                />
              </Suspense>
              <div className="vt-glass vt-mq-controls">
                <div className="vt-eyebrow">Your proportions</div>
                <label className="vt-range">
                  <span className="vt-range-row">
                    <span>Height</span>
                    <span className="vt-mono">{heightCm} cm</span>
                  </span>
                  <input type="range" min={150} max={200} step={1} value={heightCm} onChange={(e) => setHeightCm(+e.target.value)} aria-label="Mannequin height in centimetres" />
                </label>
                <label className="vt-range">
                  <span className="vt-range-row">
                    <span>Build</span>
                    <span className="vt-mono">{BUILD_LABELS[Math.round(build)]}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.01}
                    value={build}
                    onChange={(e) => setBuild(+e.target.value)}
                    aria-label="Mannequin build"
                    aria-valuetext={BUILD_LABELS[Math.round(build)]}
                  />
                  <span className="vt-range-ticks" aria-hidden="true">
                    {BUILD_LABELS.map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </span>
                </label>
                <p className="vt-micro">Drag to orbit · scroll to zoom</p>
              </div>
            </div>
          )}

          {mode === 'start' && (
            <div className="vt-start">
              <div className="vt-start-copy">
                <div className="vt-eyebrow">The mirror room</div>
                <h2 className="vt-display">
                  Step into the <em>mirror.</em>
                </h2>
                <p className="vt-lede">
                  Our on-device scanner maps your posture in real time and drapes the <strong>{product.name}</strong> to your frame — then reads your shoulders to
                  recommend a size.
                </p>
                <ol className="vt-steps">
                  <li>
                    <span className="vt-mono">01</span>Tell us your height so we can calibrate.
                  </li>
                  <li>
                    <span className="vt-mono">02</span>Stand about two metres back — shoulders to hips in view.
                  </li>
                  <li>
                    <span className="vt-mono">03</span>Move freely. The garment follows you.
                  </li>
                </ol>
                <label className="vt-height" htmlFor={`${ids}-h`}>
                  <span className="vt-eyebrow">Your height</span>
                  <span className="vt-height-row">
                    <input
                      id={`${ids}-h`}
                      type="range"
                      min={150}
                      max={200}
                      step={1}
                      value={heightCm}
                      onChange={(e) => setHeightCm(+e.target.value)}
                      aria-label="Your height in centimetres"
                    />
                    <output className="vt-mono" htmlFor={`${ids}-h`}>
                      {heightCm}
                      <small> cm</small>
                    </output>
                  </span>
                </label>
                <div className="vt-start-actions">
                  <button type="button" className="vt-btn vt-btn-primary" onClick={startCamera} data-autofocus="">
                    {Icon.camera} Enable camera
                  </button>
                  <button type="button" className="vt-btn" onClick={pickPhoto}>
                    {Icon.upload} Upload a photo
                  </button>
                  <button type="button" className="vt-btn vt-btn-ghost" onClick={startMannequin}>
                    {Icon.figure} Try without camera
                  </button>
                </div>
                <p className="vt-privacy">
                  {Icon.lock} Processed on your device. Nothing is uploaded or stored.
                </p>
              </div>
              <div className="vt-start-art">
                <ScannerArt garment={product.garment} />
              </div>
            </div>
          )}

          {notice && (
            <div className="vt-notice vt-glass" role="alert">
              <div className="vt-notice-text">
                <strong>{notice.title}</strong>
                <p>{notice.body}</p>
                {notice.actions.length > 0 && (
                  <div className="vt-notice-actions">
                    {notice.actions.includes('photo') && (
                      <button type="button" className="vt-btn vt-btn-sm" onClick={pickPhoto}>
                        {Icon.upload} Try a photo instead
                      </button>
                    )}
                    {notice.actions.includes('retry') && (
                      <button type="button" className="vt-btn vt-btn-sm vt-btn-ghost" onClick={startCamera}>
                        Retry camera
                      </button>
                    )}
                    {notice.actions.includes('mannequin') && (
                      <button type="button" className="vt-btn vt-btn-sm vt-btn-ghost" onClick={startMannequin}>
                        Use 3D mannequin
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button type="button" className="vt-icon-btn vt-icon-sm" aria-label="Dismiss message" onClick={() => setNotice(null)}>
                {Icon.close}
              </button>
            </div>
          )}
        </section>

        <aside className="vt-panel" aria-label="Product options">
          <div className="vt-panel-scroll">
            <div className="vt-eyebrow">
              {product.garment} · {product.fit} fit
            </div>
            <h1 className="vt-name">{product.name}</h1>
            <div className="vt-price vt-mono">{formatPrice(product.price)}</div>

            <div className="vt-section">
              <div className="vt-label-row">
                <span className="vt-label">Colourway</span>
                <span className="vt-label-value">{color?.name}</span>
              </div>
              <div className="vt-swatches" role="radiogroup" aria-label="Colourway">
                {product.colors.map((c, i) => (
                  <button
                    key={c.name + i}
                    type="button"
                    role="radio"
                    aria-checked={i === colorIndex}
                    aria-label={c.name}
                    title={c.name}
                    className="vt-swatch"
                    style={{ ['--sw' as string]: c.hex }}
                    onClick={() => setColorIndex(i)}
                  />
                ))}
              </div>
            </div>

            <div className="vt-section">
              <div className="vt-label-row">
                <span className="vt-label">Size</span>
                <span className="vt-rec" title={recBasis}>
                  Recommended: <b>{rec.size}</b> · {rec.match}% match
                </span>
              </div>
              <div className="vt-sizes" role="radiogroup" aria-label="Size">
                {product.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={s === size}
                    className={`vt-size${s === rec.size ? ' is-rec' : ''}`}
                    onClick={() => setPickedSize(s)}
                    aria-label={s === rec.size ? `${s}, recommended` : s}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="vt-micro">
                {recBasis}
                {kind !== 'bottom' && /boxy|oversize/i.test(product.fit) ? ' · cut generously — size down for a closer fit' : ''}
              </p>
            </div>

            {mode !== 'start' && mode !== 'mannequin' && (
              <div className="vt-section vt-height-mini">
                <label className="vt-range">
                  <span className="vt-range-row">
                    <span className="vt-label">Your height</span>
                    <span className="vt-mono">{heightCm} cm</span>
                  </span>
                  <input type="range" min={150} max={200} step={1} value={heightCm} onChange={(e) => setHeightCm(+e.target.value)} aria-label="Your height in centimetres" />
                </label>
              </div>
            )}

            <div className="vt-cta">
              <button type="button" className="vt-btn vt-btn-outline" onClick={takeSnapshot} disabled={!canCapture}>
                {Icon.snap} Snapshot
              </button>
              <button type="button" className="vt-btn vt-btn-primary vt-btn-wide" onClick={addToBag}>
                {Icon.bag} {added ? `Added — ${size}` : `Add to bag — ${formatPrice(product.price)}`}
              </button>
            </div>

            {products.length > 1 && (
              <div className="vt-section">
                <div className="vt-label-row">
                  <span className="vt-label">Try another piece</span>
                  <span className="vt-label-value vt-mono">
                    {String(products.findIndex((p) => p.id === product.id) + 1).padStart(2, '0')}/{String(products.length).padStart(2, '0')}
                  </span>
                </div>
                <div className="vt-carousel" role="listbox" aria-label="Products">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={p.id === product.id}
                      className="vt-thumb"
                      onClick={() => switchProduct(p.id)}
                      aria-label={`${p.name}, ${formatPrice(p.price)}`}
                    >
                      <span className="vt-thumb-img">
                        <img
                          src={resolveAssetUrl(p.image)}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                          }}
                        />
                        <span className="vt-thumb-fallback" aria-hidden="true">
                          {p.garment}
                        </span>
                      </span>
                      <span className="vt-thumb-name">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="vt-privacy vt-privacy-panel">
              {Icon.lock} Processed on your device. Nothing is uploaded or stored.
            </p>
          </div>
        </aside>
      </div>

      {snapshot && (
        <div className="vt-snapshot" role="dialog" aria-modal="true" aria-label="Your look">
          <div className="vt-snapshot-card vt-glass">
            <div className="vt-label-row">
              <span className="vt-eyebrow">Your look</span>
              <button type="button" className="vt-icon-btn vt-icon-sm" aria-label="Close snapshot preview" onClick={() => setSnapshot(null)}>
                {Icon.close}
              </button>
            </div>
            <img src={snapshot} alt={`Snapshot of the ${product.name} try-on`} />
            <div className="vt-snapshot-actions">
              <a className="vt-btn vt-btn-primary" href={snapshot} download={`veloura-${product.id}-look.png`} data-autofocus="">
                Download look
              </a>
              <button type="button" className="vt-btn vt-btn-ghost" onClick={() => setSnapshot(null)}>
                Back to fitting
              </button>
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="vt-file" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  )
}

export default TryOnStudio
