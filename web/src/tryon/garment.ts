import { analyzeGarmentAlpha, colorDistance, garmentKind, hexToRgb, isSleeved, tintPixels, type GarmentMeta } from './fit-math'
import { drawPlaceholderGarment } from './placeholder'

export interface PreparedGarment {
  key: string
  garment: string
  canvas: HTMLCanvasElement
  data: ImageData
  meta: GarmentMeta
  source: 'image' | 'placeholder'
}

const MAX_H = 1000

/** Resolve catalog asset paths ("/renders/x.png") relative to the document so `base: './'` builds work. */
export function resolveAssetUrl(url: string): string {
  if (!url) return url
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  const rel = url.startsWith('/') ? url.slice(1) : url
  try {
    return new URL(rel, document.baseURI).href
  } catch {
    return url
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${src}`))
    img.src = src
  })
}

const cache = new Map<string, Promise<PreparedGarment>>()

function prepare(key: string, garment: string, source: CanvasImageSource & { width: number; height: number }, kind: PreparedGarment['source']): PreparedGarment {
  const sw = (source as HTMLImageElement).naturalWidth || source.width
  const sh = (source as HTMLImageElement).naturalHeight || source.height
  const k = Math.min(1, MAX_H / sh)
  const w = Math.max(1, Math.round(sw * k))
  const h = Math.max(1, Math.round(sh * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const meta = analyzeGarmentAlpha(data.data, w, h, garmentKind(garment), isSleeved(garment))
  return { key, garment, canvas, data, meta, source: kind }
}

/** Load + analyse a garment render. Falls back to a procedural placeholder — never rejects. */
export function loadGarment(url: string, garment: string): Promise<PreparedGarment> {
  const key = `${garment}|${url}`
  const hit = cache.get(key)
  if (hit) return hit
  const p = (async () => {
    try {
      if (!url) throw new Error('no image')
      const img = await loadImage(resolveAssetUrl(url))
      const g = prepare(key, garment, img, 'image')
      // A render with no opaque pixels (or a JPEG) gives no usable alpha → placeholder.
      const { x0, y0, x1, y1 } = g.meta.bbox
      if (x1 - x0 >= g.meta.width - 2 && y1 - y0 >= g.meta.height - 2) throw new Error('no alpha')
      return g
    } catch {
      return prepare(key, garment, drawPlaceholderGarment(garment), 'placeholder')
    }
  })()
  cache.set(key, p)
  return p
}

const tintCache = new WeakMap<PreparedGarment, Map<string, HTMLCanvasElement>>()

/**
 * Colourway variant of a garment. If the render already matches the requested colour
 * (e.g. it was shot in the default colourway) the original pixels are used untouched.
 */
export function tintedGarment(g: PreparedGarment, hex: string | undefined): HTMLCanvasElement {
  if (!hex) return g.canvas
  let m = tintCache.get(g)
  if (!m) tintCache.set(g, (m = new Map()))
  const hit = m.get(hex)
  if (hit) return hit
  let out: HTMLCanvasElement
  if (g.source === 'image' && colorDistance(g.meta.meanColor, hexToRgb(hex)) < 38) {
    out = g.canvas
  } else {
    out = document.createElement('canvas')
    out.width = g.canvas.width
    out.height = g.canvas.height
    const ctx = out.getContext('2d')!
    const img = ctx.createImageData(out.width, out.height)
    tintPixels(g.data.data, img.data, hex, g.meta.meanLum)
    ctx.putImageData(img, 0, 0)
  }
  m.set(hex, out)
  return out
}

/** Crop to the alpha bounding box (with a little padding) — for textures and thumbnails. */
export function cropToContent(src: HTMLCanvasElement, meta: GarmentMeta, pad = 4): { canvas: HTMLCanvasElement; ox: number; oy: number } {
  const { x0, y0, x1, y1 } = meta.bbox
  const ox = Math.max(0, x0 - pad)
  const oy = Math.max(0, y0 - pad)
  const w = Math.min(src.width, x1 + pad + 1) - ox
  const h = Math.min(src.height, y1 + pad + 1) - oy
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  c.getContext('2d')!.drawImage(src, ox, oy, w, h, 0, 0, w, h)
  return { canvas: c, ox, oy }
}
