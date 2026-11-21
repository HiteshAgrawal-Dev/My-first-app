import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import Icon from './Icon'

const CITIES = [
  { city: 'Paris', addr: '211 Rue Saint-Honoré, 75001', tz: 'Europe/Paris' },
  { city: 'Tokyo', addr: '6-12 Jingumae, Shibuya-ku', tz: 'Asia/Tokyo' },
  { city: 'Mumbai', addr: '14 Rampart Row, Kala Ghoda', tz: 'Asia/Kolkata' },
]

export default function Footer() {
  const open = useStore((s) => s.open)
  const toast = useStore((s) => s.toast)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t) }, [])

  const join = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('')
    try { const r = await api.newsletter(email); setMsg(`You're on the list. Use ${r.code} for ₹1,000 off your first order over ₹7,000.`); toast('Welcome to the VIP list'); setEmail('') }
    catch (x: any) { setMsg(x.message) }
  }

  const cols: { title: string; links: { label: string; href?: string; on?: () => void }[] }[] = [
    { title: 'Departments', links: [{ label: 'Men’s architectural heavyweights', href: '#men' }, { label: 'Women’s sculpted streetwear', href: '#women' }, { label: 'Limited capsule drops', href: '#drops' }, { label: 'Interactive 3D try-on studio', href: '#lab' }] },
    { title: 'Client concierge', links: [{ label: 'About Véloura Atelier', on: () => open('info', { page: 'about' }) }, { label: 'Shipping, duties & returns', on: () => open('info', { page: 'shipping' }) }, { label: 'Privacy & biometric data', on: () => open('info', { page: 'privacy' }) }, { label: 'Track an order', href: '#track' }, { label: 'Book a private styling session', on: () => open('info', { page: 'styling' }) }] },
  ]

  return (
    <footer className="footer">
      <div className="footer__top wrap">
        <div className="footer__brand">
          <p className="footer__word">VÉLOURA</p>
          <p className="dim">Architectural luxury streetwear engineered for kinetic silhouettes, with live 3D and camera fitting.</p>
          <form className="inline-form" onSubmit={join}>
            <label htmlFor="vip-email" className="sr-only">Email for the VIP list</label>
            <input id="vip-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email for early drop access" autoComplete="email" />
            <button className="btn btn--primary">Join</button>
          </form>
          {msg && <p className="note" role="status">{msg}</p>}
        </div>
        {cols.map((c) => (
          <details key={c.title} className="footer__col" open>
            <summary>{c.title}<Icon name="plus" size={14} /></summary>
            <ul>{c.links.map((l) => <li key={l.label}>{l.href ? <a href={l.href}>{l.label}</a> : <button className="link" onClick={l.on}>{l.label}</button>}</li>)}</ul>
          </details>
        ))}
        <details className="footer__col" open>
          <summary>Flagships<Icon name="plus" size={14} /></summary>
          <ul className="footer__cities">
            {CITIES.map((c) => (
              <li key={c.city}><b>{c.city}</b> <span className="mono dim">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: c.tz })}</span><br /><span className="dim">{c.addr}</span></li>
            ))}
          </ul>
        </details>
      </div>
      <div className="footer__bottom wrap">
        <span className="mono">© 2026 Véloura Atelier S.A.S.</span>
        <span className="footer__social"><a href="https://instagram.com" target="_blank" rel="noreferrer">Instagram</a><a href="https://youtube.com" target="_blank" rel="noreferrer">YouTube</a><a href="https://discord.com" target="_blank" rel="noreferrer">Discord</a></span>
        <span className="mono dim">UPI · Visa · Mastercard · RuPay · Amex · COD</span>
      </div>
      <p className="footer__giant" aria-hidden>VÉLOURA</p>
    </footer>
  )
}
