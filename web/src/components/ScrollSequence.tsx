import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger, reducedMotion } from '../lib/motion'
import { asset } from '../lib/catalog'

const FRAMES = 90
const src = (i: number) => asset(`/film/seq/frame-${String(i).padStart(3, '0')}.webp`)
const CALLOUTS = [
  { at: 0.12, side: 'l', k: '500 GSM', t: 'Organic loopback cotton, twice the weight of a typical hoodie. It drapes rather than clings.' },
  { at: 0.34, side: 'r', k: 'Double-layer hood', t: 'Two layers of fabric with a hidden seam, so it stands up instead of collapsing flat.' },
  { at: 0.56, side: 'l', k: '3-panel body', t: 'Cut like a tailored jacket. Shoulders drop 9 cm for the boxy line without swamping you.' },
  { at: 0.78, side: 'r', k: 'Pre-shrunk', t: 'Garment-washed twice before it reaches you. It shrinks less than 2% over its lifetime.' },
]

/** Apple-style pinned section: scroll scrubs a 90-frame exploded render of the hoodie. */
export default function ScrollSequence() {
  const root = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const imgs = useRef<HTMLImageElement[]>([])
  const [p, setP] = useState(0)
  const [ok, setOk] = useState(true)

  useEffect(() => {
    let alive = true
    const first = new Image()
    first.onerror = () => alive && setOk(false)
    imgs.current = Array.from({ length: FRAMES }, (_, i) => { const im = i === 0 ? first : new Image(); im.decoding = 'async'; im.src = src(i); return im })
    first.onload = () => draw(0)
    return () => { alive = false }
  }, [])

  const draw = (prog: number) => {
    const c = canvas.current; if (!c) return
    const i = Math.min(FRAMES - 1, Math.round(prog * (FRAMES - 1)))
    let im = imgs.current[i]
    if (!im?.complete || !im.naturalWidth) { for (let k = i; k >= 0; k--) if (imgs.current[k]?.complete && imgs.current[k].naturalWidth) { im = imgs.current[k]; break } }
    if (!im?.naturalWidth) return
    const ctx = c.getContext('2d')!
    const dpr = Math.min(devicePixelRatio, 2)
    const w = c.clientWidth * dpr, h = c.clientHeight * dpr
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight) * 0.92
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh)
  }

  useLayoutEffect(() => {
    if (!root.current) return
    if (reducedMotion()) { draw(0.5); return }
    const st = ScrollTrigger.create({
      trigger: root.current, start: 'top top', end: '+=260%', pin: '.seq__stage', scrub: 0.6,
      onUpdate: (s) => { setP(s.progress); draw(s.progress) },
    })
    const onR = () => draw(st.progress)
    addEventListener('resize', onR)
    return () => { st.kill(); removeEventListener('resize', onR) }
  }, [])

  return (
    <section ref={root} className="seq band-dark" aria-label="How the Monolith 500 hoodie is engineered">
      <div className="seq__stage">
        <div className="seq__head wrap">
          <p className="eyebrow">Engineered in panels</p>
          <h2 className="display">Built like a jacket.<br /><em>Worn like a hoodie.</em></h2>
        </div>
        {ok ? <canvas ref={canvas} className="seq__canvas" aria-hidden /> : <div className="seq__fallback" aria-hidden />}
        <ol className="seq__callouts wrap">
          {CALLOUTS.map((c, i) => {
            const on = p >= c.at - 0.1 && p < c.at + 0.18
            return (
              <li key={c.k} className={`callout callout--${c.side} ${on ? 'is-on' : ''}`} style={{ ['--i' as any]: i }}>
                <span className="mono">0{i + 1}</span><b>{c.k}</b><p>{c.t}</p>
              </li>
            )
          })}
        </ol>
        <div className="seq__progress" aria-hidden><span style={{ transform: `scaleX(${p})` }} /></div>
      </div>
    </section>
  )
}
