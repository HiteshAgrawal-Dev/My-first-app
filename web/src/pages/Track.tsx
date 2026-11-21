import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useMoney } from '../lib/format'

export default function Track({ id }: { id?: string }) {
  const money = useMoney()
  const [q, setQ] = useState(id ?? '')
  const [o, setO] = useState<any>(null)
  const [err, setErr] = useState('')
  const run = async (oid: string) => { setErr(''); try { setO(await api.track(oid)) } catch (x: any) { setO(null); setErr(x.message) } }
  useEffect(() => { if (id) run(id) }, [id])
  useEffect(() => { if (!o) return; const t = setInterval(() => run(o.orderId), 15000); return () => clearInterval(t) }, [o?.orderId])
  return (
    <div className="page page--track wrap">
      <p className="eyebrow">Client concierge</p>
      <h1 className="display display--xl">Track your <em>order</em></h1>
      <form className="inline-form track__form" onSubmit={(e) => { e.preventDefault(); run(q) }}>
        <label htmlFor="trk" className="sr-only">Order number</label>
        <input id="trk" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, e.g. VA-7K2P9Q" />
        <button className="btn btn--primary">Track</button>
      </form>
      {err && <p className="note note--warn" role="alert">{err}</p>}
      {o && (
        <div className="track">
          <dl className="kv"><div><dt>Order</dt><dd className="mono">{o.orderId}</dd></div><div><dt>Status</dt><dd style={{ textTransform: 'capitalize' }}>{o.status}</dd></div><div><dt>Total</dt><dd>{money(o.total)}</dd></div></dl>
          <ol className="timeline">
            {o.timeline.map((t: any) => (
              <li key={t.label} className={t.done ? 'is-done' : ''}><span className="timeline__dot" /><b>{t.label}</b><span className="mono dim">{t.done ? new Date(t.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Pending'}</span></li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
