import {
  LM,
  LandmarkSmoother,
  affineMatrix,
  clamp,
  computeBottomFit,
  computeTopFit,
  estimateBody,
  rotateAbout,
  type BodyPoints,
  type GarmentFit,
  type GarmentMeta,
  type Landmark,
  type Vec,
} from './fit-math'
import { loadPoseLandmarker, type Delegate, type LoadedPose } from './pose'

export type CameraErrorCode = 'denied' | 'no-camera' | 'insecure' | 'in-use' | 'unknown'

export class CameraError extends Error {
  constructor(
    public code: CameraErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'CameraError'
  }
}

export type ModelState = 'idle' | 'loading' | 'ready' | 'failed'

export interface EngineStats {
  source: 'camera' | 'photo' | null
  model: ModelState
  delegate: Delegate | null
  tracking: boolean
  hint: string | null
  shoulderCm: number | null
  torsoCm: number | null
  confidence: number
  basis: 'full-body' | 'torso' | null
  fps: number
}

export interface EngineGarment {
  canvas: HTMLCanvasElement
  meta: GarmentMeta
  garment: string
  fit: string
}

interface EngineOptions {
  canvas: HTMLCanvasElement
  hud: HTMLCanvasElement
  onStats: (s: EngineStats) => void
  onModelError?: (err: unknown) => void
}

const HINT_NO_BODY = 'No body detected — step back so your shoulders and hips are visible'
const HINT_HIPS = 'Step back a little — we need to see your hips'
const HINT_LEGS = 'Step back so your legs are in frame, down to your ankles'
const HINT_PHOTO = 'We couldn’t find a person in this photo — try a front-facing, full-length shot'
const HINT_CALIBRATING = 'Calibrating scanner…'

const DOTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
const BONES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
]

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number
  cancelVideoFrameCallback?: (id: number) => void
}

export class TryOnEngine {
  private canvas: HTMLCanvasElement
  private hud: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private hctx: CanvasRenderingContext2D
  private layer = document.createElement('canvas')
  private lctx = this.layer.getContext('2d')!
  private lightCanvas = document.createElement('canvas')
  private lightCtx = this.lightCanvas.getContext('2d', { willReadFrequently: true })!
  private onStats: EngineOptions['onStats']
  private onModelError?: EngineOptions['onModelError']

  private video: VideoWithRvfc | null = null
  private stream: MediaStream | null = null
  private photo: HTMLImageElement | null = null
  private photoUrl: string | null = null
  private source: 'camera' | 'photo' | null = null
  private session = 0

  private pose: LoadedPose | null = null
  private poseMode: 'VIDEO' | 'IMAGE' | null = null
  private posePromise: Promise<LoadedPose | null> | null = null
  private model: ModelState = 'idle'
  private detectErrors = 0
  /** EMA of detection cost (ms) — drives adaptive throttling and the GPU→CPU switch. */
  private detectCost = 0
  private detectSamples = 0
  private triedCpu = false

  private smoother = new LandmarkSmoother(0.9, 5)
  private landmarks: Landmark[] | null = null
  private lastSeen = 0
  private lastDetect = 0
  private lastTs = 0
  private detections: number[] = []

  private running = false
  private rafId = 0
  private vfcId = 0
  private frame = 0

  private garment: EngineGarment | null = null
  private heightCm = 175
  private shoulderEma: number | null = null
  private torsoEma: number | null = null
  private light = { lum: 0.5, lr: 0 }
  private view = { s: 1, dx: 0, dy: 0, sw: 1, sh: 1, mirror: false }
  private lastStats = 0
  private ro: ResizeObserver | null = null
  private disposed = false

  constructor(opts: EngineOptions) {
    this.canvas = opts.canvas
    this.hud = opts.hud
    this.ctx = opts.canvas.getContext('2d')!
    this.hctx = opts.hud.getContext('2d')!
    this.onStats = opts.onStats
    this.onModelError = opts.onModelError
    this.lightCanvas.width = 24
    this.lightCanvas.height = 14
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        if (this.source === 'photo') this.render()
      })
      this.ro.observe(this.canvas)
    }
  }

  // ------------------------------------------------------------------ public

  setGarment(g: EngineGarment | null): void {
    this.garment = g
    if (this.source === 'photo') this.render()
  }

  setHeight(cm: number): void {
    this.heightCm = cm
    this.shoulderEma = null
    this.torsoEma = null
    if (this.source === 'photo') this.render()
  }

  get modelState(): ModelState {
    return this.model
  }

  get activeSource() {
    return this.source
  }

  /** Request the front camera and start the live tracking loop. Throws CameraError. */
  async startCamera(): Promise<void> {
    this.stopSource()
    this.resetFailedModel()
    const session = ++this.session
    if (typeof window !== 'undefined' && window.isSecureContext === false) throw new CameraError('insecure')
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('no-camera')
    this.emit(true)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
    } catch (e) {
      throw mapCameraError(e)
    }
    if (this.disposed || session !== this.session) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    const video = document.createElement('video') as VideoWithRvfc
    video.playsInline = true
    video.muted = true
    video.autoplay = true
    video.setAttribute('playsinline', '')
    video.srcObject = stream
    this.stream = stream
    this.video = video
    try {
      await video.play()
    } catch {
      /* autoplay with muted video normally succeeds; frames still arrive via readyState */
    }
    if (this.disposed || session !== this.session) return
    this.source = 'camera'
    this.running = true
    this.scheduleNext()
    void this.ensurePose('VIDEO')
  }

  /** Run the same pipeline on a still image (IMAGE running mode). */
  async startPhoto(file: Blob): Promise<void> {
    this.stopSource()
    this.resetFailedModel()
    const session = ++this.session
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('That file could not be read as an image.'))
      img.src = url
    }).catch((e) => {
      URL.revokeObjectURL(url)
      throw e
    })
    if (this.disposed || session !== this.session) {
      URL.revokeObjectURL(url)
      return
    }
    this.photo = img
    this.photoUrl = url
    this.source = 'photo'
    this.render()
    const pose = await this.ensurePose('IMAGE')
    if (!pose || this.disposed || session !== this.session) return
    try {
      const res = pose.landmarker.detect(img)
      this.landmarks = res.landmarks?.[0] ?? null
    } catch (e) {
      console.warn('[tryon] photo detection failed', e)
      this.landmarks = null
    }
    this.render()
    this.emit(true)
  }

  /** Stop camera tracks, the render loop and clear the canvases. Keeps the model loaded. */
  stopSource(): void {
    this.session++
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    if (this.vfcId && this.video?.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.vfcId)
    this.rafId = 0
    this.vfcId = 0
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.video) {
      this.video.pause()
      this.video.srcObject = null
    }
    this.video = null
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl)
    this.photoUrl = null
    this.photo = null
    this.source = null
    this.landmarks = null
    this.smoother.reset()
    this.shoulderEma = null
    this.torsoEma = null
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.hctx.setTransform(1, 0, 0, 1, 0, 0)
    this.hctx.clearRect(0, 0, this.hud.width, this.hud.height)
  }

  dispose(): void {
    this.stopSource()
    this.disposed = true
    this.ro?.disconnect()
    try {
      this.pose?.landmarker.close()
    } catch {
      /* ignore */
    }
    this.pose = null
  }

  /** PNG data URL of the current composite (video/photo + garment, no HUD). */
  snapshot(label?: string): string | null {
    return brandSnapshot(this.canvas, label)
  }

  // ------------------------------------------------------------------ model

  /** Allow a fresh model download attempt after a failure (called on explicit user retries). */
  private resetFailedModel(): void {
    if (this.model !== 'failed') return
    this.model = 'idle'
    this.posePromise = null
    this.triedCpu = false
  }

  private async ensurePose(mode: 'VIDEO' | 'IMAGE'): Promise<LoadedPose | null> {
    if (this.model === 'failed') return null
    if (!this.posePromise) {
      this.model = 'loading'
      this.emit(true)
      this.posePromise = loadPoseLandmarker(mode)
        .then((p) => {
          if (this.disposed) {
            p.landmarker.close()
            return null
          }
          this.pose = p
          this.poseMode = mode
          this.model = 'ready'
          console.info(`[tryon] pose model ready (${p.delegate} delegate)`)
          this.emit(true)
          return p
        })
        .catch((e) => {
          this.model = 'failed'
          console.warn('[tryon] pose model failed to load', e)
          this.emit(true)
          this.onModelError?.(e)
          return null
        })
    }
    const p = await this.posePromise
    if (p && this.poseMode !== mode) {
      await p.landmarker.setOptions({ runningMode: mode })
      this.poseMode = mode
      this.smoother.reset()
      this.lastTs = 0
    }
    return p
  }

  private async fallbackToCpu(): Promise<void> {
    if (this.triedCpu) return
    this.triedCpu = true
    this.detectSamples = 0
    this.detectCost = 0
    const old = this.pose
    this.pose = null
    try {
      old?.landmarker.close()
    } catch {
      /* ignore */
    }
    this.posePromise = loadPoseLandmarker(this.poseMode ?? 'VIDEO', false)
      .then((p) => {
        if (this.disposed) {
          p.landmarker.close()
          return null
        }
        this.pose = p
        this.poseMode = this.poseMode ?? 'VIDEO'
        this.lastTs = 0
        this.detectErrors = 0
        console.info('[tryon] switched pose model to CPU delegate')
        this.emit(true)
        return p
      })
      .catch((e) => {
        this.model = 'failed'
        this.emit(true)
        this.onModelError?.(e)
        return null
      })
  }

  // ------------------------------------------------------------------ loop

  private scheduleNext(): void {
    if (!this.running) return
    const v = this.video
    if (v?.requestVideoFrameCallback) this.vfcId = v.requestVideoFrameCallback((now) => this.tick(now))
    else this.rafId = requestAnimationFrame((t) => this.tick(t))
  }

  private tick(now: number): void {
    if (!this.running) return
    try {
      const v = this.video
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        // ≤30 fps, and never let detection eat more than ~70% of the main thread.
        if (now - this.lastDetect >= Math.min(1000, Math.max(32, this.detectCost * 1.4))) {
          this.lastDetect = now
          this.detect(v)
        }
        this.render()
        this.emit()
      }
    } catch (e) {
      console.warn('[tryon] frame error', e)
    }
    this.scheduleNext()
  }

  private detect(v: HTMLVideoElement): void {
    const fake = import.meta.env.DEV ? (window as unknown as { __VT_FAKE_POSE__?: Landmark[] }).__VT_FAKE_POSE__ : undefined
    const t = performance.now()
    if (fake) {
      this.landmarks = this.smoother.smooth(fake, t / 1000)
      this.lastSeen = t
      this.detections.push(t)
      return
    }
    if (!this.pose || this.poseMode !== 'VIDEO') return
    const ts = Math.max(this.lastTs + 1, Math.round(t))
    this.lastTs = ts
    try {
      const res = this.pose.landmarker.detectForVideo(v, ts)
      // First calls include shader compilation / warm-up — don't let them skew the estimate.
      const cost = Math.min(1000, performance.now() - t)
      if (this.detectSamples++ >= 3) this.detectCost = this.detectCost ? this.detectCost * 0.85 + cost * 0.15 : cost
      if (this.pose.delegate === 'GPU' && !this.triedCpu && this.detectSamples > 15 && this.detectCost > 110) {
        // Software-emulated / weak GPUs are often slower than the WASM CPU path.
        console.info(`[tryon] GPU detection slow (${Math.round(this.detectCost)} ms) — trying CPU delegate`)
        void this.fallbackToCpu()
      }
      this.detectErrors = 0
      this.detections.push(t)
      const lms = res.landmarks?.[0]
      if (lms && lms.length >= 29) {
        this.landmarks = this.smoother.smooth(lms, t / 1000)
        this.lastSeen = t
      } else if (t - this.lastSeen > 350) {
        this.landmarks = null
      }
    } catch (e) {
      this.detectErrors++
      if (this.detectErrors === 3 && this.pose?.delegate === 'GPU') void this.fallbackToCpu()
      else if (this.detectErrors === 1) console.warn('[tryon] detection error', e)
    }
    while (this.detections.length && t - this.detections[0] > 1000) this.detections.shift()
  }

  // ------------------------------------------------------------------ rendering

  private ensureSize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
    for (const c of [this.canvas, this.hud, this.layer]) {
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
    }
  }

  private toScreen(p: Landmark): Vec {
    const { s, dx, dy, sw, sh, mirror } = this.view
    const x = dx + p.x * sw * s
    return { x: mirror ? this.canvas.width - x : x, y: dy + p.y * sh * s }
  }

  private sampleLight(src: CanvasImageSource): void {
    const c = this.lightCtx
    c.drawImage(src, 0, 0, 24, 14)
    const d = c.getImageData(0, 0, 24, 14).data
    let l = 0,
      left = 0,
      right = 0
    for (let y = 0; y < 14; y++) {
      for (let x = 0; x < 24; x++) {
        const i = (y * 24 + x) * 4
        const v = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
        l += v
        if (x < 12) left += v
        else right += v
      }
    }
    const n = 24 * 14
    const lum = l / n
    // Video is mirrored on screen: source-left is screen-right.
    const lr = this.view.mirror ? (left - right) / (n / 2) : (right - left) / (n / 2)
    this.light.lum = this.light.lum * 0.7 + lum * 0.3
    this.light.lr = this.light.lr * 0.7 + lr * 0.3
  }

  render(): void {
    if (this.disposed) return
    this.ensureSize()
    const { canvas, ctx } = this
    const W = canvas.width,
      H = canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const src: (CanvasImageSource & { width: number }) | null = this.source === 'camera' ? this.video : this.photo
    if (!src) return
    const sw = this.source === 'camera' ? this.video!.videoWidth : this.photo!.naturalWidth
    const sh = this.source === 'camera' ? this.video!.videoHeight : this.photo!.naturalHeight
    if (!sw || !sh) return
    const mirror = this.source === 'camera'
    const s = this.source === 'camera' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)
    const dw = sw * s,
      dh = sh * s
    const dx = (W - dw) / 2,
      dy = (H - dh) / 2
    this.view = { s, dx, dy, sw, sh, mirror }

    if (mirror) ctx.setTransform(-1, 0, 0, 1, W, 0)
    ctx.drawImage(src, dx, dy, dw, dh)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    if (this.frame++ % 15 === 0 || this.source === 'photo') {
      try {
        this.sampleLight(src)
      } catch {
        /* tainted or not ready */
      }
    }

    const lms = this.landmarks
    if (lms && this.garment) this.drawGarment(lms, this.garment)
    this.drawHud(lms)
  }

  private bodyPoints(lms: Landmark[]): { pts: BodyPoints; has: (i: number) => boolean } | null {
    const has = (i: number) => !!lms[i] && (lms[i].visibility ?? 1) >= 0.5
    if (!has(LM.lShoulder) || !has(LM.rShoulder)) return null
    const P = (i: number) => this.toScreen(lms[i])
    // Pair landmarks by screen side so the garment's image-left always goes to screen-left.
    const a = P(LM.lShoulder),
      b = P(LM.rShoulder)
    const flip = a.x > b.x
    const pick = (l: number, r: number): [Vec | undefined, Vec | undefined] => {
      const L = has(l) ? P(l) : undefined
      const R = has(r) ? P(r) : undefined
      return flip ? [R, L] : [L, R]
    }
    const [lh, rh] = pick(LM.lHip, LM.rHip)
    const [le, re] = pick(LM.lElbow, LM.rElbow)
    const [lk, rk] = pick(LM.lKnee, LM.rKnee)
    const [la, ra] = pick(LM.lAnkle, LM.rAnkle)
    const pts: BodyPoints = {
      ls: flip ? b : a,
      rs: flip ? a : b,
      lh: lh && rh ? lh : undefined,
      rh: lh && rh ? rh : undefined,
      le,
      re,
      lk: lk && rk ? lk : undefined,
      rk: lk && rk ? rk : undefined,
      la: la && ra ? la : undefined,
      ra: la && ra ? ra : undefined,
    }
    return { pts, has }
  }

  private drawGarment(lms: Landmark[], g: EngineGarment): void {
    const bp = this.bodyPoints(lms)
    if (!bp) return
    const { pts } = bp
    if (g.meta.kind === 'bottom' && !pts.lh) return
    const fit: GarmentFit =
      g.meta.kind === 'bottom'
        ? computeBottomFit(pts, g.meta, { garment: g.garment, fit: g.fit })
        : computeTopFit(pts, g.meta, { garment: g.garment, fit: g.fit })
    const L = this.lctx
    const W = this.layer.width,
      H = this.layer.height
    L.setTransform(1, 0, 0, 1, 0, 0)
    L.globalCompositeOperation = 'source-over'
    L.clearRect(0, 0, W, H)
    L.imageSmoothingQuality = 'high'
    const m = affineMatrix(fit)
    const art = [fit.sleeves.left, fit.sleeves.right].filter((s): s is NonNullable<typeof s> => !!s && s.delta !== 0)
    if (!art.length) {
      L.setTransform(...m)
      L.drawImage(g.canvas, 0, 0)
    } else {
      // Sleeves behind the torso. Partial copies clipped near the shoulder fill the underarm
      // wedge (reads like bunched fabric) without fanning out the whole sleeve.
      const poly = (pts: Vec[]) => pts.forEach((p, i) => (i ? L.lineTo(p.x, p.y) : L.moveTo(p.x, p.y)))
      for (const s of art) {
        const reach = Math.hypot(s.info.centroid.x - s.info.pivot.x, s.info.centroid.y - s.info.pivot.y) * 0.75
        for (const k of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
          L.save()
          L.setTransform(...rotateAbout(m, s.pivotScreen, s.delta * k))
          L.beginPath()
          poly(s.info.region)
          L.closePath()
          L.clip()
          if (k < 1) {
            L.beginPath()
            L.arc(s.info.pivot.x, s.info.pivot.y, reach, 0, Math.PI * 2)
            L.clip()
          }
          L.drawImage(g.canvas, 0, 0)
          L.restore()
        }
      }
      L.save()
      L.setTransform(...m)
      L.beginPath()
      L.rect(-4, -4, g.canvas.width + 8, g.canvas.height + 8)
      for (const s of art) {
        poly(s.info.torsoCut)
        L.closePath()
      }
      L.clip('evenodd')
      L.drawImage(g.canvas, 0, 0)
      L.restore()
    }

    // Scene-light shading pass (only touches garment pixels).
    L.setTransform(1, 0, 0, 1, 0, 0)
    L.globalCompositeOperation = 'source-atop'
    const b = clamp(0.62 + 0.8 * this.light.lum, 0.66, 1.1)
    if (b < 1) {
      L.fillStyle = `rgba(10,7,12,${(1 - b).toFixed(3)})`
      L.fillRect(0, 0, W, H)
    } else if (b > 1) {
      L.fillStyle = `rgba(255,246,232,${((b - 1) * 0.6).toFixed(3)})`
      L.fillRect(0, 0, W, H)
    }
    // Directional light across the body + soft falloff toward the hem for volume.
    const c = Math.cos(fit.angle),
      sn = Math.sin(fit.angle)
    const span = (g.meta.spanR - g.meta.spanL) * fit.sx
    const a0 = fit.anchorScreen
    const lr = clamp(this.light.lr * 2.2, -0.35, 0.35)
    const gx = L.createLinearGradient(a0.x - c * span, a0.y - sn * span, a0.x + c * span, a0.y + sn * span)
    const dark = (v: number) => `rgba(8,5,10,${Math.max(0, v).toFixed(3)})`
    gx.addColorStop(0, dark(0.16 + lr * 0.5))
    gx.addColorStop(0.5, dark(0))
    gx.addColorStop(1, dark(0.16 - lr * 0.5))
    L.fillStyle = gx
    L.fillRect(0, 0, W, H)
    const len = (g.meta.hemY - g.meta.anchorY) * fit.sy
    const gy = L.createLinearGradient(a0.x, a0.y, a0.x - sn * len, a0.y + c * len)
    gy.addColorStop(0, 'rgba(255,240,220,0.05)')
    gy.addColorStop(0.55, 'rgba(0,0,0,0)')
    gy.addColorStop(1, 'rgba(8,5,10,0.18)')
    L.fillStyle = gy
    L.fillRect(0, 0, W, H)
    L.globalCompositeOperation = 'source-over'

    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.38)'
    ctx.shadowBlur = Math.round(16 * (W / 1000) + 4)
    ctx.shadowOffsetY = Math.round(5 * (W / 1000) + 1)
    ctx.drawImage(this.layer, 0, 0)
    ctx.restore()
  }

  private drawHud(lms: Landmark[] | null): void {
    const h = this.hctx
    const W = this.hud.width,
      H = this.hud.height
    h.setTransform(1, 0, 0, 1, 0, 0)
    h.clearRect(0, 0, W, H)
    const u = Math.max(1, W / 1200)
    if (lms) {
      const has = (i: number) => !!lms[i] && (lms[i].visibility ?? 1) >= 0.5
      h.lineWidth = 1 * u
      h.strokeStyle = 'rgba(217,185,140,0.28)'
      h.beginPath()
      for (const [a, b] of BONES) {
        if (!has(a) || !has(b)) continue
        const p = this.toScreen(lms[a]),
          q = this.toScreen(lms[b])
        h.moveTo(p.x, p.y)
        h.lineTo(q.x, q.y)
      }
      h.stroke()
      for (const i of DOTS) {
        if (!has(i)) continue
        const p = this.toScreen(lms[i])
        h.fillStyle = 'rgba(230,220,203,0.85)'
        h.beginPath()
        h.arc(p.x, p.y, 2.2 * u, 0, Math.PI * 2)
        h.fill()
        h.strokeStyle = 'rgba(217,185,140,0.45)'
        h.beginPath()
        h.arc(p.x, p.y, 6 * u, 0, Math.PI * 2)
        h.stroke()
      }
      // Shoulder caliper
      if (has(11) && has(12) && this.shoulderEma) {
        const a = this.toScreen(lms[11]),
          b = this.toScreen(lms[12])
        const [p, q] = a.x < b.x ? [a, b] : [b, a]
        const d = Math.hypot(q.x - p.x, q.y - p.y) || 1
        const nx = (q.y - p.y) / d,
          ny = -(q.x - p.x) / d // points "up" relative to shoulder line
        const off = d * 0.42
        const P = { x: p.x + nx * off, y: p.y + ny * off }
        const Q = { x: q.x + nx * off, y: q.y + ny * off }
        h.strokeStyle = 'rgba(217,185,140,0.75)'
        h.lineWidth = 1 * u
        h.setLineDash([4 * u, 4 * u])
        h.beginPath()
        h.moveTo(P.x, P.y)
        h.lineTo(Q.x, Q.y)
        h.stroke()
        h.setLineDash([])
        const tick = 6 * u
        h.beginPath()
        for (const T of [P, Q]) {
          h.moveTo(T.x - nx * tick, T.y - ny * tick)
          h.lineTo(T.x + nx * tick, T.y + ny * tick)
        }
        h.stroke()
        const label = `${this.shoulderEma.toFixed(1)} CM`
        h.font = `${Math.round(11 * u)}px 'JetBrains Mono', ui-monospace, monospace`
        const tw = h.measureText(label).width
        const cx = (P.x + Q.x) / 2,
          cy = (P.y + Q.y) / 2 - 10 * u
        h.fillStyle = 'rgba(14,10,14,0.7)'
        h.fillRect(cx - tw / 2 - 6 * u, cy - 9 * u, tw + 12 * u, 16 * u)
        h.fillStyle = '#d9b98c'
        h.textAlign = 'center'
        h.textBaseline = 'middle'
        h.fillText(label, cx, cy)
      }
    } else if (this.source === 'camera' && this.model !== 'failed') {
      // Idle scan sweep while we look for a body.
      const t = reducedMotion() ? 0.5 : (performance.now() % 2800) / 2800
      const y = H * (0.08 + 0.84 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2)))
      const g = h.createLinearGradient(0, y - 60 * u, 0, y + 2 * u)
      g.addColorStop(0, 'rgba(217,185,140,0)')
      g.addColorStop(1, 'rgba(217,185,140,0.10)')
      h.fillStyle = g
      h.fillRect(0, y - 60 * u, W, 62 * u)
      h.fillStyle = 'rgba(217,185,140,0.55)'
      h.fillRect(W * 0.06, y, W * 0.88, Math.max(1, u))
    }
  }

  // ------------------------------------------------------------------ stats

  private emit(force = false): void {
    const now = performance.now()
    if (!force && now - this.lastStats < 250) return
    this.lastStats = now
    const lms = this.landmarks
    let hint: string | null = null
    let shoulderCm: number | null = null
    let torsoCm: number | null = null
    let confidence = 0
    let basis: EngineStats['basis'] = null
    const tracking = !!lms && !!this.bodyPoints(lms)
    if (this.source && this.model === 'loading' && !lms) hint = HINT_CALIBRATING
    else if (this.source && this.model === 'ready' && !tracking) hint = this.source === 'photo' ? HINT_PHOTO : HINT_NO_BODY
    if (lms && tracking) {
      const has = (i: number) => (lms[i]?.visibility ?? 1) >= 0.5
      const { sw, sh } = this.view
      const px = lms.map((p) => ({ x: p.x * sw, y: p.y * sh, visibility: p.visibility }))
      const est = estimateBody(px, this.heightCm)
      const idx = this.garment?.meta.kind === 'bottom' ? [23, 24, 25, 26, 27, 28] : [11, 12, 23, 24]
      confidence = idx.reduce((s, i) => s + clamp(lms[i]?.visibility ?? 0, 0, 1), 0) / idx.length
      if (est) {
        const k = this.source === 'photo' ? 1 : 0.15
        this.shoulderEma = this.shoulderEma == null ? est.shoulderCm : this.shoulderEma + (est.shoulderCm - this.shoulderEma) * k
        this.torsoEma = this.torsoEma == null ? est.torsoCm : this.torsoEma + (est.torsoCm - this.torsoEma) * k
        shoulderCm = this.shoulderEma
        torsoCm = this.torsoEma
        basis = est.basis
      }
      if (!has(23) || !has(24)) hint = HINT_HIPS
      else if (this.garment?.meta.kind === 'bottom' && !(has(27) && has(28)) && !(has(25) && has(26))) hint = HINT_LEGS
    }
    this.onStats({
      source: this.source,
      model: this.model,
      delegate: this.pose?.delegate ?? null,
      tracking,
      hint,
      shoulderCm,
      torsoCm,
      confidence,
      basis,
      fps: this.detections.length,
    })
  }
}

export function mapCameraError(e: unknown): CameraError {
  const name = (e as { name?: string })?.name ?? ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return new CameraError('denied')
  if (name === 'SecurityError') return new CameraError(window.isSecureContext === false ? 'insecure' : 'denied')
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return new CameraError('no-camera')
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return new CameraError('in-use')
  return new CameraError('unknown', (e as Error)?.message)
}

export const CAMERA_ERROR_COPY: Record<CameraErrorCode, { title: string; body: string }> = {
  denied: {
    title: 'Camera permission needed',
    body: 'Camera access is blocked. Allow it in your browser’s site settings, or try a photo instead.',
  },
  'no-camera': {
    title: 'No camera found',
    body: 'We couldn’t find a camera on this device. Upload a photo, or explore the fit on our 3D atelier mannequin.',
  },
  insecure: {
    title: 'Camera needs a secure connection',
    body: 'Live try-on needs a secure page (https or localhost) before the browser will share the camera. Upload a photo instead, or open the site over https.',
  },
  'in-use': {
    title: 'Camera is busy',
    body: 'Another app or tab is using your camera. Close it and retry, or try a photo instead.',
  },
  unknown: {
    title: 'Camera unavailable',
    body: 'The camera couldn’t start. Retry, or try a photo instead.',
  },
}

/** Composite a canvas onto the velvet background with the atelier wordmark → PNG data URL. */
export function brandSnapshot(src: HTMLCanvasElement, label = 'VÉLOURA ATELIER', caption = 'VIRTUAL FITTING'): string | null {
  if (!src.width || !src.height) return null
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const c = out.getContext('2d')!
  const bg = c.createRadialGradient(out.width / 2, out.height * 0.4, 0, out.width / 2, out.height * 0.4, Math.max(out.width, out.height) * 0.75)
  bg.addColorStop(0, '#2a1820')
  bg.addColorStop(1, '#0e0a0e')
  c.fillStyle = bg
  c.fillRect(0, 0, out.width, out.height)
  c.drawImage(src, 0, 0)
  const pad = Math.round(out.width * 0.03)
  const fs = Math.max(14, Math.round(Math.min(out.width, out.height * 1.6) * 0.022))
  const grad = c.createLinearGradient(0, out.height - fs * 5, 0, out.height)
  grad.addColorStop(0, 'rgba(14,10,14,0)')
  grad.addColorStop(1, 'rgba(14,10,14,0.7)')
  c.fillStyle = grad
  c.fillRect(0, out.height - fs * 5, out.width, fs * 5)
  c.textBaseline = 'alphabetic'
  c.fillStyle = '#d9b98c'
  c.font = `${Math.round(fs * 0.5)}px 'JetBrains Mono', ui-monospace, monospace`
  c.fillText(caption, pad, out.height - pad - fs * 1.25)
  c.fillStyle = '#e6dccb'
  c.font = `500 ${fs}px 'Bodoni Moda', serif`
  c.fillText(label, pad, out.height - pad)
  try {
    return out.toDataURL('image/png')
  } catch {
    return null
  }
}
