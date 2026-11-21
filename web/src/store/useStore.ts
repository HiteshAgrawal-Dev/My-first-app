import { create } from 'zustand'

export type Currency = 'INR' | 'EUR' | 'JPY' | 'USD'
export interface BagItem { key: string; id: string; size: string; colorIndex: number; qty: number }
export interface User { name: string; email: string; heightCm?: number; drape?: string; token?: string }
export type Overlay = null | 'bag' | 'search' | 'auth' | 'checkout' | 'fit' | 'tryon' | 'concierge' | 'info' | 'wishlist'

const KEY = 'veloura-v1'
const load = (): Partial<State> => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}

interface State {
  bag: BagItem[]; wishlist: string[]; recent: string[]; user: User | null; currency: Currency; promo: string | null
  overlay: Overlay; overlayData: any; toasts: { id: number; text: string; tone?: 'ok' | 'warn' }[]
  add: (i: Omit<BagItem, 'key' | 'qty'>, qty?: number) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  clearBag: () => void
  toggleWish: (id: string) => void
  viewed: (id: string) => void
  setUser: (u: User | null) => void
  setCurrency: (c: Currency) => void
  setPromo: (c: string | null) => void
  open: (o: Overlay, data?: any) => void
  close: () => void
  toast: (text: string, tone?: 'ok' | 'warn') => void
}

const saved = load()
export const useStore = create<State>((set, get) => ({
  bag: saved.bag ?? [], wishlist: saved.wishlist ?? [], recent: saved.recent ?? [], user: saved.user ?? null,
  currency: saved.currency ?? 'INR', promo: saved.promo ?? null,
  overlay: null, overlayData: null, toasts: [],
  add: (i, qty = 1) => set((s) => {
    const key = `${i.id}|${i.size}|${i.colorIndex}`
    const ex = s.bag.find((b) => b.key === key)
    const bag = ex ? s.bag.map((b) => (b.key === key ? { ...b, qty: Math.min(10, b.qty + qty) } : b)) : [...s.bag, { ...i, key, qty }]
    return { bag }
  }),
  setQty: (key, qty) => set((s) => ({ bag: s.bag.map((b) => (b.key === key ? { ...b, qty: Math.max(1, Math.min(10, qty)) } : b)) })),
  remove: (key) => set((s) => ({ bag: s.bag.filter((b) => b.key !== key) })),
  clearBag: () => set({ bag: [], promo: null }),
  toggleWish: (id) => {
    const has = get().wishlist.includes(id)
    set((s) => ({ wishlist: has ? s.wishlist.filter((w) => w !== id) : [...s.wishlist, id] }))
    get().toast(has ? 'Removed from wishlist' : 'Saved to wishlist')
  },
  viewed: (id) => set((s) => ({ recent: [id, ...s.recent.filter((r) => r !== id)].slice(0, 8) })),
  setUser: (user) => set({ user }),
  setCurrency: (currency) => set({ currency }),
  setPromo: (promo) => set({ promo }),
  open: (overlay, overlayData = null) => set({ overlay, overlayData }),
  close: () => set({ overlay: null, overlayData: null }),
  toast: (text, tone = 'ok') => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200)
  },
}))

useStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ bag: s.bag, wishlist: s.wishlist, recent: s.recent, user: s.user, currency: s.currency, promo: s.promo }))
  } catch { /* storage unavailable: keep in memory */ }
})

export const bagCount = (s: State) => s.bag.reduce((a, b) => a + b.qty, 0)
