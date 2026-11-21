import { useEffect, useState } from 'react'
import { api, type Payment, type ShipMode } from '../lib/api'
import { byId, productImage } from '../lib/catalog'
import { useMoney } from '../lib/format'
import { useStore } from '../store/useStore'
import { useQuote } from './BagDrawer'
import Shell from './Shell'
import Icon from '../components/Icon'
import Img from '../components/Img'

type Del = { serviceable: boolean; city?: string; etaDays?: number; expressDays?: number; cod?: boolean } | null

export default function CheckoutModal() {
  const { close, bag, promo, user, clearBag, toast } = useStore()
  const money = useMoney()
  const [payment, setPayment] = useState<Payment>('upi')
  const [ship, setShip] = useState<ShipMode>('standard')
  const q = useQuote(payment, ship)
  const [f, setF] = useState({ email: user?.email ?? '', name: user?.name ?? '', phone: '', line1: '', city: '', pincode: '', upi: '', card: '', exp: '', cvc: '' })
  const [del, setDel] = useState<Del>(null)
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ orderId: string; total: number; etaDate: string } | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value
    if (k === 'phone' || k === 'pincode') v = v.replace(/\D/g, '').slice(0, k === 'phone' ? 10 : 6)
    if (k === 'card') v = v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')
    if (k === 'exp') v = v.replace(/\D/g, '').slice(0, 4).replace(/(\d{2})(?=\d)/, '$1/')
    if (k === 'cvc') v = v.replace(/\D/g, '').slice(0, 4)
    setF((o) => ({ ...o, [k]: v }))
  }

  useEffect(() => {
    if (f.pincode.length !== 6) { setDel(null); return }
    api.delivery(f.pincode).then((d: any) => { setDel(d); if (d.city && !f.city) setF((o) => ({ ...o, city: d.city })) }).catch(() => setDel({ serviceable: false }))
  }, [f.pincode])

  useEffect(() => { if (del && del.cod === false && payment === 'cod') setPayment('upi') }, [del, payment])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter an email like name@example.com for your receipt.'
    if (f.name.trim().length < 2) e.name = 'Enter the name for delivery.'
    if (f.phone.length !== 10) e.phone = 'Enter a 10-digit mobile number. The courier calls this before arriving.'
    if (f.line1.trim().length < 5) e.line1 = 'Enter your flat, building and street.'
    if (f.pincode.length !== 6) e.pincode = 'Enter a 6-digit pincode.'
    else if (del && !del.serviceable) e.pincode = 'We don’t deliver to this pincode yet. Try a nearby one or book a store pickup.'
    if (!f.city.trim()) e.city = 'Enter your city.'
    if (payment === 'upi' && !/^[\w.\-]{2,}@[a-z]{2,}$/i.test(f.upi)) e.upi = 'Enter a UPI ID like name@okhdfcbank, or pick your UPI app.'
    if (payment === 'card') {
      if (f.card.replace(/\s/g, '').length < 15) e.card = 'Enter the full card number.'
      if (!/^\d{2}\/\d{2}$/.test(f.exp)) e.exp = 'Use MM/YY.'
      if (f.cvc.length < 3) e.cvc = '3 or 4 digits on the back.'
    }
    setErr(e)
    return Object.keys(e).length === 0
  }

  const place = async () => {
    if (!validate()) { toast('Check the highlighted fields', 'warn'); return }
    setBusy(true)
    try {
      const items = bag.map((b) => ({ id: b.id, size: b.size, color: byId(b.id)?.colors[b.colorIndex]?.name ?? '', qty: b.qty }))
      const r = await api.placeOrder({ items, promo, payment, shipping: ship, email: f.email, address: { name: f.name, phone: f.phone, line1: f.line1, city: f.city, pincode: f.pincode } }, user?.token)
      setDone(r); clearBag()
    } catch (x: any) { setErr({ form: x.message }) } finally { setBusy(false) }
  }

  if (done) return (
    <Shell kind="modal" eyebrow="Order confirmed" title="Merci. It's being made ready." onClose={close}>
      <div className="success">
        <div className="success__seal" aria-hidden><Icon name="check" size={34} /></div>
        <dl className="kv">
          <div><dt>Order number</dt><dd className="mono">{done.orderId}</dd></div>
          <div><dt>Paid</dt><dd>{money(done.total)}{payment === 'cod' ? ' on delivery' : ''}</dd></div>
          <div><dt>Arrives by</dt><dd>{new Date(done.etaDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</dd></div>
        </dl>
        <p className="dim">A confirmation is on its way to {f.email}. Wrong size? Exchange it free within 7 days of delivery: we collect from your door.</p>
        <div className="row-gap">
          <a className="btn btn--primary" href={`#track-${done.orderId}`} onClick={close}>Track this order</a>
          <button className="btn btn--ghost" onClick={close}>Keep browsing</button>
        </div>
      </div>
    </Shell>
  )

  const E = ({ k }: { k: string }) => (err[k] ? <span className="field__err" role="alert">{err[k]}</span> : null)
  const etaDays = del?.serviceable ? (ship === 'express' ? del.expressDays : del.etaDays) : null

  return (
    <Shell kind="modal" eyebrow="Secure checkout" title="Checkout" onClose={close} wide>
      {bag.length === 0 ? <div className="empty"><p className="empty__title">Your bag is empty</p><a className="btn btn--primary" href="#men" onClick={close}>Start shopping</a></div> : (
        <div className="checkout">
          <form className="form checkout__form" onSubmit={(e) => { e.preventDefault(); place() }} noValidate>
            <fieldset>
              <legend><span className="mono">01</span> Contact</legend>
              <label className="field"><span>Email for receipt & tracking</span><input id="co-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" aria-invalid={!!err.email} /><E k="email" /></label>
              {!user && <p className="fineprint">Checking out as a guest. <button type="button" className="link" onClick={() => useStore.getState().open('auth')}>Sign in</button> to save your details.</p>}
            </fieldset>
            <fieldset>
              <legend><span className="mono">02</span> Delivery address</legend>
              <div className="form__2">
                <label className="field"><span>Full name</span><input id="co-name" value={f.name} onChange={set('name')} autoComplete="name" aria-invalid={!!err.name} /><E k="name" /></label>
                <label className="field"><span>Mobile (+91)</span><input id="co-phone" inputMode="numeric" value={f.phone} onChange={set('phone')} autoComplete="tel-national" aria-invalid={!!err.phone} placeholder="98XXXXXXXX" /><E k="phone" /></label>
              </div>
              <label className="field"><span>Flat, building, street</span><input id="co-line1" value={f.line1} onChange={set('line1')} autoComplete="street-address" aria-invalid={!!err.line1} /><E k="line1" /></label>
              <div className="form__2">
                <label className="field"><span>Pincode</span><input id="co-pin" inputMode="numeric" value={f.pincode} onChange={set('pincode')} autoComplete="postal-code" aria-invalid={!!err.pincode} placeholder="400001" />
                  {del && (del.serviceable ? <span className="field__ok">Delivers to {del.city} in {etaDays} day{etaDays === 1 ? '' : 's'}{del.cod ? ' · COD available' : ''}</span> : <span className="field__err">Not serviceable yet</span>)}<E k="pincode" />
                </label>
                <label className="field"><span>City</span><input id="co-city" value={f.city} onChange={set('city')} autoComplete="address-level2" aria-invalid={!!err.city} /><E k="city" /></label>
              </div>
            </fieldset>
            <fieldset>
              <legend><span className="mono">03</span> Shipping speed</legend>
              <div className="radios">
                <label className={`radio ${ship === 'standard' ? 'is-on' : ''}`}><input type="radio" name="ship" checked={ship === 'standard'} onChange={() => setShip('standard')} /><span><b>Standard</b><small>{del?.serviceable ? `${del.etaDays} days` : '3–6 days'}</small></span><span>{q && ship === 'standard' && q.shippingFee === 0 ? 'Free' : money(199)}</span></label>
                <label className={`radio ${ship === 'express' ? 'is-on' : ''}`}><input type="radio" name="ship" checked={ship === 'express'} onChange={() => setShip('express')} /><span><b>48h atelier express</b><small>{del?.serviceable ? `${del.expressDays} days` : '1–2 days in metros'}</small></span><span>{money(349)}</span></label>
              </div>
            </fieldset>
            <fieldset>
              <legend><span className="mono">04</span> Payment</legend>
              <div className="seg seg--3" role="radiogroup" aria-label="Payment method">
                {([['upi', 'UPI', '5% off with PREPAID5'], ['card', 'Card / EMI', 'Visa · Mastercard · RuPay · Amex'], ['cod', 'Cash on delivery', '+₹99 handling']] as const).map(([k, l, s]) => (
                  <button type="button" key={k} role="radio" aria-checked={payment === k} className={payment === k ? 'is-on' : ''} disabled={k === 'cod' && del?.cod === false} onClick={() => setPayment(k)}><b>{l}</b><small>{s}</small></button>
                ))}
              </div>
              {payment === 'upi' && (
                <>
                  <div className="chips">{['okhdfcbank', 'ybl', 'paytm', 'okicici'].map((h) => <button type="button" key={h} className="chip" onClick={() => setF((o) => ({ ...o, upi: (o.upi.split('@')[0] || o.phone || 'yourname') + '@' + h }))}>@{h}</button>)}</div>
                  <label className="field"><span>UPI ID</span><input id="co-upi" value={f.upi} onChange={set('upi')} placeholder="yourname@okhdfcbank" aria-invalid={!!err.upi} /><E k="upi" /></label>
                  <p className="fineprint">You'll approve the payment in your UPI app. Nothing is charged until you approve.</p>
                </>
              )}
              {payment === 'card' && (
                <>
                  <label className="field"><span>Card number</span><input id="co-card" inputMode="numeric" value={f.card} onChange={set('card')} placeholder="4242 4242 4242 4242" autoComplete="cc-number" aria-invalid={!!err.card} /><E k="card" /></label>
                  <div className="form__2">
                    <label className="field"><span>Expiry</span><input id="co-exp" inputMode="numeric" value={f.exp} onChange={set('exp')} placeholder="MM/YY" autoComplete="cc-exp" aria-invalid={!!err.exp} /><E k="exp" /></label>
                    <label className="field"><span>CVC</span><input id="co-cvc" inputMode="numeric" value={f.cvc} onChange={set('cvc')} placeholder="123" autoComplete="cc-csc" aria-invalid={!!err.cvc} /><E k="cvc" /></label>
                  </div>
                  {q && q.total >= 3000 && <p className="fineprint">Or pay in 3 interest-free EMIs of {money(Math.ceil(q.total / 3))} on eligible cards.</p>}
                </>
              )}
              {payment === 'cod' && <p className="fineprint">Pay by cash or UPI when it arrives. A ₹99 handling fee applies. Prepaid orders ship first.</p>}
            </fieldset>
            {err.form && <p className="note note--warn" role="alert">{err.form}</p>}
            <p className="fineprint"><Icon name="lock" size={12} /> Demo store: payment details are validated in your browser and never sent or stored.</p>
          </form>
          <aside className="checkout__sum">
            <p className="eyebrow">Order summary</p>
            <ul className="mini">
              {bag.map((b) => { const p = byId(b.id)!; return (
                <li key={b.key}><Img src={productImage(p, b.colorIndex)} alt="" tint={p.colors[b.colorIndex].hex} /><span>{p.name}<small className="mono dim">{b.size} · {p.colors[b.colorIndex].name} · ×{b.qty}</small></span><span className="mono">{money(p.price * b.qty)}</span></li>
              ) })}
            </ul>
            {q && (
              <dl className="sumlist">
                <div><dt>Subtotal</dt><dd>{money(q.subtotal)}</dd></div>
                {q.discount > 0 && <div className="is-good"><dt>{q.promoApplied}</dt><dd>−{money(q.discount)}</dd></div>}
                {q.promoError && <div className="is-warn"><dt>{q.promoError}</dt></div>}
                <div><dt>Shipping</dt><dd>{q.shippingFee === 0 ? 'Free' : money(q.shippingFee)}</dd></div>
                {q.codFee > 0 && <div><dt>COD handling</dt><dd>{money(q.codFee)}</dd></div>}
                <div className="sumlist__total"><dt>Total</dt><dd>{money(q.total)}</dd></div>
              </dl>
            )}
            <button className="btn btn--primary btn--block" onClick={place} disabled={busy}>{busy ? 'Placing order…' : q ? `Place order · ${money(q.total)}` : 'Place order'}</button>
            <ul className="trust mono">
              <li><Icon name="swap" size={14} /> 7-day free size exchange</li>
              <li><Icon name="shield" size={14} /> Authenticity card in every box</li>
              <li><Icon name="truck" size={14} /> Dispatch within 48 hours</li>
            </ul>
          </aside>
        </div>
      )}
    </Shell>
  )
}
