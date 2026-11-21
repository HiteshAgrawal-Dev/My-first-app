import { useEffect, useState } from 'react'
import { byId, productImage, catalog, products } from '../lib/catalog'
import { api, type Quote } from '../lib/api'
import { useMoney } from '../lib/format'
import { useStore } from '../store/useStore'
import Shell from './Shell'
import Icon from '../components/Icon'
import Img from '../components/Img'

export function useQuote(payment: 'upi' | 'card' | 'cod' = 'upi', shipping: 'standard' | 'express' = 'standard') {
  const bag = useStore((s) => s.bag)
  const promo = useStore((s) => s.promo)
  const [q, setQ] = useState<Quote | null>(null)
  useEffect(() => {
    let live = true
    const items = bag.map((b) => ({ id: b.id, size: b.size, color: byId(b.id)?.colors[b.colorIndex]?.name ?? '', qty: b.qty }))
    api.quote(items, promo, payment, shipping).then((r) => live && setQ(r)).catch(() => {})
    return () => { live = false }
  }, [bag, promo, payment, shipping])
  return q
}

export default function BagDrawer() {
  const bag = useStore((s) => s.bag)
  const { close, open, setQty, remove, setPromo, promo, toggleWish, toast, add } = useStore()
  const money = useMoney()
  const q = useQuote()
  const [code, setCode] = useState(promo ?? '')
  const free = catalog.shipping.freeAbove
  const progress = q ? Math.min(1, (q.subtotal - q.discount) / free) : 0
  const inBag = new Set(bag.map((b) => b.id))
  const upsell = products.filter((p) => !inBag.has(p.id) && p.dept !== 'drops' && (p.garment === 'tee' || p.garment === 'cargo')).slice(0, 3)

  const apply = (c: string) => { setPromo(c.trim().toUpperCase() || null); setCode(c.trim().toUpperCase()) }

  return (
    <Shell kind="drawer" eyebrow={`${bag.reduce((a, b) => a + b.qty, 0)} architectural pieces`} title="Your bag" onClose={close}
      footer={bag.length > 0 && q && (
        <div className="bag__foot">
          <dl className="sumlist">
            <div><dt>Subtotal</dt><dd>{money(q.subtotal)}</dd></div>
            {q.discount > 0 && <div className="is-good"><dt>{q.promoApplied}</dt><dd>−{money(q.discount)}</dd></div>}
            <div><dt>Shipping</dt><dd>{q.shippingFee === 0 ? 'Free' : money(q.shippingFee)}</dd></div>
            <div className="sumlist__total"><dt>Total</dt><dd>{money(q.total)}</dd></div>
          </dl>
          {q.savings > 0 && <p className="note note--good">You're saving {money(q.savings)} on this bag</p>}
          <button className="btn btn--primary btn--block" onClick={() => open('checkout')}>Secure checkout <Icon name="arrow" size={16} /></button>
          <p className="fineprint"><Icon name="lock" size={12} /> UPI · Cards · Net banking · Cash on delivery · 3 interest-free EMIs</p>
        </div>
      )}>
      {bag.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Your bag is empty</p>
          <p className="dim">Start with the piece everyone asks about.</p>
          <a className="btn btn--primary" href="#p-vl-m-hoodie-01" onClick={close}>Shop the Monolith 500 Hoodie</a>
          <a className="btn btn--ghost" href="#men" onClick={close}>Browse Men</a>
          <a className="btn btn--ghost" href="#women" onClick={close}>Browse Women</a>
        </div>
      ) : (
        <>
          <div className="freeship" aria-live="polite">
            <p>{q && q.freeShippingRemaining > 0 ? <>Add <b>{money(q.freeShippingRemaining)}</b> for free express shipping</> : <><Icon name="truck" size={14} /> Free shipping unlocked</>}</p>
            <div className="freeship__bar"><span style={{ transform: `scaleX(${progress})` }} /></div>
          </div>
          <ul className="bag__list">
            {bag.map((b) => {
              const p = byId(b.id); if (!p) return null
              const line = q?.lines.find((l: any) => l.id === b.id && l.size === b.size)
              return (
                <li key={b.key} className="bagline">
                  <a href={`#p-${p.id}`} onClick={close} className="bagline__img"><Img src={productImage(p, b.colorIndex)} alt={p.name} tint={p.colors[b.colorIndex].hex} /></a>
                  <div className="bagline__info">
                    <a href={`#p-${p.id}`} onClick={close} className="bagline__name">{p.name}</a>
                    <p className="mono dim">{p.colors[b.colorIndex].name} · {b.size}</p>
                    {line && line.inStock === false && <p className="note note--warn">Only limited stock left in {b.size}</p>}
                    <div className="bagline__row">
                      <div className="qty" role="group" aria-label={`Quantity for ${p.name}`}>
                        <button onClick={() => (b.qty === 1 ? remove(b.key) : setQty(b.key, b.qty - 1))} aria-label="Decrease quantity"><Icon name="minus" size={14} /></button>
                        <span aria-live="polite">{b.qty}</span>
                        <button onClick={() => setQty(b.key, b.qty + 1)} aria-label="Increase quantity"><Icon name="plus" size={14} /></button>
                      </div>
                      <span className="bagline__price">{money(p.price * b.qty)}</span>
                    </div>
                    <div className="bagline__links">
                      <button className="link" onClick={() => { remove(b.key); toggleWish(p.id) }}>Move to wishlist</button>
                      <button className="link" onClick={() => { remove(b.key); toast('Removed from bag') }}>Remove</button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="promo">
            <p className="eyebrow">One-tap offers</p>
            <div className="chips">
              {catalog.promos.map((p) => (
                <button key={p.code} className={`chip ${promo === p.code ? 'is-on' : ''}`} onClick={() => apply(promo === p.code ? '' : p.code)} aria-pressed={promo === p.code}>
                  <b className="mono">{p.code}</b> {p.label}
                </button>
              ))}
            </div>
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); apply(code) }}>
              <label htmlFor="promo-code" className="sr-only">Promo code</label>
              <input id="promo-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter a code" autoComplete="off" />
              <button className="btn btn--ghost" type="submit">Apply</button>
            </form>
            {q?.promoError && <p className="note note--warn" role="alert">{q.promoError}</p>}
            {q?.promoApplied && <p className="note note--good">{q.promoApplied} applied · you save {money(q.discount)}</p>}
          </div>
          {upsell.length > 0 && (
            <div className="upsell">
              <p className="eyebrow">Completes the look</p>
              {upsell.map((p) => (
                <div key={p.id} className="upsell__item">
                  <Img src={productImage(p)} alt={p.name} tint={p.colors[0].hex} />
                  <div><p>{p.name}</p><p className="mono dim">{money(p.price)}</p></div>
                  <button className="btn btn--ghost btn--sm" onClick={() => { add({ id: p.id, size: 'M', colorIndex: 0 }); toast(`${p.name} · M added`) }}>Add M</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Shell>
  )
}
