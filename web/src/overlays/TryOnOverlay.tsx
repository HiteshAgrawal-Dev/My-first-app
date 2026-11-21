import { lazy, Suspense, useEffect, useState } from 'react'
import { byId, products } from '../lib/catalog'
import { lockScroll } from '../lib/motion'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import Shell from './Shell'

/** Camera try-on is finished in code but held back until it fits perfectly; ?tryon=beta opens the studio. */
const TryOnStudio = lazy(() => import('../tryon').then((m) => ({ default: m.TryOnStudio })))
const BETA = typeof location !== 'undefined' && new URLSearchParams(location.search).get('tryon') === 'beta'

function ComingSoon() {
  const { close, open, user, toast, overlayData } = useStore()
  const p = byId(overlayData?.productId ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [done, setDone] = useState(false)
  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await api.newsletter(email); setDone(true); toast('You’re on the try-on waitlist') } catch (x: any) { toast(x.message, 'warn') }
  }
  return (
    <Shell kind="modal" eyebrow="In the atelier" title="Camera try-on is coming soon" onClose={close}>
      <div className="soon">
        <p className="dim">We're teaching the try-on to drape 500GSM cotton the way it really falls. It launches when it's indistinguishable from the mirror, not before.</p>
        <ol className="soon__list">
          <li><span className="mono">01</span>See any piece on yourself through your phone or laptop camera</li>
          <li><span className="mono">02</span>Shoulder width measured live, with a size recommendation</li>
          <li><span className="mono">03</span>Processed on your device. Nothing uploaded or stored</li>
        </ol>
        {done ? <p className="note note--good">You're on the list. We'll email you first, with early access to the next drop.</p> : (
          <form className="inline-form" onSubmit={join}>
            <label htmlFor="soon-email" className="sr-only">Email</label>
            <input id="soon-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email me when it launches" />
            <button className="btn btn--primary">Join waitlist</button>
          </form>
        )}
        <p className="eyebrow">Until then</p>
        <div className="row-gap">
          <button className="btn btn--ghost" onClick={() => open('fit', p ? { productId: p.id } : null)}>Find my size in 20s</button>
          <a className="btn btn--ghost" href="#lab" onClick={close}>Inspect it in 3D</a>
        </div>
      </div>
    </Shell>
  )
}

function Studio() {
  const { close, overlayData, add, toast, user, open } = useStore()
  const p = byId(overlayData?.productId ?? 'vl-m-hoodie-01') ?? products[0]
  useEffect(() => { lockScroll(true); return () => lockScroll(false) }, [])
  const list = products.filter((x) => x.dept !== 'drops').map((x) => ({ ...x, image: `renders/${x.id}.png` }))
  return (
    <Suspense fallback={null}><TryOnStudio
      product={{ ...p, image: `renders/${p.id}.png` }}
      products={list}
      colorIndex={overlayData?.colorIndex ?? 0}
      heightCm={user?.heightCm}
      onAddToBag={({ productId, size, colorIndex }) => { add({ id: productId, size, colorIndex }); toast(`${byId(productId)?.name} · ${size} added to bag`); open('bag') }}
      onClose={close}
    /></Suspense>
  )
}

export default function TryOnOverlay() {
  return BETA ? <Studio /> : <ComingSoon />
}
