import { bagCount, useStore } from '../store/useStore'
import type { Route } from '../lib/router'
import Icon from './Icon'

export default function BottomBar({ route }: { route: Route }) {
  const count = useStore(bagCount)
  const wish = useStore((s) => s.wishlist.length)
  const open = useStore((s) => s.open)
  const items = [
    { k: 'home', label: 'Home', icon: 'home', href: '#home', active: route.name === 'home' },
    { k: 'shop', label: 'Shop', icon: 'grid', href: '#men', active: ['men', 'women', 'drops', 'product'].includes(route.name) },
    { k: 'lab', label: '3D', icon: 'cube', href: '#lab', active: route.name === 'lab' },
    { k: 'wish', label: 'Wishlist', icon: 'heart', href: '#wishlist', active: route.name === 'wishlist', n: wish },
  ]
  return (
    <nav className="bottombar" aria-label="Quick navigation">
      {items.map((i) => (
        <a key={i.k} href={i.href} className={i.active ? 'is-active' : ''}>
          <span className="bottombar__ico"><Icon name={i.icon} />{!!i.n && <span className="badge">{i.n}</span>}</span>{i.label}
        </a>
      ))}
      <button onClick={() => open('bag')}>
        <span className="bottombar__ico"><Icon name="bag" />{count > 0 && <span className="badge badge--accent">{count}</span>}</span>Bag
      </button>
    </nav>
  )
}
