import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { byId, products, productImage, isUpcoming, totalStock, type Product as P } from '../lib/catalog'
import { api } from '../lib/api'
import { useMoney } from '../lib/format'
import { useCountdown, useReveal } from '../lib/motion'
import { useStore } from '../store/useStore'
import ProductCard from '../components/ProductCard'
import Icon from '../components/Icon'
import SafeBoundary from '../components/SafeBoundary'
import Img from '../components/Img'

const ProductViewer = lazy(() => import('../three/ProductViewer'))

const FIT_SPLIT: Record<string, [number, number, number]> = { Boxy: [6, 82, 12], Oversized: [4, 78, 18], Relaxed: [8, 84, 8], Regular: [10, 85, 5], Fitted: [18, 76, 6], Sculpted: [14, 80, 6], Cropped: [8, 86, 6] }

function Delivery() {
  const [pin, setPin] = useState('')
  const [r, setR] = useState<any>(null)
  const [err, setErr] = useState('')
  const check = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setR(null)
    if (!/^\d{6}$/.test(pin)) { setErr('Enter a 6-digit pincode.'); return }
    try { setR(await api.delivery(pin)) } catch (x: any) { setErr(x.message) }
  }
  const d = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <form className="delivery" onSubmit={check}>
      <label htmlFor="pd-pin" className="mono"><Icon name="pin" size={14} /> Delivery date</label>
      <div className="inline-form">
        <input id="pd-pin" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Enter pincode" />
        <button className="btn btn--ghost">Check</button>
      </div>
      {err && <p className="note note--warn">{err}</p>}
      {r && (r.serviceable
        ? <p className="note note--good">{r.city ? `${r.city}: ` : ''}express by <b>{d(r.expressDays)}</b>, standard by {d(r.etaDays)}{r.cod ? ' · Cash on delivery available' : ''}</p>
        : <p className="note note--warn">We don't deliver to {r.pincode} yet. Try a nearby pincode or book a store pickup.</p>)}
    </form>
  )
}

export default function Product({ id }: { id: string }) {
  const p = byId(id)
  const money = useMoney()
  const { add, open, toast, viewed, toggleWish, recent, user } = useStore()
  const wished = useStore((s) => s.wishlist.includes(id))
  const [ci, setCi] = useState(0)
  const [size, setSize] = useState<string | null>(null)
  const [view, setView] = useState<'front' | 'back' | 'side' | '3d'>('front')
  const [sizeErr, setSizeErr] = useState(false)
  const [alertEmail, setAlertEmail] = useState(user?.email ?? '')
  const ref = useReveal(id)
  const cd = useCountdown(p && isUpcoming(p) ? p.drop : null)

  useEffect(() => { if (p) { viewed(p.id); setCi(0); setSize(null); setView('front') } }, [id])
  const look = useMemo(() => {
    if (!p) return []
    const want: Record<string, string[]> = { hoodie: ['cargo', 'tee'], tee: ['cargo', 'blazer'], cargo: ['hoodie', 'tee'], puffer: ['hoodie', 'cargo'], blazer: ['tee', 'cargo'], corset: ['cargo', 'tee'] }
    return want[p.garment].map((g) => products.find((x) => x.garment === g && (x.dept === p.dept || p.dept === 'drops') && x.id !== p.id)).filter(Boolean) as P[]
  }, [id])

  if (!p) return <div className="page wrap empty" style={{ paddingTop: 160 }}><p className="empty__title">This piece has moved</p><a className="btn btn--primary" href="#men">Browse the collection</a></div>

  const upcoming = isUpcoming(p)
  const soldOut = totalStock(p) === 0
  const sizeStock = size ? p.stock[size] ?? 0 : null
  const split = FIT_SPLIT[p.fit] ?? [8, 84, 8]
  const emi = Math.ceil(p.price / 3)

  const addToBag = (buyNow = false) => {
    if (!size) { setSizeErr(true); toast('Choose a size first', 'warn'); return }
    add({ id: p.id, size, colorIndex: ci })
    toast(`${p.name} · ${size} added to bag`)
    open(buyNow ? 'checkout' : 'bag')
  }

  return (
    <div ref={ref} className="page page--product">
      <nav className="crumbs wrap mono" aria-label="Breadcrumb"><a href="#home">Home</a> / <a href={`#${p.dept}`}>{p.dept}</a> / <span aria-current="page">{p.name}</span></nav>
      <div className="pdp wrap">
        <div className="pdp__gallery">
          <div className="pdp__stage">
            {view === '3d' ? (
              <SafeBoundary fallback={<div className="pdp__loading mono">3D preview isn’t available on this device</div>}><Suspense fallback={<div className="pdp__loading mono">Loading 3D…</div>}><ProductViewer type={p.garment} color={p.colors[ci].hex} /></Suspense></SafeBoundary>
            ) : (
              <Img key={view + ci} className="pdp__img" src={productImage(p, ci, view)} alt={`${p.name}, ${view} view, ${p.colors[ci].name}`} tint={p.colors[ci].hex} priority />
            )}
            {view === '3d' && <p className="pdp__hint mono">Drag to rotate · scroll to zoom</p>}
          </div>
          <div className="pdp__thumbs" role="tablist" aria-label="Views">
            {(['front', 'back', 'side'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'is-on' : ''} onClick={() => setView(v)} aria-label={`${v} view`}>
                <Img src={productImage(p, v === 'front' ? ci : 0, v)} alt="" tint={p.colors[ci].hex} />
              </button>
            ))}
            <button role="tab" aria-selected={view === '3d'} className={`pdp__3d ${view === '3d' ? 'is-on' : ''}`} onClick={() => setView('3d')}><Icon name="cube" /><span className="mono">3D</span></button>
            <button className="pdp__3d" onClick={() => open('tryon', { productId: p.id, colorIndex: ci })}><Icon name="camera" /><span className="mono">Try on</span></button>
          </div>
        </div>

        <div className="pdp__info">
          <div className="pdp__sticky">
            {p.badge && <span className="tag">{p.badge}</span>}
            <h1 className="pdp__name">{p.name}</h1>
            <a href="#reviews" className="pdp__rating"><span className="stars">{[0, 1, 2, 3, 4].map((i) => <Icon key={i} name="star" size={13} />)}</span> {p.rating.toFixed(1)} · {p.reviews} reviews</a>
            <p className="pdp__price">{p.compareAt && <s>{money(p.compareAt)}</s>}<b>{money(p.price)}</b>{p.compareAt && <span className="tag tag--accent">Save {money(p.compareAt - p.price)}</span>}</p>
            <p className="fineprint">Inclusive of all taxes · or 3 interest-free payments of {money(emi)}</p>
            <p className="pdp__desc">{p.description}</p>

            <div className="pdp__opt">
              <p className="pdp__label"><span>Colour</span><b>{p.colors[ci].name}</b></p>
              <div className="swatches swatches--lg" role="radiogroup" aria-label="Colour">
                {p.colors.map((c, i) => <button key={c.name} role="radio" aria-checked={ci === i} aria-label={c.name} title={c.name} className={ci === i ? 'is-on' : ''} style={{ ['--sw' as any]: c.hex }} onClick={() => setCi(i)} />)}
              </div>
            </div>

            <div className="pdp__opt">
              <p className="pdp__label"><span>Size</span><button className="link" onClick={() => open('fit', { productId: p.id, onPick: (s: string) => { setSize(s); setSizeErr(false) } })}><Icon name="ruler" size={14} /> Find my size</button></p>
              <div className={`sizes ${sizeErr ? 'is-err' : ''}`} role="radiogroup" aria-label="Size">
                {p.sizes.map((s) => (
                  <button key={s} role="radio" aria-checked={size === s} className={`${size === s ? 'is-on' : ''} ${!p.stock[s] ? 'is-out' : ''}`} onClick={() => { setSize(s); setSizeErr(false) }} aria-label={`${s}${!p.stock[s] ? ', sold out' : p.stock[s] <= 3 ? `, only ${p.stock[s]} left` : ''}`}>
                    {s}{p.stock[s] > 0 && p.stock[s] <= 3 && <i aria-hidden />}
                  </button>
                ))}
              </div>
              <p className="fineprint">Fit: <b>{p.fit}</b>. {p.fit === 'Boxy' || p.fit === 'Oversized' ? 'Cut roomy by design. Take your usual size, or one down for a closer fit.' : 'Take your usual size.'} {sizeErr && <span className="field__err">Choose a size to continue.</span>}</p>
              {size && sizeStock !== null && sizeStock > 0 && sizeStock <= 3 && <p className="note note--warn">Only {sizeStock} left in {size}</p>}
            </div>

            {upcoming ? (
              <div className="pdp__drop">
                {cd && <p className="countdown mono">{[['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]].map(([l, v]) => <span key={l as string}><b>{String(v).padStart(2, '0')}</b>{l}</span>)}</p>}
                <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); try { await api.stockAlert(p.id, size ?? 'M', alertEmail); toast('We’ll email you the moment it drops') } catch (x: any) { toast(x.message, 'warn') } }}>
                  <label htmlFor="pd-alert" className="sr-only">Email</label>
                  <input id="pd-alert" type="email" required value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="Email me when it drops" />
                  <button className="btn btn--primary">Notify me</button>
                </form>
              </div>
            ) : soldOut || (size && !sizeStock) ? (
              <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); try { await api.stockAlert(p.id, size ?? 'M', alertEmail); toast(`We'll email you when ${size ?? 'it'} is back`) } catch (x: any) { toast(x.message, 'warn') } }}>
                <label htmlFor="pd-alert2" className="sr-only">Email</label>
                <input id="pd-alert2" type="email" required value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder={`Email me when ${size ?? 'it'}'s back`} />
                <button className="btn btn--primary">Notify me</button>
              </form>
            ) : (
              <div className="pdp__cta">
                <button className="btn btn--primary btn--block" onClick={() => addToBag()}>Add to bag · {money(p.price)}</button>
                <button className="btn btn--ghost btn--block" onClick={() => addToBag(true)}>Buy now with UPI</button>
                <button className={`icon-btn pdp__wish ${wished ? 'is-on' : ''}`} onClick={() => toggleWish(p.id)} aria-pressed={wished} aria-label={wished ? 'Remove from wishlist' : 'Save to wishlist'}><Icon name="heart" /></button>
              </div>
            )}

            <Delivery />
            <ul className="trust mono">
              <li><Icon name="swap" size={14} /> Free size exchange for 7 days</li>
              <li><Icon name="truck" size={14} /> Dispatched within 48 hours</li>
              <li><Icon name="shield" size={14} /> Numbered authenticity card</li>
              <li><Icon name="lock" size={14} /> UPI · Cards · COD</li>
            </ul>

            <div className="accordion">
              <details open><summary>Details</summary><ul className="dashlist"><li>{p.material}</li>{p.gsm && <li>{p.gsm}GSM fabric weight</li>}<li>{p.fit} fit</li><li>Designed in Paris, engineered in Tokyo, finished in Mumbai</li></ul></details>
              <details><summary>Care</summary><p>Cold wash inside out with similar colours. Dry flat in the shade. Don't tumble dry or iron prints. Pre-shrunk: expect less than 2% change.</p></details>
              <details><summary>Shipping & exchanges</summary><p>Free standard shipping over ₹4,999. Express 1–2 days in metros. Free size exchange within 7 days. We collect from your door.</p></details>
            </div>
          </div>
        </div>
      </div>

      <section id="reviews" className="wrap section pdp__reviews" aria-label="Reviews">
        <div className="section__head" data-reveal><p className="eyebrow">{p.reviews} verified reviews</p><h2 className="display">{p.rating.toFixed(1)} <em>out of 5</em></h2></div>
        <div className="fitbar" data-reveal>
          <p className="mono">How it fits</p>
          <div className="fitbar__track" role="img" aria-label={`${split[0]}% say runs small, ${split[1]}% true to size, ${split[2]}% runs large`}>
            <span style={{ flex: split[0] }}>Runs small {split[0]}%</span><span style={{ flex: split[1] }} className="is-main">True to size {split[1]}%</span><span style={{ flex: split[2] }}>Large {split[2]}%</span>
          </div>
        </div>
      </section>

      {look.length > 0 && (
        <section className="wrap section" aria-label="Complete the look">
          <div className="section__head" data-reveal><p className="eyebrow">Styled by the atelier</p><h2 className="display">Complete <em>the look</em></h2></div>
          <div className="grid grid--3">{look.map((x) => <div key={x.id} data-reveal><ProductCard p={x} /></div>)}</div>
        </section>
      )}
      {recent.filter((r) => r !== id).length > 0 && (
        <section className="wrap section" aria-label="Recently viewed">
          <div className="section__head"><p className="eyebrow">Recently viewed</p></div>
          <div className="grid grid--4">{recent.filter((r) => r !== id).slice(0, 4).map((r) => { const x = byId(r); return x ? <ProductCard key={r} p={x} /> : null })}</div>
        </section>
      )}

      {!upcoming && !soldOut && (
        <div className="stickybar">
          <span><b>{p.name}</b><span className="mono dim">{size ? `Size ${size}` : 'Choose a size'} · {money(p.price)}</span></span>
          <button className="btn btn--primary" onClick={() => addToBag()}>Add to bag</button>
        </div>
      )}
    </div>
  )
}
