/**
 * API client. Talks to the Python FastAPI service when it is reachable (same origin `api/`
 * or VITE_API_BASE), and falls back to the identical TypeScript commerce engine in the
 * browser so the storefront stays fully functional on static hosting.
 */
import * as C from './commerce'
import { byId } from './catalog'

const BASE: string = (import.meta as any).env?.VITE_API_BASE ?? 'api'
let online: Promise<boolean> | null = null

function ping(): Promise<boolean> {
  if (!online) {
    online = (async () => {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1200)
        const r = await fetch(`${BASE}/health`, { signal: ctl.signal }); clearTimeout(t)
        if (!r.ok) return false
        const j = await r.json().catch(() => null)
        return j?.status === 'ok'
      } catch { return false }
    })()
  }
  return online
}
export const isOnline = ping

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  const r = await fetch(`${BASE}${path}`, { ...init, headers })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof j.detail === 'string' ? j.detail : j.detail?.[0]?.msg ?? 'Something went wrong. Please try again.')
  return j as T
}
const post = (body: unknown, token?: string): RequestInit & { token?: string } => ({ method: 'POST', body: JSON.stringify(body), token })

/* ---------- local fallbacks for stateful endpoints ---------- */
const LS = {
  get<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) || '') ?? d } catch { return d } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } },
}
async function hash(s: string) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
  } catch { return btoa(unescape(encodeURIComponent(s))) }
}

export type Payment = 'upi' | 'card' | 'cod'
export type ShipMode = 'standard' | 'express'
export interface QuoteItem { id: string; size: string; color: string; qty: number }
export type Quote = ReturnType<typeof C.quoteCart>
export interface Address { name: string; phone: string; line1: string; city: string; pincode: string }
export interface AuthUser { name: string; email: string; heightCm?: number | null; drape?: string | null }

export const api = {
  async quote(items: QuoteItem[], promo: string | null, payment: Payment, shipping: ShipMode): Promise<Quote> {
    if (await ping()) { try { return await call('/cart/quote', post({ items, promo, payment, shipping })) } catch { /* fall through */ } }
    return C.quoteCart(items as any, promo ?? undefined, payment, shipping)
  },
  async search(q: string) {
    if (await ping()) { try { return await call<ReturnType<typeof C.searchProducts>>(`/search?q=${encodeURIComponent(q)}`) } catch { /* */ } }
    return C.searchProducts(q)
  },
  async delivery(pincode: string) {
    if (await ping()) return call<ReturnType<typeof C.checkDelivery>>(`/delivery/${encodeURIComponent(pincode)}`)
    return C.checkDelivery(pincode)
  },
  async fit(input: Parameters<typeof C.recommendFit>[0], productId?: string) {
    if (await ping()) { try { return await call<ReturnType<typeof C.recommendFit>>('/fit/recommend', post({ ...input, productId })) } catch { /* */ } }
    return C.recommendFit(input, productId ? (byId(productId) as any) : undefined)
  },
  async register(b: { name: string; email: string; password: string; heightCm?: number; drape?: string }): Promise<{ token: string; user: AuthUser }> {
    if (await ping()) return call('/auth/register', post(b))
    const users = LS.get<Record<string, any>>('va-users', {})
    const email = b.email.trim().toLowerCase()
    if (users[email]) throw new Error('An account with this email already exists. Sign in instead.')
    if (b.password.length < 8) throw new Error('Use at least 8 characters for your password.')
    users[email] = { name: b.name, email, heightCm: b.heightCm, drape: b.drape, pw: await hash(b.password) }
    LS.set('va-users', users)
    const { pw, ...user } = users[email]
    return { token: 'local.' + (await hash(email)).slice(0, 24), user }
  },
  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    if (await ping()) return call('/auth/login', post({ email, password }))
    const u = LS.get<Record<string, any>>('va-users', {})[email.trim().toLowerCase()]
    if (!u || u.pw !== (await hash(password))) throw new Error('That email and password don’t match. Check them or create an account.')
    const { pw, ...user } = u
    return { token: 'local.' + (await hash(u.email)).slice(0, 24), user }
  },
  async placeOrder(b: { items: QuoteItem[]; promo: string | null; payment: Payment; shipping: ShipMode; email: string; address: Address }, token?: string):
    Promise<{ orderId: string; total: number; etaDate: string; status: string }> {
    if (await ping()) return call('/orders', post(b, token?.startsWith('local.') ? undefined : token))
    const quote = C.quoteCart(b.items as any, b.promo ?? undefined, b.payment, b.shipping)
    const del = C.checkDelivery(b.address.pincode) as any
    const days = b.shipping === 'express' ? del.expressDays ?? 2 : del.etaDays ?? 5
    const orderId = 'VA-' + Math.random().toString(36).slice(2, 8).toUpperCase()
    const order = { orderId, total: quote.total, status: 'confirmed', etaDate: new Date(Date.now() + days * 864e5).toISOString().slice(0, 10), createdAt: Date.now(), items: quote.lines }
    LS.set('va-orders', { ...LS.get('va-orders', {}), [orderId]: order })
    return order
  },
  async track(orderId: string): Promise<{ orderId: string; status: string; total: number; items: any[]; timeline: { label: string; at: string; done: boolean }[] }> {
    if (await ping()) return call(`/orders/${encodeURIComponent(orderId.trim().toUpperCase())}`)
    const o = LS.get<Record<string, any>>('va-orders', {})[orderId.trim().toUpperCase()]
    if (!o) throw new Error('We couldn’t find that order number. It looks like VA-7K2P9Q and is in your confirmation email.')
    const steps = ['Confirmed', 'Crafted & QC', 'Dispatched', 'Out for delivery', 'Delivered']
    const timeline = steps.map((label, i) => { const at = o.createdAt + i * 120000; return { label, at: new Date(at).toISOString(), done: Date.now() >= at } })
    return { ...o, status: [...timeline].reverse().find((t) => t.done)!.label, timeline }
  },
  async newsletter(email: string) {
    if (await ping()) return call<{ ok: boolean; code: string }>('/newsletter', post({ email }))
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address, like name@example.com.')
    return { ok: true, code: 'FIRSTFIT' }
  },
  async styling(b: { name: string; email: string; city: string; slot: string }) {
    if (await ping()) return call<{ ok: boolean; bookingId: string }>('/styling', post(b))
    return { ok: true, bookingId: 'ST-' + Math.random().toString(36).slice(2, 7).toUpperCase() }
  },
  async stockAlert(productId: string, size: string, email: string) {
    if (await ping()) return call<{ ok: boolean }>('/stock-alert', post({ productId, size, email }))
    return { ok: true }
  },
}
