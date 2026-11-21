/**
 * Device tiering. Low-end phones (≤4 GB RAM, few cores, Data Saver, 2G/3G, reduced motion, no WebGL)
 * get "lite" mode: static renders instead of live WebGL, native scrolling, fewer frames, no autoplay video.
 * Override with ?lite=1 or ?lite=0.
 */
function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}
function detect(): boolean {
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(location.search).get('lite')
  if (q === '1') return true
  if (q === '0') return false
  const n = navigator as any
  const mem: number = n.deviceMemory ?? 8
  const cores: number = n.hardwareConcurrency ?? 8
  const conn = n.connection
  const slowNet = !!conn && (conn.saveData || /(^|-)2g|3g/.test(conn.effectiveType ?? ''))
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  return mem <= 4 || cores <= 4 || slowNet || reduce || !hasWebGL()
}
export const LITE = detect()
if (typeof document !== 'undefined' && LITE) document.documentElement.classList.add('lite')

/** Run after the page has painted and the main thread is quiet. */
export function whenIdle(fn: () => void, timeout = 1500) {
  const w = window as any
  let id: any
  const go = () => { id = w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout }) : setTimeout(fn, 300) }
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true })
  return () => { if (w.cancelIdleCallback && id) w.cancelIdleCallback(id); else clearTimeout(id) }
}
