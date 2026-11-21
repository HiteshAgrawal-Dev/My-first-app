import { useEffect, useRef, useState } from 'react'
import { asset } from '../lib/catalog'
import { useMediaQuery } from '../lib/motion'
import Icon from './Icon'

/** Campaign film: autoplays muted when on screen, pauses off screen, with a vertical cut for phones. */
export default function FilmSection() {
  const v = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const portrait = useMediaQuery('(max-aspect-ratio: 3/4)')
  useEffect(() => {
    const el = v.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().then(() => setPlaying(true)).catch(() => {}); else { el.pause(); setPlaying(false) } }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [portrait])
  const toggle = () => { const el = v.current!; if (el.paused) { el.play(); setPlaying(true) } else { el.pause(); setPlaying(false) } }
  return (
    <section className="film" aria-label="Nocturne 001 campaign film">
      <div className="film__frame" data-reveal>
        {!failed ? (
          <video key={portrait ? 'v' : 'h'} ref={v} className="film__video" muted loop playsInline preload="metadata" poster={asset('/film/campaign-poster.webp')} onError={() => setFailed(true)}>
            {portrait ? <source src={asset('/film/campaign-vertical.mp4')} type="video/mp4" /> : <><source src={asset('/film/campaign.webm')} type="video/webm" /><source src={asset('/film/campaign.mp4')} type="video/mp4" /></>}
          </video>
        ) : <div className="film__video film__video--fallback" />}
        <div className="film__overlay">
          <p className="eyebrow">Campaign film · 0:12</p>
          <h2 className="display">NOCTURNE <em>001</em></h2>
          <p className="film__sub">Crushed velour, after dark. 300 numbered pieces.</p>
          <div className="row-gap">
            <a className="btn btn--primary" href="#drops">Enter the drop</a>
            <button className="btn btn--ghost" onClick={toggle} aria-label={playing ? 'Pause film' : 'Play film'}><Icon name={playing ? 'pause' : 'play'} size={16} />{playing ? 'Pause' : 'Play'}</button>
          </div>
        </div>
      </div>
    </section>
  )
}
