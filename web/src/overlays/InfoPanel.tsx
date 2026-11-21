import { useState } from 'react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import Shell from './Shell'

const PAGES: Record<string, { eyebrow: string; title: string; body: JSX.Element }> = {
  about: {
    eyebrow: 'Maison', title: 'About Véloura Atelier',
    body: (<>
      <p>Véloura began in 2019 as a two-person pattern studio between Paris and Tokyo, obsessed with one question: why does streetwear lose its shape by the third wash?</p>
      <p>Our answer was architecture. We cut heavyweight cotton in panels the way tailors cut a jacket, so a hoodie holds its line all day. Today every piece is patterned in Paris, engineered in Tokyo and finished by our atelier partners in Mumbai.</p>
      <dl className="kv"><div><dt>Founded</dt><dd>2019, Paris</dd></div><div><dt>Ateliers</dt><dd>Paris · Tokyo · Mumbai</dd></div><div><dt>Cotton</dt><dd>100% GOTS-certified organic</dd></div><div><dt>Packaging</dt><dd>Plastic-free since 2022</dd></div></dl>
    </>),
  },
  shipping: {
    eyebrow: 'Client concierge', title: 'Shipping, duties & returns',
    body: (<>
      <h3>Delivery in India</h3>
      <p>Dispatch within 48 hours. Express reaches metros in 1–2 days (₹349). Standard takes 3–6 days and is free over ₹4,999 (otherwise ₹199). Cash on delivery is available on most pincodes for ₹99.</p>
      <h3>International</h3>
      <p>We ship to the EU, UK, Japan and the US with duties prepaid, so there's nothing extra to pay on arrival. Delivery takes 4–8 working days.</p>
      <h3>Exchanges & returns</h3>
      <p>Size exchanges are free for 7 days after delivery and we collect from your door. Refunds go to the original payment method within 5 working days of pickup. Pieces must be unworn with tags attached. Limited drops are exchange-only.</p>
    </>),
  },
  privacy: {
    eyebrow: 'Client concierge', title: 'Privacy & biometric data',
    body: (<>
      <p>The camera try-on runs entirely in your browser. Video frames are processed on your device by an on-device pose model and are never uploaded, recorded or stored by us.</p>
      <p>If you save a fit profile, we store only your height, optional weight and chest measurement and your drape preference, to recommend sizes. You can delete it anytime from your profile.</p>
      <p>We never sell personal data. Payment details are handled by our PCI-DSS certified payment partner and never touch our servers.</p>
    </>),
  },
}

function Styling() {
  const toast = useStore((s) => s.toast)
  const [f, setF] = useState({ name: '', email: '', city: 'Mumbai', slot: '' })
  const [done, setDone] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (f.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(f.email) || !f.slot) { setErr('Add your name, a valid email and a preferred time.'); return }
    try { const r = await api.styling({ ...f, slot: new Date(f.slot).toISOString() }); setDone(r.bookingId); toast('Styling session requested') } catch (x: any) { setErr(x.message) }
  }
  if (done) return <div className="success"><p>Your session is requested. Reference <b className="mono">{done}</b>. A stylist will confirm by email within 2 hours.</p></div>
  return (
    <form className="form" onSubmit={submit}>
      <p>45 minutes with a senior stylist: fit consultation, capsule building and alterations. Complimentary, with no obligation to buy.</p>
      <label className="field"><span>Name</span><input id="st-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="field"><span>Email</span><input id="st-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <div className="form__2">
        <label className="field"><span>Where</span><select id="st-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}><option>Mumbai</option><option>Paris</option><option>Tokyo</option><option>Video call</option></select></label>
        <label className="field"><span>Preferred time</span><input id="st-slot" type="datetime-local" value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })} /></label>
      </div>
      {err && <p className="note note--warn" role="alert">{err}</p>}
      <button className="btn btn--primary btn--block">Request session</button>
    </form>
  )
}

export default function InfoPanel() {
  const { close, overlayData } = useStore()
  const page = overlayData?.page ?? 'about'
  if (page === 'styling') return <Shell kind="drawer" eyebrow="Flagships" title="Book a private styling session" onClose={close}><Styling /></Shell>
  const p = PAGES[page] ?? PAGES.about
  return <Shell kind="drawer" eyebrow={p.eyebrow} title={p.title} onClose={close}><div className="prose">{p.body}</div></Shell>
}
