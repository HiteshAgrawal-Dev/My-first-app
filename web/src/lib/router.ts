import { useEffect, useState } from 'react'

/** Plain-hash routing (#men, #p-vl-m-hoodie-01) so it works on any static host. */
export type Route = { name: 'home' | 'men' | 'women' | 'drops' | 'lab' | 'product' | 'track' | 'wishlist'; param?: string }

export function parse(hash: string): Route {
  const h = hash.replace(/^#/, '')
  if (h.startsWith('p-')) return { name: 'product', param: h.slice(2) }
  if (h.startsWith('track')) return { name: 'track', param: h.slice(6) || undefined }
  if (['men', 'women', 'drops', 'lab', 'wishlist'].includes(h)) return { name: h as Route['name'] }
  return { name: 'home' }
}
export const go = (hash: string) => { if (location.hash !== '#' + hash) location.hash = hash; else window.dispatchEvent(new HashChangeEvent('hashchange')) }

export function useRoute() {
  const [r, setR] = useState(() => parse(location.hash))
  useEffect(() => {
    const on = () => setR(parse(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}
