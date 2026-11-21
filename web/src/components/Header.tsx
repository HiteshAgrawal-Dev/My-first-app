import { useEffect, useState } from 'react'
import { bagCount, useStore, type Currency } from '../store/useStore'
import type { Route } from '../lib/router'
import Icon from './Icon'

const NAV: { hash: string; label: string; idx: string; route: Route['name'] }[] = [
  { hash: 'men', label: 'Men', idx: '01', route: 'men' },
  { hash: 'women', label: 'Women', idx: '02', route: 'women' },
  { hash: 'drops', label: 'Drops', idx: '03', route: 'drops' },
  { hash: 'lab', label: '3D Try-On Lab', idx: '04', route: 'lab' },
]

export default function Header({ route }: { route: Route }) {
  const count = useStore(bagCount)
  const wish = useStore((s) => s.wishlist.length)
  const user = useStore((s) => s.user)
  const open = useStore((s) => s.open)
  const currency = useStore((s) => s.currency)
  const setCurrency = useStore((s) => s.setCurrency)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let last = 0
    const on = () => {
      const y = scrollY
      setScrolled(y > 24)
      setHidden(y > 400 && y > last + 4)
      if (y < last - 4) setHidden(false)
      last = y
    }
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea'))) { e.preventDefault(); open('search') }
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [open])

  return (
    <>
      <div className="announce" role="note">
        <div className="announce__track">
          <span>Free express shipping over ₹4,999</span><span>7-day free size exchange</span><span>UPI · Cards · Cash on delivery</span><span>Code ATELIER10 for 10% off your first bag</span>
          <span aria-hidden>Free express shipping over ₹4,999</span><span aria-hidden>7-day free size exchange</span><span aria-hidden>UPI · Cards · Cash on delivery</span><span aria-hidden>Code ATELIER10 for 10% off your first bag</span>
        </div>
      </div>
      <header className={`header ${scrolled ? 'is-scrolled' : ''} ${hidden ? 'is-hidden' : ''}`}>
        <nav className="header__nav" aria-label="Primary">
          {NAV.map((n) => (
            <a key={n.hash} href={`#${n.hash}`} className={route.name === n.route ? 'is-active' : ''} aria-current={route.name === n.route ? 'page' : undefined}>
              <span className="mono">{n.idx}</span>{n.label}
            </a>
          ))}
        </nav>
        <a href="#home" className="brand" aria-label="Véloura Atelier home">
          <span className="brand__word">VÉLOURA</span>
          <span className="brand__sub mono">Atelier · Paris / Tokyo / Mumbai</span>
        </a>
        <div className="header__actions">
          <button className="icon-btn search-pill" onClick={() => open('search')} aria-label="Search (press /)">
            <Icon name="search" /><span className="search-pill__text">Search</span><kbd className="mono">/</kbd>
          </button>
          <label className="currency">
            <span className="sr-only">Currency</span>
            <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="INR">₹ INR</option><option value="EUR">€ EUR</option><option value="JPY">¥ JPY</option><option value="USD">$ USD</option>
            </select>
          </label>
          <a className="icon-btn hide-sm" href="#wishlist" aria-label={`Wishlist, ${wish} saved`}>
            <Icon name="heart" />{wish > 0 && <span className="badge">{wish}</span>}
          </a>
          <button className="icon-btn" onClick={() => open('auth')} aria-label={user ? `Account: ${user.name}` : 'Sign in'}>
            {user ? <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span> : <Icon name="user" />}
          </button>
          <button className="icon-btn" onClick={() => open('bag')} aria-label={`Shopping bag, ${count} items`}>
            <Icon name="bag" />{count > 0 && <span className="badge badge--accent">{count}</span>}
          </button>
        </div>
      </header>
    </>
  )
}
