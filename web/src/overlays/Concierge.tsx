import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useMoney } from '../lib/format'
import { useStore } from '../store/useStore'
import Icon from '../components/Icon'

type Msg = { from: 'bot' | 'me'; text: string; links?: { label: string; href?: string; action?: () => void }[] }

/** On-device concierge: answers the questions that stop people buying, then routes to the right tool. */
export default function Concierge() {
  const { close, open } = useStore()
  const money = useMoney()
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'bot', text: 'Bonjour. I’m the Véloura concierge. Ask me about sizing, delivery, returns, payment or a piece you’re looking for.' }])
  const [q, setQ] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  useEffect(() => { const on = (e: KeyboardEvent) => e.key === 'Escape' && close(); addEventListener('keydown', on); return () => removeEventListener('keydown', on) }, [close])

  const reply = async (text: string) => {
    const t = text.toLowerCase()
    const say = (m: Omit<Msg, 'from'>) => setMsgs((x) => [...x, { from: 'bot', ...m }])
    if (/size|fit|small|large|big|tight|measure/.test(t)) return say({ text: 'Most clients get it right first time with the fit engine: height plus one optional measurement gives a size with a confidence score. Our hoodies are cut boxy, so take your usual size for the intended drape.', links: [{ label: 'Find my size', action: () => open('fit') }, { label: 'Try on with camera', href: '#lab' }] })
    if (/ship|deliver|when|arrive|days|express/.test(t)) return say({ text: `We dispatch within 48 hours. Metros get express in 1–2 days and everywhere else in 3–6. Standard shipping is free over ${money(4999)}. Share your pincode at checkout for an exact date.` })
    if (/return|exchange|refund/.test(t)) return say({ text: 'Exchanges are free for 7 days after delivery and we collect from your door. Refunds go back to your original payment method within 5 working days of pickup. Worn or washed pieces can’t be returned.' })
    if (/pay|upi|cod|cash|emi|card/.test(t)) return say({ text: 'We accept UPI, all major cards, net banking and cash on delivery (+₹99). Prepaid orders get an extra 5% off with PREPAID5, and orders over ₹3,000 can be split into 3 interest-free EMIs.' })
    if (/track|order|where is/.test(t)) return say({ text: 'Your order number starts with VA- and is in your confirmation email.', links: [{ label: 'Track an order', href: '#track' }] })
    if (/fake|original|authentic|quality|gsm|fabric|cotton|worth|price|expensive/.test(t)) return say({ text: 'Every piece is cut in our own ateliers and ships with a numbered authenticity card. Our heavyweights are 500GSM organic loopback cotton, about twice the weight of a typical hoodie, and pre-shrunk so they keep their shape.' })
    if (/store|visit|styl|appointment|paris|tokyo|mumbai/.test(t)) return say({ text: 'Our flagships are on Rue Saint-Honoré in Paris, Shibuya-ku in Tokyo and Kala Ghoda in Mumbai. You can book a private styling session in store or on video.', links: [{ label: 'Book a styling session', action: () => open('info', { page: 'styling' }) }] })
    if (/gift|wrap/.test(t)) return say({ text: 'Every order arrives in our velvet-lined atelier box. Add a handwritten note at checkout and we leave prices off the invoice.' })
    if (/human|agent|call|whatsapp|talk/.test(t)) return say({ text: 'A stylist is available 10am–10pm IST on WhatsApp at +91 22 4890 1100, or email concierge@veloura.in. Most replies arrive within 15 minutes.' })
    const r: any = await api.search(text)
    if (r.results?.length) return say({ text: 'These match what you’re after:', links: r.results.slice(0, 3).map((x: any) => ({ label: `${x.product.name} · ${money(x.product.price)}`, href: `#p-${x.product.id}` })) })
    say({ text: 'I can help with sizing, delivery, returns, payments, stores or finding a piece. Or I can connect you with a stylist.', links: [{ label: 'Talk to a stylist', action: () => reply('human') }] })
  }

  const send = (text: string) => { if (!text.trim()) return; setMsgs((x) => [...x, { from: 'me', text }]); setQ(''); setTimeout(() => reply(text), 350) }

  return (
    <div className="concierge" role="dialog" aria-label="Concierge chat" data-lenis-prevent>
      <div className="concierge__head">
        <div><p className="eyebrow">Concierge · online</p><p className="concierge__title">How can we help?</p></div>
        <button className="icon-btn" onClick={close} aria-label="Close chat"><Icon name="close" /></button>
      </div>
      <div className="concierge__log" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.from}`}>
            <p>{m.text}</p>
            {m.links && <div className="chips">{m.links.map((l) => l.href ? <a key={l.label} className="chip" href={l.href} onClick={close}>{l.label}</a> : <button key={l.label} className="chip" onClick={l.action}>{l.label}</button>)}</div>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="chips concierge__quick">
        {['What size am I?', 'When will it arrive?', 'Returns', 'Cash on delivery?', 'Is it worth the price?'].map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
      </div>
      <form className="concierge__form" onSubmit={(e) => { e.preventDefault(); send(q) }}>
        <label htmlFor="cc-input" className="sr-only">Message</label>
        <input id="cc-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything…" autoComplete="off" />
        <button className="icon-btn" aria-label="Send"><Icon name="arrow" /></button>
      </form>
    </div>
  )
}
