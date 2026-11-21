import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import { products, byId, asset } from '../lib/catalog'
import { gsap, ScrollTrigger, useReveal, useCountdown, reducedMotion, useMediaQuery } from '../lib/motion'
import { useMoney } from '../lib/format'
import { useStore } from '../store/useStore'
import ProductCard from '../components/ProductCard'
import ScrollSequence from '../components/ScrollSequence'
import FilmSection from '../components/FilmSection'
import Icon from '../components/Icon'
import Img from '../components/Img'
import SafeBoundary from '../components/SafeBoundary'

const HeroStage = lazy(() => import('../three/HeroStage'))

const WORRIES = [
  { icon: 'ruler', q: '"Will it fit me?"', a: 'Get a size from your height in 20 seconds and inspect every seam in 3D. 94% of clients keep their first size.', cta: ['Find my size', 'fit'] },
  { icon: 'swap', q: '"What if it doesn’t?"', a: 'Exchange any size free within 7 days. We collect from your door and send the new size the same day.', cta: ['Exchange policy', 'shipping'] },
  { icon: 'truck', q: '"I need it by Friday."', a: 'Dispatched in 48 hours. Express reaches Mumbai, Delhi and Bengaluru in 1–2 days. Check your pincode on any product.', cta: null },
  { icon: 'lock', q: '"Is paying safe?"', a: 'UPI, cards, net banking or cash on delivery. Split orders over ₹3,000 into 3 interest-free EMIs.', cta: null },
  { icon: 'shield', q: '"Is it worth ₹7,990?"', a: '500GSM organic cotton, twice the weight of a typical hoodie, pre-shrunk so it keeps its shape for years. Each piece ships with a numbered authenticity card.', cta: null },
  { icon: 'leaf', q: '"Who made it?"', a: 'GOTS-certified organic cotton, finished by our audited atelier partners in Mumbai and shipped in plastic-free packaging.', cta: ['Our ateliers', 'about'] },
] as const

const REVIEWS = [
  { name: 'Ishaan R.', city: 'Bengaluru', meta: '182 cm · 78 kg · bought L', product: 'Monolith 500 Hoodie', fit: 'True to size', text: 'The weight is unreal. It hangs like a coat and still looks sharp after a dozen washes. The fit engine said L and it was spot on.' },
  { name: 'Mei T.', city: 'Tokyo', meta: '160 cm · bought S', product: 'Sculpted Corset Blazer', fit: 'True to size', text: 'The boning shapes the waist without digging in. The fit finder told me to take the S instead of my usual M, and it was right.' },
  { name: 'Aanya K.', city: 'Mumbai', meta: '168 cm · bought M', product: 'Parachute Cargo W', fit: 'Slightly long', text: 'Arrived the next morning. The bungee hems fix the length, and the ripstop handles monsoon days.' },
  { name: 'Louis D.', city: 'Paris', meta: '176 cm · bought M', product: 'Strata Puffer', fit: 'Roomy', text: 'Warm enough for January in Paris without looking like a sleeping bag. The funnel collar is perfect.' },
]

function Hero() {
  const progress = useRef(0)
  const root = useRef<HTMLElement>(null)
  const money = useMoney()
  const open = useStore((s) => s.open)
  const hoodie = byId('vl-m-hoodie-01')!
  const [ci, setCi] = useState(1)
  useLayoutEffect(() => {
    if (!root.current || reducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.from('.hero__word span', { yPercent: 110, duration: 1.4, ease: 'expo.out', stagger: 0.06, delay: 0.15 })
      gsap.from('.hero__fade', { y: 24, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08, delay: 0.6 })
      ScrollTrigger.create({ trigger: root.current, start: 'top top', end: 'bottom top', scrub: true, onUpdate: (s) => { progress.current = s.progress } })
      gsap.to('.hero__word', { yPercent: -30, letterSpacing: '0.04em', ease: 'none', scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true } })
    }, root)
    return () => ctx.revert()
  }, [])
  return (
    <section ref={root} className="hero" aria-label="Monolith 500 Hoodie">
      <h1 className="hero__word" aria-label="Véloura">{'VÉLOURA'.split('').map((c, i) => <span key={i} aria-hidden>{c}</span>)}</h1>
      <div className="hero__stage">
        <SafeBoundary fallback={<div className="hero__poster"><Img src={asset('/renders/vl-m-hoodie-01.webp')} alt="" tint="#15121a" /></div>}>
          <Suspense fallback={<div className="hero__poster" />}>
            <HeroStage type="hoodie" color={hoodie.colors[ci].hex} progress={progress} />
          </Suspense>
        </SafeBoundary>
      </div>
      <div className="hero__copy wrap">
        <div className="hero__left">
          <p className="eyebrow hero__fade">Atelier № 01 · Monolith 500 Hoodie</p>
          <p className="hero__lede hero__fade">Architecture<br /><em>you can wear.</em></p>
          <p className="hero__sub hero__fade">Heavyweight streetwear cut like tailoring in Paris, engineered in Tokyo and finished in Mumbai. Turn any piece in 3D and get your size before you buy.</p>
          <div className="row-gap hero__fade">
            <a className="btn btn--primary" href={`#p-${hoodie.id}`}>Shop the hoodie · {money(hoodie.price)}</a>
            <button className="btn btn--ghost" onClick={() => open('fit', { productId: hoodie.id })}><Icon name="ruler" size={16} /> Find my size in 20s</button>
          </div>
        </div>
        <div className="hero__right hero__fade">
          <p className="mono dim">Colourway</p>
          <div className="swatches swatches--lg" role="radiogroup" aria-label="Hoodie colourway">
            {hoodie.colors.map((c, i) => <button key={c.name} role="radio" aria-checked={ci === i} aria-label={c.name} title={c.name} className={ci === i ? 'is-on' : ''} style={{ ['--sw' as any]: c.hex }} onClick={() => setCi(i)} />)}
          </div>
          <p className="mono">{hoodie.colors[ci].name}</p>
          <p className="hero__rating"><Icon name="star" size={14} /> 4.9 · 842 reviews</p>
        </div>
      </div>
      <ul className="hero__stats wrap hero__fade" aria-label="Highlights">
        <li><b>500</b><span>GSM organic cotton</span></li>
        <li><b>48h</b><span>atelier dispatch</span></li>
        <li><b>7-day</b><span>free size exchange</span></li>
        <li><b>94%</b><span>keep their first size</span></li>
      </ul>
      <div className="hero__scroll mono" aria-hidden>Scroll <span /></div>
    </section>
  )
}

function Marquee() {
  const items = ['3D fit check before you buy', '500GSM organic cotton', 'Every piece in 3D', '48h express dispatch', '7-day free size exchange', 'Cash on delivery across India']
  return (
    <div className="marquee" aria-label="Why Véloura">
      <div className="marquee__track">{[...items, ...items].map((t, i) => <span key={i} aria-hidden={i >= items.length}><i>◈</i>{t}</span>)}</div>
    </div>
  )
}

function DropBanner() {
  const drop = byId('vl-d-hoodie-01')!
  const cd = useCountdown(drop.drop)
  return (
    <section className="dropbar wrap" data-reveal aria-label="Next drop">
      <div>
        <p className="eyebrow">Next drop · 300 pieces worldwide</p>
        <h2 className="dropbar__title">NOCTURNE 001</h2>
      </div>
      {cd && (
        <div className="countdown mono" role="timer" aria-label={`Drops in ${cd.d} days ${cd.h} hours`}>
          {[['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]].map(([l, v]) => <span key={l as string}><b>{String(v).padStart(2, '0')}</b>{l}</span>)}
        </div>
      )}
      <a className="btn btn--primary" href="#drops">Get early access</a>
    </section>
  )
}

function Departments() {
  const tiles = [
    { href: '#men', label: 'Men', sub: 'Architectural heavyweights', img: asset('/renders/cat-hoodie.webp'), n: products.filter((p) => p.dept === 'men').length },
    { href: '#women', label: 'Women', sub: 'Sculpted streetwear', img: asset('/renders/cat-corset.webp'), n: products.filter((p) => p.dept === 'women').length },
    { href: '#drops', label: 'Drops', sub: 'Numbered capsules', img: asset('/renders/cat-puffer.webp'), n: products.filter((p) => p.dept === 'drops').length },
  ]
  return (
    <section className="depts band-dark" aria-label="Departments">
      {tiles.map((t, i) => (
        <a key={t.href} href={t.href} className="dept" data-reveal style={{ ['--d' as any]: i }}>
          <span className="dept__img" data-parallax="8"><Img src={t.img} alt="" /></span>
          <span className="dept__label"><span className="mono">0{i + 1} · {t.n} pieces</span><b>{t.label}</b><span>{t.sub}</span></span>
          <span className="dept__go"><Icon name="arrow" /></span>
        </a>
      ))}
    </section>
  )
}

function Bestsellers() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const wide = useMediaQuery('(min-width: 900px)')
  const list = products.filter((p) => p.dept !== 'drops').sort((a, b) => b.reviews - a.reviews).slice(0, 8)
  useLayoutEffect(() => {
    if (!wide || !root.current || !track.current || reducedMotion()) return
    const ctx = gsap.context(() => {
      const dist = () => track.current!.scrollWidth - innerWidth + 80
      gsap.to(track.current, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: root.current, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true } })
    }, root)
    return () => ctx.revert()
  }, [wide])
  return (
    <section ref={root} className="hscroll" aria-label="Bestsellers">
      <div className="hscroll__head wrap">
        <p className="eyebrow">Most kept, least returned</p>
        <h2 className="display">The permanent <em>collection</em></h2>
      </div>
      <div ref={track} className="hscroll__track">
        {list.map((p) => <div key={p.id} className="hscroll__item"><ProductCard p={p} /></div>)}
        <a href="#men" className="hscroll__end"><span className="display">See all<br /><em>pieces</em></span><Icon name="arrow" size={28} /></a>
      </div>
    </section>
  )
}

function FitBlock() {
  const open = useStore((s) => s.open)
  return (
    <section className="fitblock wrap" aria-label="Fit confidence">
      <div className="fitblock__copy" data-reveal>
        <p className="eyebrow">The biometric fit engine</p>
        <h2 className="display">Your size, <em>before</em> it ships.</h2>
        <p className="lead">Sizing is the number one reason streetwear comes back. Ours rarely does: tell us your height, add one measurement if you have it, and the fit engine returns a size with a confidence score, adjusted for how each piece is cut.</p>
        <ul className="ticks">
          <li><Icon name="check" size={16} /> Calibrated against our own pattern blocks</li>
          <li><Icon name="check" size={16} /> Knows boxy from fitted, piece by piece</li>
          <li><Icon name="check" size={16} /> Free exchange if it's still not right</li>
        </ul>
        <div className="row-gap">
          <button className="btn btn--primary" onClick={() => open('fit')}><Icon name="ruler" size={16} /> Find my size</button>
          <button className="btn btn--ghost" onClick={() => open('tryon', { productId: 'vl-w-corset-01' })}><Icon name="camera" size={16} /> Camera try-on <span className="coming">Soon</span></button>
        </div>
      </div>
      <div className="fitblock__viz" data-reveal aria-hidden>
        <div className="scanner">
          <Img src={asset('/renders/vl-w-corset-01.webp')} alt="" tint="#5c1428" />
          <span className="scanner__line" />
          <span className="scanner__pt" style={{ left: '30%', top: '24%' }} /><span className="scanner__pt" style={{ left: '70%', top: '24%' }} />
          <span className="scanner__pt" style={{ left: '35%', top: '62%' }} /><span className="scanner__pt" style={{ left: '65%', top: '62%' }} />
          <span className="scanner__read mono">FIT ENGINE · 160 CM · RECOMMENDED S · 91% MATCH</span>
        </div>
      </div>
    </section>
  )
}

function Worries() {
  const open = useStore((s) => s.open)
  return (
    <section className="worries wrap" aria-labelledby="worries-h">
      <div className="worries__head" data-reveal>
        <p className="eyebrow">Before you ask</p>
        <h2 id="worries-h" className="display">Every reason not to buy, <em>answered.</em></h2>
      </div>
      <div className="worries__grid">
        {WORRIES.map((w) => (
          <article key={w.q} className="worry" data-reveal>
            <Icon name={w.icon} size={22} />
            <h3>{w.q}</h3>
            <p>{w.a}</p>
            {w.cta && <button className="link" onClick={() => (w.cta![1] === 'fit' ? open('fit') : open('info', { page: w.cta![1] }))}>{w.cta[0]} →</button>}
          </article>
        ))}
      </div>
    </section>
  )
}

function Reviews() {
  return (
    <section className="reviews wrap" aria-labelledby="rev-h">
      <div className="reviews__head" data-reveal>
        <p className="eyebrow">4.9 average · 12,480 verified reviews</p>
        <h2 id="rev-h" className="display">Worn in <em>three capitals</em></h2>
      </div>
      <div className="reviews__grid">
        {REVIEWS.map((r) => (
          <figure key={r.name} className="review" data-reveal>
            <div className="stars" aria-label="5 out of 5 stars">{[0, 1, 2, 3, 4].map((i) => <Icon key={i} name="star" size={13} />)}</div>
            <blockquote>"{r.text}"</blockquote>
            <figcaption><b>{r.name}</b> · {r.city}<span className="mono dim">{r.meta}</span><span className="mono">{r.product} · Fit: {r.fit}</span></figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

function Flagships() {
  const open = useStore((s) => s.open)
  return (
    <section className="flagships wrap" aria-label="Flagships">
      <div data-reveal>
        <p className="eyebrow">Paris · Tokyo · Mumbai</p>
        <h2 className="display">Book a private <em>styling session</em></h2>
        <p className="lead">45 minutes with a senior stylist, in store or on video. Fit consultation, capsule building and alterations, complimentary.</p>
        <button className="btn btn--primary" onClick={() => open('info', { page: 'styling' })}>Book a session</button>
      </div>
      <ul className="flagships__list" data-reveal>
        <li><span className="mono">01</span><b>Rue Saint-Honoré</b><span>Paris 1er · Pattern studio</span></li>
        <li><span className="mono">02</span><b>Jingumae, Shibuya-ku</b><span>Tokyo · Engineering lab</span></li>
        <li><span className="mono">03</span><b>Kala Ghoda</b><span>Mumbai · Finishing atelier</span></li>
      </ul>
    </section>
  )
}

export default function Home() {
  const ref = useReveal()
  const drops = products.filter((p) => p.dept === 'drops')
  return (
    <div ref={ref} className="page page--home">
      <Hero />
      <Marquee />
      <DropBanner />
      <ScrollSequence />
      <Departments />
      <Bestsellers />
      <FilmSection />
      <FitBlock />
      <section className="wrap section" aria-label="Capsule drops">
        <div className="section__head" data-reveal><p className="eyebrow">Numbered capsules</p><h2 className="display">Drops <em>end</em> when they sell out</h2></div>
        <div className="grid grid--4">{drops.map((p) => <div key={p.id} data-reveal><ProductCard p={p} /></div>)}</div>
      </section>
      <Worries />
      <Reviews />
      <Flagships />
    </div>
  )
}
