/**
 * VÉLOURA ATELIER commerce engine (pure TypeScript, no React).
 *
 * This is a line-for-line twin of `server/app/commerce.py`. The storefront uses it as the
 * offline fallback when the FastAPI service is unreachable, so every function returns the
 * exact JSON shape (camelCase keys, same numbers, same strings) as the matching endpoint:
 *
 *   getProducts      ↔ GET  /api/products
 *   getProduct       ↔ GET  /api/products/{id}
 *   searchProducts   ↔ GET  /api/search
 *   quoteCart        ↔ POST /api/cart/quote
 *   recommendFit     ↔ POST /api/fit/recommend
 *   checkDelivery    ↔ GET  /api/delivery/{pincode}
 *
 * Business-rule failures throw `CommerceError` whose `status`/`message` equal the API's
 * HTTP status and `detail`. Parity is verified by `server/tests/parity`.
 */
import catalogJson from '../../../shared/catalog.json'

/* ------------------------------------------------------------------ types */

export type Dept = 'men' | 'women' | 'drops'
export type Payment = 'upi' | 'card' | 'cod'
export type ShippingMode = 'standard' | 'express'
export type Preference = 'true' | 'relaxed' | 'snug'
export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'new'
export type Currency = 'INR' | 'EUR' | 'JPY' | 'USD'

export interface Color { name: string; hex: string }

export interface Product {
  id: string
  name: string
  dept: Dept
  garment: string
  price: number
  compareAt: number | null
  colors: Color[]
  sizes: string[]
  stock: Record<string, number>
  gsm: number | null
  material: string
  fit: string
  description: string
  badge: string | null
  rating: number
  reviews: number
  tags: string[]
  drop: string | null
  image: string
  images: string[]
}

export interface Promo {
  code: string
  type: 'percent' | 'flat'
  value: number
  label: string
  minSubtotal: number
  requiresPrepaid?: boolean
}

export interface SizeRow { size: string; chest: [number, number]; height: [number, number]; shoulder: number }

export interface ShippingConfig {
  freeAbove: number
  standardFee: number
  expressFee: number
  codFee: number
  exchangeDays: number
  currencies: Record<Currency, number>
}

export interface Catalog {
  products: Product[]
  promos: Promo[]
  sizeChart: { unit: string; rows: SizeRow[] }
  shipping: ShippingConfig
}

export interface CartItem { id: string; size: string; color: string; qty: number }

export interface QuoteLine {
  id: string
  name: string
  size: string
  color: string
  qty: number
  unitPrice: number
  lineTotal: number
  inStock: boolean
}

export interface Quote {
  lines: QuoteLine[]
  subtotal: number
  discount: number
  promoApplied: string | null
  promoError: string | null
  shippingFee: number
  codFee: number
  total: number
  savings: number
  freeShippingRemaining: number
}

export interface FitInput {
  heightCm: number
  weightKg?: number | null
  chestCm?: number | null
  shoulderCm?: number | null
  preference?: Preference
  garment?: string | null
  productId?: string | null
}

export interface FitResult { size: string; confidence: number; alternatives: string[]; reasons: string[] }

export interface DeliveryInfo {
  pincode: string
  serviceable: boolean
  city: string | null
  etaDays: number | null
  expressDays: number | null
  cod: boolean
}

export interface SearchResult { product: Product; score: number }
export interface SearchResponse { results: SearchResult[]; suggestions: string[] }
export interface ProductQuery { dept?: Dept | null; garment?: string | null; q?: string | null; sort?: SortKey | null }

/** Business-rule failure; `status` and `message` mirror the API's HTTP status and `detail`. */
export class CommerceError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'CommerceError'
    this.status = status
  }
}

/** Optional live-stock override: return units available for a product/size. */
export type StockLookup = (productId: string, size: string) => number

/* ------------------------------------------------------------------ data */

export const catalog = catalogJson as unknown as Catalog
export const products: Product[] = catalog.products
export const promos: Promo[] = catalog.promos
export const sizeChart = catalog.sizeChart
export const shippingConfig: ShippingConfig = catalog.shipping

const PAYMENTS: Payment[] = ['upi', 'card', 'cod']
const SHIPPING_MODES: ShippingMode[] = ['standard', 'express']
const PREFERENCES: Preference[] = ['true', 'relaxed', 'snug']
const SORTS: SortKey[] = ['featured', 'price-asc', 'price-desc', 'rating', 'new']
const DEPTS: Dept[] = ['men', 'women', 'drops']
const MAX_QTY = 10
const ROOMY_FITS = ['Boxy', 'Oversized']

/* ------------------------------------------------------------------ helpers */

/** Round half up — identical to the Python `round_to`. */
export function roundTo(x: number, places: number): number {
  const f = 10 ** places
  return Math.floor(x * f + 0.5) / f
}

const fmtNum = (x: number): string => String(x)

/** ₹ with Indian digit grouping (1,23,456). Integer rupees only. */
export function formatINR(n: number): string {
  const neg = n < 0
  let s = String(Math.trunc(Math.abs(n)))
  if (s.length > 3) {
    let head = s.slice(0, -3)
    const tail = s.slice(-3)
    const groups: string[] = []
    while (head.length > 2) {
      groups.unshift(head.slice(-2))
      head = head.slice(0, -2)
    }
    if (head) groups.unshift(head)
    s = groups.join(',') + ',' + tail
  }
  return (neg ? '-' : '') + '₹' + s
}

const LOCALES: Record<Currency, string> = { INR: 'en-IN', EUR: 'en-IE', JPY: 'ja-JP', USD: 'en-US' }
const formatters: Partial<Record<Currency, Intl.NumberFormat>> = {}

/** Format an INR amount in the given display currency using the catalog's conversion rates. */
export function formatPrice(inr: number, currency: Currency = 'INR'): string {
  const rate = shippingConfig.currencies[currency] ?? 1
  let f = formatters[currency]
  if (!f) {
    f = new Intl.NumberFormat(LOCALES[currency], {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    formatters[currency] = f
  }
  return f.format(inr * rate)
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function findProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id)
}

const catalogStock: StockLookup = (pid, size) => findProduct(pid)?.stock[size] ?? 0

function copyProduct(p: Product): Product {
  const stock: Record<string, number> = {}
  for (const s of p.sizes) stock[s] = p.stock[s] ?? 0
  return { ...p, stock }
}

/* ------------------------------------------------------------------ difflib port */

/** difflib.SequenceMatcher(None, a, b).ratio() — explicit port (no junk, short inputs). */
export function seqRatio(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  if (la + lb === 0) return 1
  const b2j = new Map<string, number[]>()
  for (let j = 0; j < lb; j++) {
    const arr = b2j.get(b[j])
    if (arr) arr.push(j)
    else b2j.set(b[j], [j])
  }
  const longest = (alo: number, ahi: number, blo: number, bhi: number): [number, number, number] => {
    let besti = alo
    let bestj = blo
    let bestsize = 0
    let j2len = new Map<number, number>()
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>()
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue
        if (j >= bhi) break
        const k = (j2len.get(j - 1) ?? 0) + 1
        newj2len.set(j, k)
        if (k > bestsize) {
          besti = i - k + 1
          bestj = j - k + 1
          bestsize = k
        }
      }
      j2len = newj2len
    }
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti--
      bestj--
      bestsize++
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) bestsize++
    return [besti, bestj, bestsize]
  }
  let matches = 0
  const queue: [number, number, number, number][] = [[0, la, 0, lb]]
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!
    const [i, j, k] = longest(alo, ahi, blo, bhi)
    if (k) {
      matches += k
      if (alo < i && blo < j) queue.push([alo, i, blo, j])
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi])
    }
  }
  return (2 * matches) / (la + lb)
}

/* ------------------------------------------------------------------ search */

const SYNONYMS: Record<string, string[]> = {
  pants: ['cargo'],
  pant: ['cargo'],
  trousers: ['cargo'],
  trouser: ['cargo'],
  joggers: ['cargo'],
  jacket: ['puffer', 'blazer'],
  jackets: ['puffer', 'blazer'],
  coat: ['puffer', 'blazer'],
  sweatshirt: ['hoodie'],
  sweatshirts: ['hoodie'],
  hoody: ['hoodie'],
  tshirt: ['tee'],
  tshirts: ['tee'],
  tees: ['tee'],
  corset: ['corset'],
  corsets: ['corset'],
  // colour words shoppers type -> our colourway names
  black: ['onyx'],
  white: ['bone', 'ivory'],
  cream: ['ivory', 'bone'],
  red: ['oxblood'],
  burgundy: ['oxblood'],
  maroon: ['oxblood'],
  blue: ['cobalt'],
  purple: ['plum'],
  green: ['moss'],
  grey: ['steel'],
  gray: ['steel'],
  yellow: ['saffron'],
  orange: ['saffron'],
}
const SYNONYM_FUZZY_MIN = 0.85
const hasSynonym = (t: string) => Object.prototype.hasOwnProperty.call(SYNONYMS, t)

type Field = 'name' | 'garment' | 'tags' | 'colors' | 'material' | 'dept'
const SEARCH_FIELDS: [Field, number][] = [
  ['name', 1.0],
  ['garment', 1.0],
  ['tags', 0.9],
  ['colors', 0.8],
  ['material', 0.6],
  ['dept', 0.7],
]
const FUZZY_MIN = 0.8
const MAX_RESULTS = 8
const MAX_SUGGESTIONS = 5
const DEFAULT_SUGGESTIONS = ['hoodie', 'cargo', 'puffer', 'corset', 'drops']

export function tokenizeQuery(q: string): string[] {
  const s = (q || '').toLowerCase().trim().replace(/\bt[\s-]?shirts?\b/g, 'tee')
  return s.split(/[^a-z0-9]+/).filter(Boolean).slice(0, 8)
}

function productFields(p: Product): [string[], number][] {
  return SEARCH_FIELDS.map(([field, weight]): [string[], number] => {
    let ws: string[]
    if (field === 'name') ws = words(p.name)
    else if (field === 'garment') ws = words(p.garment)
    else if (field === 'tags') ws = p.tags.flatMap((t) => words(t))
    else if (field === 'colors') ws = p.colors.flatMap((c) => words(c.name))
    else if (field === 'material') ws = words(p.material)
    else ws = words(p.dept)
    return [ws, weight]
  })
}

function matchWord(t: string, w: string): number {
  if (t === w) return 1.0
  if (t.length >= 3 && w.startsWith(t)) return 0.9
  if (t.length >= 3) {
    const r = seqRatio(t, w)
    if (r >= FUZZY_MIN) return r * 0.9
  }
  return 0.0
}

function alternatives(t: string): [string, number][] {
  const alts: [string, number][] = [[t, 1.0]]
  if (hasSynonym(t)) {
    for (const syn of SYNONYMS[t]) alts.push([syn, 1.0])
  } else if (t.length >= 4) {
    for (const key of Object.keys(SYNONYMS)) {
      if (seqRatio(t, key) >= SYNONYM_FUZZY_MIN) {
        for (const syn of SYNONYMS[key]) alts.push([syn, 0.9])
        break
      }
    }
  }
  return alts
}

function scoreProduct(tokens: string[], p: Product): number {
  if (!tokens.length) return 0
  const fields = productFields(p)
  let total = 0
  for (const t of tokens) {
    let best = 0
    for (const [alt, factor] of alternatives(t)) {
      for (const [ws, weight] of fields) {
        for (const w of ws) {
          const s = matchWord(alt, w) * weight * factor
          if (s > best) best = s
        }
      }
    }
    total += best
  }
  return roundTo(total / tokens.length, 3)
}

let vocabCache: string[] | null = null
function vocabulary(): string[] {
  if (vocabCache) return vocabCache
  const seen = new Set<string>()
  const vocab: string[] = []
  for (const p of products) {
    for (const [ws] of productFields(p)) {
      for (const w of ws) {
        if (/^[a-z]{3,}$/.test(w) && !seen.has(w)) {
          seen.add(w)
          vocab.push(w)
        }
      }
    }
  }
  vocabCache = vocab
  return vocab
}

function correctToken(t: string, vocab: string[], vocabSet: Set<string>): string {
  if (vocabSet.has(t) || hasSynonym(t) || !/^[a-z]+$/.test(t)) return t
  if (t.length >= 2) {
    for (const w of vocab) if (w.startsWith(t)) return w
  }
  let bestW = t
  let bestR = 0
  for (const w of vocab) {
    const r = seqRatio(t, w)
    if (r > bestR) {
      bestW = w
      bestR = r
    }
  }
  return bestR >= 0.75 ? bestW : t
}

/** Typo-tolerant search (max 8 results) with "did you mean" suggestions. ↔ GET /api/search */
export function searchProducts(q: string): SearchResponse {
  const tokens = tokenizeQuery(q)
  if (!tokens.length) return { results: [], suggestions: [...DEFAULT_SUGGESTIONS] }
  const scored: [number, number, Product][] = []
  products.forEach((p, idx) => {
    const s = scoreProduct(tokens, p)
    if (s > 0) scored.push([s, idx, p])
  })
  scored.sort((x, y) => y[0] - x[0] || x[1] - y[1])
  const top = scored.slice(0, MAX_RESULTS)

  const suggestions: string[] = []
  const baseVocab = vocabulary()
  const vocabSet = new Set(baseVocab)
  const vocab = [...baseVocab, ...Object.keys(SYNONYMS).filter((k) => !vocabSet.has(k))] // typo'd synonyms correct too
  const corrected = tokens.map((t) => correctToken(t, vocab, vocabSet)).join(' ')
  if (corrected !== tokens.join(' ')) suggestions.push(corrected)
  for (const [, , p] of top) {
    if (suggestions.length >= MAX_SUGGESTIONS) break
    if (!suggestions.includes(p.name)) suggestions.push(p.name)
  }
  return { results: top.map(([s, , p]) => ({ product: copyProduct(p), score: s })), suggestions }
}

/** Filter + sort the catalog. ↔ GET /api/products */
export function getProducts(opts: ProductQuery = {}): { products: Product[] } {
  const sort = opts.sort ?? 'featured'
  const dept = opts.dept ?? null
  const garment = opts.garment ?? null
  if (!SORTS.includes(sort)) throw new CommerceError(422, `Sort must be one of: ${SORTS.join(', ')}`)
  if (dept && !DEPTS.includes(dept)) throw new CommerceError(422, `Department must be one of: ${DEPTS.join(', ')}`)
  const tokens = tokenizeQuery(opts.q ?? '')
  let rows: [number, number, Product][] = []
  products.forEach((p, idx) => {
    if (dept && p.dept !== dept) return
    if (garment && p.garment !== garment.toLowerCase()) return
    let s = 0
    if (tokens.length) {
      s = scoreProduct(tokens, p)
      if (s <= 0) return
    }
    rows.push([s, idx, p])
  })

  if (sort === 'featured') {
    if (tokens.length) rows.sort((x, y) => y[0] - x[0] || x[1] - y[1])
  } else if (sort === 'price-asc') {
    rows.sort((x, y) => x[2].price - y[2].price || x[1] - y[1])
  } else if (sort === 'price-desc') {
    rows.sort((x, y) => y[2].price - x[2].price || x[1] - y[1])
  } else if (sort === 'rating') {
    rows.sort((x, y) => y[2].rating - x[2].rating || y[2].reviews - x[2].reviews || x[1] - y[1])
  } else if (sort === 'new') {
    const dropped = rows.filter((r) => r[2].drop)
    const rest = rows.filter((r) => !r[2].drop)
    dropped.sort((x, y) => (x[2].drop! < y[2].drop! ? 1 : x[2].drop! > y[2].drop! ? -1 : 0))
    rows = [...dropped, ...rest]
  }
  return { products: rows.map((r) => copyProduct(r[2])) }
}

/** ↔ GET /api/products/{id} */
export function getProduct(id: string): Product {
  const p = findProduct(id)
  if (!p) throw new CommerceError(404, `We couldn't find product ${id}`)
  return copyProduct(p)
}

/* ------------------------------------------------------------------ pricing */

export function findPromo(code: string): Promo | undefined {
  const c = code.trim().toUpperCase()
  return promos.find((p) => p.code.toUpperCase() === c)
}

/** Price a bag. Identical rules to the server; never trust client totals. ↔ POST /api/cart/quote */
export function quoteCart(
  items: CartItem[],
  promo: string | null | undefined,
  payment: Payment,
  shipping: ShippingMode,
  stock: StockLookup = catalogStock,
): Quote {
  if (!PAYMENTS.includes(payment)) throw new CommerceError(422, 'Payment must be upi, card or cod')
  if (!SHIPPING_MODES.includes(shipping)) throw new CommerceError(422, 'Shipping must be standard or express')
  const ship = shippingConfig

  const resolved: [Product, string, string, number][] = []
  const wanted = new Map<string, number>()
  const key = (pid: string, size: string) => `${pid}\u0000${size}`
  for (const it of items) {
    const { id: pid, size, color, qty } = it
    const p = findProduct(pid)
    if (!p) throw new CommerceError(404, `We couldn't find product ${pid}`)
    if (!p.sizes.includes(size)) throw new CommerceError(422, `Size ${size} isn't available for ${p.name}`)
    const col = p.colors.find((c) => c.name.toLowerCase() === String(color).trim().toLowerCase())
    if (!col) throw new CommerceError(422, `${p.name} doesn't come in ${color}`)
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new CommerceError(422, `Quantity must be between 1 and ${MAX_QTY}`)
    }
    resolved.push([p, size, col.name, qty])
    wanted.set(key(pid, size), (wanted.get(key(pid, size)) ?? 0) + qty)
  }

  const lines: QuoteLine[] = []
  let subtotal = 0
  let compareSavings = 0
  for (const [p, size, color, qty] of resolved) {
    const lineTotal = p.price * qty
    subtotal += lineTotal
    if (p.compareAt && p.compareAt > p.price) compareSavings += (p.compareAt - p.price) * qty
    lines.push({
      id: p.id,
      name: p.name,
      size,
      color,
      qty,
      unitPrice: p.price,
      lineTotal,
      inStock: stock(p.id, size) >= (wanted.get(key(p.id, size)) ?? 0),
    })
  }

  let discount = 0
  let promoApplied: string | null = null
  let promoError: string | null = null
  const code = (promo ?? '').trim()
  if (code) {
    const pr = findPromo(code)
    if (!pr) {
      promoError = "That code isn't valid"
    } else if (pr.requiresPrepaid && payment === 'cod') {
      promoError = `${pr.code} works with UPI or card payments`
    } else if (subtotal < (pr.minSubtotal ?? 0)) {
      promoError = `Add ${formatINR(pr.minSubtotal - subtotal)} more to use ${pr.code}`
    } else {
      discount = pr.type === 'percent' ? Math.floor((subtotal * pr.value) / 100) : pr.value
      discount = Math.min(discount, subtotal)
      promoApplied = pr.code
    }
  }

  const net = subtotal - discount
  let shippingFee: number
  if (!lines.length) shippingFee = 0
  else if (shipping === 'express') shippingFee = ship.expressFee
  else shippingFee = net >= ship.freeAbove ? 0 : ship.standardFee
  const codFee = payment === 'cod' && lines.length ? ship.codFee : 0
  const total = net + shippingFee + codFee

  return {
    lines,
    subtotal,
    discount,
    promoApplied,
    promoError,
    shippingFee,
    codFee,
    total,
    savings: compareSavings + discount,
    freeShippingRemaining: Math.max(0, ship.freeAbove - net),
  }
}

/* ------------------------------------------------------------------ fit */

const FIT_LIMITS: [keyof FitInput, string, number, number, string][] = [
  ['heightCm', 'Height', 120, 230, 'cm'],
  ['weightKg', 'Weight', 30, 250, 'kg'],
  ['chestCm', 'Chest', 60, 160, 'cm'],
  ['shoulderCm', 'Shoulder width', 30, 70, 'cm'],
]

/** Default cut for a garment family: the fit of its first product in the catalog. */
export function garmentFit(garment: string): string | null {
  return products.find((p) => p.garment === garment)?.fit ?? null
}

/** Size recommendation from body measurements. ↔ POST /api/fit/recommend */
export function recommendFit(input: FitInput, product?: Product | null): FitResult {
  if (!product && input.productId) {
    product = findProduct(input.productId)
    if (!product) throw new CommerceError(404, `We couldn't find product ${input.productId}`)
  }
  for (const [k, label, lo, hi, unit] of FIT_LIMITS) {
    const v = input[k] as number | null | undefined
    if (k === 'heightCm' && v == null) throw new CommerceError(422, 'Height is required')
    if (v != null && !(lo <= v && v <= hi)) throw new CommerceError(422, `${label} must be between ${lo} and ${hi} ${unit}`)
  }
  const pref: Preference = input.preference || 'true'
  if (!PREFERENCES.includes(pref)) throw new CommerceError(422, 'Preference must be true, relaxed or snug')

  const garment = input.garment
  let fitName: string | null = null
  if (product) {
    fitName = product.fit
  } else if (garment) {
    fitName = garmentFit(String(garment).toLowerCase())
    if (fitName == null) throw new CommerceError(422, `We don't make a ${garment} yet`)
  }

  const rows = sizeChart.rows
  const n = rows.length
  const h = input.heightCm
  const w = input.weightKg ?? null
  const c = input.chestCm ?? null
  const s = input.shoulderCm ?? null
  const reasons: string[] = []
  let idx: number
  let direction: number

  if (c != null) {
    idx = -1
    for (let i = 0; i < n; i++) {
      const [lo, hi] = rows[i].chest
      if ((lo <= c && c < hi) || (i === n - 1 && c === hi)) {
        idx = i
        break
      }
    }
    if (idx < 0) {
      let best = Infinity
      rows.forEach((r, i) => {
        const [lo, hi] = r.chest
        const d = c < lo ? lo - c : c - hi
        if (d < best) {
          best = d
          idx = i
        }
      })
      reasons.push(`Chest ${fmtNum(c)} cm is outside our chart, so we started from ${rows[idx].size}`)
    } else {
      const [lo, hi] = rows[idx].chest
      reasons.push(`Chest ${fmtNum(c)} cm sits in our ${rows[idx].size} range (${lo}–${hi} cm)`)
    }
    const [lo, hi] = rows[idx].chest
    direction = c < (lo + hi) / 2 ? -1 : 1
  } else {
    const cands = rows.map((r, i) => (r.height[0] <= h && h <= r.height[1] ? i : -1)).filter((i) => i >= 0)
    if (!cands.length) {
      let best = Infinity
      idx = 0
      rows.forEach((r, i) => {
        const [lo, hi] = r.height
        const d = h < lo ? lo - h : h - hi
        if (d < best) {
          best = d
          idx = i
        }
      })
      reasons.push(`Height ${fmtNum(h)} cm is outside our chart, so we started from ${rows[idx].size}`)
    } else if (cands.length === 1) {
      idx = cands[0]
      reasons.push(`Height ${fmtNum(h)} cm maps to ${rows[idx].size} on our size chart`)
    } else {
      idx = cands[0]
      let best = Infinity
      for (const i of cands) {
        const [lo, hi] = rows[i].height
        const d = Math.abs(h - (lo + hi) / 2)
        if (d < best) {
          best = d
          idx = i
        }
      }
      const names = cands.map((i) => rows[i].size).join(' and ')
      reasons.push(`Height ${fmtNum(h)} cm sits between ${names}; ${rows[idx].size} is the closer match`)
    }
    const [lo, hi] = rows[idx].height
    direction = h < (lo + hi) / 2 ? -1 : 1
  }

  let bumped = false
  const step = (i: number, d: number): [number, boolean] => {
    const j = Math.max(0, Math.min(n - 1, i + d))
    return [j, j !== i]
  }
  let changed: boolean

  if (c == null && w != null) {
    const m = h / 100
    const bmi = w / (m * m)
    if (bmi > 27) {
      ;[idx, changed] = step(idx, 1)
      bumped = bumped || changed
      if (changed) reasons.push(`Your build suggests sizing up to ${rows[idx].size}`)
    } else if (bmi < 19) {
      ;[idx, changed] = step(idx, -1)
      bumped = bumped || changed
      if (changed) reasons.push(`A leaner build suggests sizing down to ${rows[idx].size}`)
    }
  }

  if (s != null) {
    if (idx < n - 1 && s >= rows[idx + 1].shoulder) {
      ;[idx] = step(idx, 1)
      bumped = true
      reasons.push(`Shoulders ${fmtNum(s)} cm need the ${rows[idx].size} shoulder width (${rows[idx].shoulder} cm)`)
    } else {
      reasons.push(`Shoulders ${fmtNum(s)} cm sit comfortably in ${rows[idx].size}`)
    }
  }

  if (pref === 'relaxed') {
    if (fitName && ROOMY_FITS.includes(fitName)) {
      reasons.push(`The ${fitName} cut is already roomy, so we kept ${rows[idx].size} for a relaxed drape`)
    } else {
      ;[idx, changed] = step(idx, 1)
      bumped = bumped || changed
      reasons.push(
        changed
          ? `Sized up to ${rows[idx].size} for a relaxed drape`
          : `${rows[idx].size} is our largest size, so it's already the roomiest option`,
      )
    }
  } else if (pref === 'snug') {
    ;[idx, changed] = step(idx, -1)
    bumped = bumped || changed
    reasons.push(
      changed
        ? `Sized down to ${rows[idx].size} for a snug fit`
        : `${rows[idx].size} is our smallest size, so it's already the closest fit`,
    )
  } else {
    reasons.push(`${rows[idx].size} keeps a true-to-size fit`)
  }

  let confidence = c != null ? 0.92 : s != null ? 0.84 : 0.72
  if (bumped) confidence -= 0.08
  let alt = idx + direction
  if (alt < 0 || alt >= n) alt = idx - direction
  return {
    size: rows[idx].size,
    confidence: roundTo(confidence, 2),
    alternatives: alt >= 0 && alt < n ? [rows[alt].size] : [],
    reasons,
  }
}

/* ------------------------------------------------------------------ delivery */

const METROS: Record<string, string> = {
  '11': 'Delhi',
  '40': 'Mumbai',
  '56': 'Bengaluru',
  '60': 'Chennai',
  '70': 'Kolkata',
  '50': 'Hyderabad',
  '41': 'Pune',
  '38': 'Ahmedabad',
}
const REGIONS: Record<string, string> = {
  '1': 'Northern India',
  '2': 'Uttar Pradesh & Uttarakhand',
  '3': 'Rajasthan & Gujarat',
  '4': 'Maharashtra & Central India',
  '5': 'Andhra Pradesh, Telangana & Karnataka',
  '6': 'Tamil Nadu & Kerala',
  '7': 'East & Northeast India',
  '8': 'Bihar & Jharkhand',
}

/** Pincode serviceability + ETA. ↔ GET /api/delivery/{pincode} */
export function checkDelivery(pincode: string): DeliveryInfo {
  const p = (pincode ?? '').trim()
  if (!/^[0-9]{6}$/.test(p)) throw new CommerceError(422, 'Enter a valid 6-digit pincode')
  if (p[0] === '0' || p[0] === '9') {
    return { pincode: p, serviceable: false, city: null, etaDays: null, expressDays: null, cod: false }
  }
  const metro = METROS[p.slice(0, 2)]
  if (metro) return { pincode: p, serviceable: true, city: metro, etaDays: 2, expressDays: 1, cod: true }
  const eta = 3 + (parseInt(p.slice(0, 3), 10) % 4)
  return { pincode: p, serviceable: true, city: REGIONS[p[0]], etaDays: eta, expressDays: eta - 1, cod: true }
}
