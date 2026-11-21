import { useState } from 'react'
import { api } from '../lib/api'
import { byId, catalog } from '../lib/catalog'
import { useStore } from '../store/useStore'
import Shell from './Shell'

export default function FitFinder() {
  const { close, overlayData, user, setUser, open } = useStore()
  const product = overlayData?.productId ? byId(overlayData.productId) : undefined
  const [f, setF] = useState({ heightCm: String(user?.heightCm ?? 175), weightKg: '', chestCm: '', preference: ((user?.drape as any) ?? 'true') as 'true' | 'relaxed' | 'snug' })
  const [res, setRes] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault(); setErr('')
    const h = Number(f.heightCm)
    if (!(h >= 140 && h <= 210)) { setErr('Enter a height between 140 and 210 cm.'); return }
    setBusy(true)
    try {
      const r = await api.fit({ heightCm: h, weightKg: Number(f.weightKg) || undefined, chestCm: Number(f.chestCm) || undefined, preference: f.preference, garment: product?.garment } as any, product?.id)
      setRes(r)
      if (user) setUser({ ...user, heightCm: h })
    } catch (x: any) { setErr(x.message) } finally { setBusy(false) }
  }

  return (
    <Shell kind="modal" eyebrow={product ? product.name : 'Biometric fit engine'} title="Find your size in 20 seconds" onClose={close}>
      <form className="form" onSubmit={run}>
        <div className="form__2">
          <label className="field"><span>Height (cm)</span><input id="ff-h" type="number" inputMode="numeric" value={f.heightCm} onChange={(e) => setF({ ...f, heightCm: e.target.value })} /></label>
          <label className="field"><span>Weight (kg) <i>optional</i></span><input id="ff-w" type="number" inputMode="numeric" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} placeholder="70" /></label>
        </div>
        <label className="field"><span>Chest (cm) <i>optional · most accurate</i></span><input id="ff-c" type="number" inputMode="numeric" value={f.chestCm} onChange={(e) => setF({ ...f, chestCm: e.target.value })} placeholder="Measure around the fullest part" /></label>
        <fieldset>
          <legend className="field-legend">How do you like it to fit?</legend>
          <div className="seg seg--3" role="radiogroup">
            {([['snug', 'Closer', 'Sculpted, less volume'], ['true', 'As designed', 'Our intended drape'], ['relaxed', 'Roomier', 'Extra room to layer']] as const).map(([k, l, s]) => (
              <button type="button" key={k} role="radio" aria-checked={f.preference === k} className={f.preference === k ? 'is-on' : ''} onClick={() => setF({ ...f, preference: k })}><b>{l}</b><small>{s}</small></button>
            ))}
          </div>
        </fieldset>
        {err && <p className="note note--warn" role="alert">{err}</p>}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Calculating…' : 'Get my size'}</button>
      </form>
      {res && (
        <div className="fitres" aria-live="polite">
          <div className="fitres__ring" style={{ ['--p' as any]: res.confidence }}>
            <span className="fitres__size">{res.size}</span>
            <span className="mono">{Math.round(res.confidence * 100)}% match</span>
          </div>
          <div>
            <p className="eyebrow">Why this size</p>
            <ul className="reasons">{res.reasons.map((r: string) => <li key={r}>{r}</li>)}</ul>
            {res.alternatives?.length > 0 && <p className="dim">Between sizes? {res.alternatives.join(' or ')} also works. Exchanges are free for 7 days.</p>}
            <div className="row-gap">
              {overlayData?.onPick && <button className="btn btn--primary" onClick={() => { overlayData.onPick(res.size); close() }}>Select {res.size}</button>}
              {product && <button className="btn btn--ghost" onClick={() => open('tryon', { productId: product.id })}>Check it on camera</button>}
            </div>
          </div>
        </div>
      )}
      <details className="sizechart">
        <summary>Full size chart (cm)</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Size</th><th>Chest</th><th>Height</th><th>Shoulder</th></tr></thead>
            <tbody>{catalog.sizeChart.rows.map((r) => <tr key={r.size}><td>{r.size}</td><td>{r.chest[0]}–{r.chest[1]}</td><td>{r.height[0]}–{r.height[1]}</td><td>{r.shoulder}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </Shell>
  )
}
