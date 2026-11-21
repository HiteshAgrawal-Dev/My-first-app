import { lazy, Suspense, useState } from 'react'
import { products, GARMENT_LABEL, type Garment } from '../lib/catalog'
import { useMoney } from '../lib/format'
import { useReveal } from '../lib/motion'
import { useStore } from '../store/useStore'
import Icon from '../components/Icon'
import SafeBoundary from '../components/SafeBoundary'
import Img from '../components/Img'
import { LITE } from '../lib/perf'
import { productImage } from '../lib/catalog'

const ProductViewer = lazy(() => import('../three/ProductViewer'))

export default function Lab() {
  const ref = useReveal()
  const money = useMoney()
  const open = useStore((s) => s.open)
  const garments = Object.keys(GARMENT_LABEL) as Garment[]
  const [g, setG] = useState<Garment>('hoodie')
  const options = products.filter((p) => p.garment === g)
  const [pid, setPid] = useState(options[0].id)
  const p = products.find((x) => x.id === pid && x.garment === g) ?? options[0]
  const [ci, setCi] = useState(0)
  const color = p.colors[Math.min(ci, p.colors.length - 1)]
  const [show3d, setShow3d] = useState(!LITE)

  return (
    <div ref={ref} className="page page--lab">
      <section className="lab wrap">
        <div className="lab__copy">
          <p className="eyebrow">Interactive 3D studio</p>
          <h1 className="display display--xl">Every seam,<br /><em>in your hands.</em></h1>
          <p className="lead">Turn any piece through 360°, zoom into the stitching and change its colourway before you buy. Then let the fit engine pick your size.</p>
          <div className="lab__picker">
            <p className="mono">01 · Silhouette</p>
            <div className="chips">{garments.map((x) => <button key={x} className={`chip ${g === x ? 'is-on' : ''}`} aria-pressed={g === x} onClick={() => { setG(x); setPid(products.find((y) => y.garment === x)!.id); setCi(0) }}>{GARMENT_LABEL[x]}</button>)}</div>
            <p className="mono">02 · Piece</p>
            <div className="chips">{options.map((x) => <button key={x.id} className={`chip ${p.id === x.id ? 'is-on' : ''}`} aria-pressed={p.id === x.id} onClick={() => { setPid(x.id); setCi(0) }}>{x.name}</button>)}</div>
            <p className="mono">03 · Colourway · {color.name}</p>
            <div className="swatches swatches--lg" role="radiogroup" aria-label="Colourway">
              {p.colors.map((c, i) => <button key={c.name} role="radio" aria-checked={ci === i} aria-label={c.name} title={c.name} className={ci === i ? 'is-on' : ''} style={{ ['--sw' as any]: c.hex }} onClick={() => setCi(i)} />)}
            </div>
          </div>
          <div className="row-gap">
            <button className="btn btn--primary" onClick={() => open('fit', { productId: p.id })}><Icon name="ruler" size={16} /> Find my size</button>
            <button className="btn btn--ghost" onClick={() => open('tryon', { productId: p.id, colorIndex: ci })}><Icon name="camera" size={16} /> Camera try-on <span className="coming">Soon</span></button>
            <a className="btn btn--ghost" href={`#p-${p.id}`}>View piece · {money(p.price)}</a>
          </div>
          <p className="fineprint">Drag to rotate, scroll or pinch to zoom.</p>
        </div>
        <div className="lab__viewer">
          <div className="lab__ring" aria-hidden />
          {!show3d ? (
            <div className="lab__static"><Img src={productImage(p, Math.min(ci, p.colors.length - 1))} alt={p.name} tint={color.hex} priority /><button className="btn btn--ghost" onClick={() => setShow3d(true)}><Icon name="cube" size={16} /> Load 3D view</button></div>
          ) : <SafeBoundary fallback={<div className="pdp__loading mono">3D preview isn’t available on this device</div>}><Suspense fallback={<div className="pdp__loading mono">Loading 3D…</div>}>
            <ProductViewer key={p.garment} type={p.garment} color={color.hex} />
          </Suspense></SafeBoundary>}
          <div className="lab__hud mono" aria-hidden><span>{p.name.toUpperCase()}</span><span>{p.gsm ? `${p.gsm}GSM` : p.material.split(',')[0].toUpperCase()}</span><span>DRAG · ROTATE</span></div>
        </div>
      </section>
      <section className="wrap section steps" aria-label="How it works">
        {[['Inspect', 'Pick a silhouette and colourway and turn it through 360°.'], ['Size', 'Give us your height and one optional measurement. The fit engine does the rest.'], ['Exchange free', 'Still not right? Swap sizes free within 7 days. We collect from your door.']].map(([t, d], i) => (
          <div key={t} className="step" data-reveal><span className="mono">0{i + 1}</span><h3>{t}</h3><p>{d}</p></div>
        ))}
      </section>
    </div>
  )
}
