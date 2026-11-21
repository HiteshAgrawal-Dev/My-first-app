import { useMemo, useState } from 'react'
import { products, GARMENT_LABEL, asset, type Dept, type Garment } from '../lib/catalog'
import { useReveal } from '../lib/motion'
import ProductCard from '../components/ProductCard'
import Img from '../components/Img'

const META: Record<Dept, { title: string; em: string; sub: string; hero: string; tone: string }> = {
  men: { title: 'Men’s', em: 'architectural heavyweights', sub: '500GSM hoodies, heavy tees, parachute cargos and unstructured tailoring, cut boxy and built to hold their line.', hero: '/renders/cat-hoodie.webp', tone: '#15121a' },
  women: { title: 'Women’s', em: 'sculpted streetwear', sub: 'Corset blazers with spiral-steel boning, cocoon hoodies and low-rise parachute cargos.', hero: '/renders/cat-corset.webp', tone: '#5c1428' },
  drops: { title: 'Limited', em: 'capsule drops', sub: 'Numbered pieces in single colourways. When a drop sells out it is never remade. Members get access 24 hours early.', hero: '/renders/cat-puffer.webp', tone: '#3a1f3d' },
}
type Sort = 'featured' | 'price-asc' | 'price-desc' | 'rating'

export default function Collection({ dept }: { dept: Dept }) {
  const m = META[dept]
  const [garment, setGarment] = useState<Garment | 'all'>('all')
  const [size, setSize] = useState<string>('any')
  const [sort, setSort] = useState<Sort>('featured')
  const [maxPrice, setMaxPrice] = useState(20000)
  const base = products.filter((p) => p.dept === dept)
  const garments = [...new Set(base.map((p) => p.garment))]
  const list = useMemo(() => {
    let l = base.filter((p) => (garment === 'all' || p.garment === garment) && (size === 'any' || (p.stock[size] ?? 0) > 0) && p.price <= maxPrice)
    if (sort === 'price-asc') l = [...l].sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') l = [...l].sort((a, b) => b.price - a.price)
    if (sort === 'rating') l = [...l].sort((a, b) => b.rating - a.rating)
    return l
  }, [dept, garment, size, sort, maxPrice])
  const ref = useReveal(dept + garment + size + sort + maxPrice)

  return (
    <div ref={ref} className="page page--collection">
      <header className="colhero">
        <div className="colhero__img" data-parallax="10"><Img src={asset(m.hero)} alt="" tint={m.tone} priority /></div>
        <div className="colhero__copy wrap">
          <p className="eyebrow">{base.length} pieces · Free 7-day exchange</p>
          <h1 className="display display--xl">{m.title} <em>{m.em}</em></h1>
          <p className="lead">{m.sub}</p>
        </div>
      </header>
      <div className="filters wrap" role="region" aria-label="Filter and sort">
        <div className="chips" role="group" aria-label="Silhouette">
          <button className={`chip ${garment === 'all' ? 'is-on' : ''}`} aria-pressed={garment === 'all'} onClick={() => setGarment('all')}>All</button>
          {garments.map((g) => <button key={g} className={`chip ${garment === g ? 'is-on' : ''}`} aria-pressed={garment === g} onClick={() => setGarment(g)}>{GARMENT_LABEL[g]}</button>)}
        </div>
        <div className="filters__right">
          <label className="select"><span className="mono">In stock in</span>
            <select id="f-size" value={size} onChange={(e) => setSize(e.target.value)}><option value="any">Any size</option>{['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="select"><span className="mono">Under</span>
            <select id="f-price" value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))}><option value={20000}>Any price</option><option value={5000}>₹5,000</option><option value={8000}>₹8,000</option><option value={14000}>₹14,000</option></select>
          </label>
          <label className="select"><span className="mono">Sort</span>
            <select id="f-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="featured">Featured</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="rating">Top rated</option></select>
          </label>
        </div>
      </div>
      <section className="wrap section section--tight">
        {list.length ? <div className="grid grid--3">{list.map((p, i) => <div key={p.id} data-reveal><ProductCard p={p} priority={i < 3} /></div>)}</div> : (
          <div className="empty"><p className="empty__title">No pieces match those filters</p><button className="btn btn--ghost" onClick={() => { setGarment('all'); setSize('any'); setMaxPrice(20000) }}>Clear filters</button></div>
        )}
      </section>
    </div>
  )
}
