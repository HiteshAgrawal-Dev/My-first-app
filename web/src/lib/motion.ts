import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)
export { gsap, ScrollTrigger }

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

let lenis: Lenis | null = null
export const getLenis = () => lenis

/** Inertial smooth scrolling wired into GSAP's ticker so ScrollTrigger stays frame-perfect. */
export function useSmoothScroll() {
  useEffect(() => {
    if (reducedMotion()) return
    lenis = new Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: 0.9 })
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (t: number) => lenis?.raf(t * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    return () => { gsap.ticker.remove(raf); lenis?.destroy(); lenis = null }
  }, [])
}

export function scrollToTop(immediate = true) {
  if (lenis) lenis.scrollTo(0, { immediate }); else window.scrollTo({ top: 0 })
}
export function lockScroll(locked: boolean) {
  if (locked) { lenis?.stop(); document.documentElement.classList.add('is-locked') }
  else { lenis?.start(); document.documentElement.classList.remove('is-locked') }
}

/** Reveal children marked [data-reveal] as they enter; content is visible at rest without JS. */
export function useReveal(dep: unknown = null) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!ref.current || reducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.fromTo(el, { y: 40, autoAlpha: 0.001 }, {
          y: 0, autoAlpha: 1, duration: 1.1, ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        })
      })
      gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
        const amt = parseFloat(el.dataset.parallax || '12')
        gsap.fromTo(el, { yPercent: -amt }, { yPercent: amt, ease: 'none', scrollTrigger: { trigger: el, scrub: true, start: 'top bottom', end: 'bottom top' } })
      })
    }, ref)
    const t = setTimeout(() => ScrollTrigger.refresh(), 400)
    return () => { clearTimeout(t); ctx.revert() }
  }, [dep])
  return ref
}

export function useCountdown(iso: string | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  if (!iso) return null
  const ms = Math.max(0, new Date(iso).getTime() - now)
  return { ms, d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 }
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => { const mq = matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on) }, [q])
  return m
}
