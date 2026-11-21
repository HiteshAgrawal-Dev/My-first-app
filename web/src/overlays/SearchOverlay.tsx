import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { byId, productImage, products, GARMENT_LABEL, type Product } from '../lib/catalog'
import { useMoney } from '../lib/format'
import { useStore } from '../store/useStore'
import Shell from './Shell'
import Img from '../components/Img'

const TRENDING = ['500GSM hoodie', 'parachute cargo', 'corset blazer', 'puffer', 'oxblood', 'boxy tee']

export default function SearchOverlay() {
  const close = useStore((s) => s.close)
  const recent = useStore((s) => s.recent)
  const money = useMoney()
  const [q, setQ] = useState('')
  const [res, setRes] = useState<{ product: Product; score: number }[]>([])
  const [sugg, setSugg] = useState<string[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!q.trim()) { setRes([]); setSugg([]); return }
    let live = true
    const t = setTimeout(() => api.search(q).then((r: any) => { if (!live) return; setRes(r.results); setSugg(r.suggestions ?? []); setActive(0) }), 120)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  const goTo = (id: string) => { location.hash = `p-${id}`; close() }
  const list = q ? res.map((r) => r.product) : (recent.map(byId).filter(Boolean) as Product[]).slice(0, 4)

  return (
    <Shell kind="sheet" title="Search the atelier" onClose={close} wide>
      <div className="search">
        <label htmlFor="search-input" className="sr-only">Search products</label>
        <input id="search-input" data-autofocus className="search__input" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search 500GSM hoodies, parachute cargos, corset blazers…" autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
            if (e.key === 'Enter' && list[active]) goTo(list[active].id)
          }}
          role="combobox" aria-expanded={list.length > 0} aria-controls="search-results" aria-activedescendant={list[active] ? `sr-${list[active].id}` : undefined} />
        {!q && (
          <div className="search__chips">
            <p className="eyebrow">Trending in Mumbai, Paris & Tokyo</p>
            <div className="chips">{TRENDING.map((t) => <button key={t} className="chip" onClick={() => setQ(t)}>{t}</button>)}</div>
            <p className="eyebrow">Shop by silhouette</p>
            <div className="chips">{Object.entries(GARMENT_LABEL).map(([k, v]) => <button key={k} className="chip" onClick={() => setQ(k)}>{v}</button>)}</div>
          </div>
        )}
        {q && sugg.length > 0 && <p className="dim search__sugg">Did you mean {sugg.slice(0, 3).map((s, i) => <button key={s} className="link" onClick={() => setQ(s)}>{s}{i < Math.min(2, sugg.length - 1) ? ',' : ''}</button>)}?</p>}
        {!q && list.length > 0 && <p className="eyebrow">Recently viewed</p>}
        <ul id="search-results" className="search__results" role="listbox">
          {list.map((p, i) => (
            <li key={p.id} id={`sr-${p.id}`} role="option" aria-selected={i === active}>
              <button className={`sres ${i === active ? 'is-active' : ''}`} onClick={() => goTo(p.id)} onMouseEnter={() => setActive(i)}>
                <Img src={productImage(p)} alt="" tint={p.colors[0].hex} />
                <span className="sres__name">{p.name}<span className="mono dim">{p.dept} · {p.material.split(',')[0]}</span></span>
                <span className="mono">{money(p.price)}</span>
              </button>
            </li>
          ))}
        </ul>
        {q && res.length === 0 && (
          <div className="empty">
            <p className="empty__title">Nothing matches "{q}" yet</p>
            <p className="dim">Try "hoodie", "cargo" or a colour like "oxblood", or ask the concierge to find it for you.</p>
            <div className="chips">{products.slice(0, 4).map((p) => <button key={p.id} className="chip" onClick={() => goTo(p.id)}>{p.name}</button>)}</div>
          </div>
        )}
      </div>
    </Shell>
  )
}
