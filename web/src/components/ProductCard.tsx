import { useState } from 'react'
import { isUpcoming, productImage, totalStock, type Product } from '../lib/catalog'
import { useMoney } from '../lib/format'
import { useCountdown } from '../lib/motion'
import { useStore } from '../store/useStore'
import Icon from './Icon'
import Img from './Img'

export default function ProductCard({ p, priority = false }: { p: Product; priority?: boolean }) {
  const money = useMoney()
  const [ci, setCi] = useState(0)
  const [quick, setQuick] = useState(false)
  const wished = useStore((s) => s.wishlist.includes(p.id))
  const toggleWish = useStore((s) => s.toggleWish)
  const add = useStore((s) => s.add)
  const toast = useStore((s) => s.toast)
  const open = useStore((s) => s.open)
  const upcoming = isUpcoming(p)
  const cd = useCountdown(upcoming ? p.drop : null)
  const stock = totalStock(p)
  const low = stock > 0 && stock <= 8

  const quickAdd = (size: string) => {
    add({ id: p.id, size, colorIndex: ci })
    toast(`${p.name} · ${size} added to bag`)
    setQuick(false)
    open('bag')
  }

  return (
    <article className="pcard" onMouseLeave={() => setQuick(false)}>
      <div className="pcard__top">
      <a href={`#p-${p.id}`} className="pcard__media" aria-label={`${p.name}, ${money(p.price)}`}>
        <Img className="pcard__img" src={productImage(p, ci)} alt={`${p.name} in ${p.colors[ci].name}`} priority={priority} tint={p.colors[ci].hex} />
        <Img className="pcard__img pcard__img--alt" src={productImage(p, 0, 'back')} alt="" tint={p.colors[0].hex} />
        <span className="pcard__tags">
          {p.badge && <span className="tag">{p.badge}</span>}
          {p.compareAt && <span className="tag tag--accent">−{Math.round((1 - p.price / p.compareAt) * 100)}%</span>}
        </span>
        {upcoming && cd && <span className="pcard__drop mono">Drops in {cd.d}d {String(cd.h).padStart(2, '0')}:{String(cd.m).padStart(2, '0')}:{String(cd.s).padStart(2, '0')}</span>}
      </a>
      <button className={`pcard__wish ${wished ? 'is-on' : ''}`} onClick={() => toggleWish(p.id)} aria-pressed={wished} aria-label={wished ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}>
        <Icon name="heart" size={18} />
      </button>
      {!upcoming && stock > 0 && (
        <div className={`pcard__quick ${quick ? 'is-open' : ''}`}>
          {quick ? (
            <div className="pcard__sizes" role="group" aria-label="Choose a size to add">
              {p.sizes.map((s) => (
                <button key={s} disabled={!p.stock[s]} onClick={() => quickAdd(s)} aria-label={p.stock[s] ? `Add size ${s}` : `Size ${s} sold out`}>{s}</button>
              ))}
            </div>
          ) : (
            <button className="pcard__quickbtn" onClick={() => setQuick(true)}><Icon name="plus" size={14} /> Quick add</button>
          )}
        </div>
      )}
      </div>
      <div className="pcard__body">
        <div className="pcard__row">
          <h3 className="pcard__name"><a href={`#p-${p.id}`}>{p.name}</a></h3>
          <span className="pcard__price">
            {p.compareAt && <s>{money(p.compareAt)}</s>} {money(p.price)}
          </span>
        </div>
        <div className="pcard__row pcard__meta">
          <span className="mono">{p.gsm ? `${p.gsm}GSM · ` : ''}{p.fit}</span>
          <span className="pcard__rating"><Icon name="star" size={12} /> {p.rating.toFixed(1)} <span className="dim">({p.reviews})</span></span>
        </div>
        <div className="pcard__row">
          <div className="swatches" role="radiogroup" aria-label="Colour">
            {p.colors.map((c, i) => (
              <button key={c.name} role="radio" aria-checked={i === ci} aria-label={c.name} title={c.name} className={i === ci ? 'is-on' : ''} style={{ ['--sw' as any]: c.hex }} onClick={() => setCi(i)} />
            ))}
          </div>
          {upcoming ? <span className="note mono">Notify-me open</span> : stock === 0 ? <span className="note note--warn mono">Sold out</span> : low ? <span className="note note--warn mono">Only {stock} left</span> : <span className="note mono">Ships in 48h</span>}
        </div>
      </div>
    </article>
  )
}
