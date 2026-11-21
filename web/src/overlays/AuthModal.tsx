import { useState } from 'react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import Shell from './Shell'

export default function AuthModal() {
  const { close, setUser, user, toast, wishlist, bag } = useStore()
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [f, setF] = useState({ name: '', email: '', password: '', heightCm: '175', drape: 'true' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  if (user) return (
    <Shell kind="modal" eyebrow="Atelier membership" title={`Bonjour, ${user.name.split(' ')[0]}`} onClose={close}>
      <div className="profile">
        <dl className="kv">
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Saved height</dt><dd>{user.heightCm ? `${user.heightCm} cm` : 'Not set'}</dd></div>
          <div><dt>Preferred drape</dt><dd>{({ true: 'As designed', snug: 'Closer', relaxed: 'Roomier' } as Record<string, string>)[user.drape ?? ''] ?? 'Not set'}</dd></div>
          <div><dt>Wishlist</dt><dd>{wishlist.length} pieces</dd></div>
          <div><dt>In bag</dt><dd>{bag.length} pieces</dd></div>
        </dl>
        <div className="row-gap">
          <a className="btn btn--ghost" href="#track" onClick={close}>Track an order</a>
          <a className="btn btn--ghost" href="#wishlist" onClick={close}>Open wishlist</a>
          <button className="btn btn--ghost" onClick={() => { setUser(null); toast('Signed out'); close() }}>Sign out</button>
        </div>
      </div>
    </Shell>
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const r = mode === 'up'
        ? await api.register({ name: f.name.trim(), email: f.email.trim(), password: f.password, heightCm: Number(f.heightCm) || undefined, drape: f.drape })
        : await api.login(f.email.trim(), f.password)
      setUser({ ...r.user, heightCm: r.user.heightCm ?? undefined, drape: r.user.drape ?? undefined, token: r.token })
      toast(mode === 'up' ? 'Welcome to the atelier. Your fit profile is saved.' : 'Signed in')
      close()
    } catch (x: any) { setErr(x.message) } finally { setBusy(false) }
  }

  return (
    <Shell kind="modal" eyebrow="Atelier membership" title={mode === 'up' ? 'Create your atelier account' : 'Sign in to Véloura'} onClose={close}>
      <p className="dim">Save your fit profile once and every size recommendation, try-on and order uses it.</p>
      <ul className="perks mono">
        <li>Member pricing on drops</li><li>Early access, 24h before launch</li><li>Live order tracking</li>
      </ul>
      <div className="seg" role="tablist" aria-label="Account">
        <button role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'is-on' : ''} onClick={() => setMode('up')}>New client</button>
        <button role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'is-on' : ''} onClick={() => setMode('in')}>I have an account</button>
      </div>
      <form className="form" onSubmit={submit} noValidate>
        {mode === 'up' && <label className="field"><span>Full name</span><input id="auth-name" required value={f.name} onChange={set('name')} placeholder="Aarav Mehta" autoComplete="name" /></label>}
        <label className="field"><span>Email address</span><input id="auth-email" type="email" required value={f.email} onChange={set('email')} placeholder="aarav@example.com" autoComplete="email" /></label>
        <label className="field"><span>Password</span><input id="auth-pass" type="password" required minLength={8} value={f.password} onChange={set('password')} placeholder="At least 8 characters" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} /></label>
        {mode === 'up' && (
          <div className="form__2">
            <label className="field"><span>Your height (cm)</span><input id="auth-height" type="number" min={140} max={210} value={f.heightCm} onChange={set('heightCm')} /></label>
            <label className="field"><span>Preferred drape</span>
              <select id="auth-drape" value={f.drape} onChange={set('drape')}><option value="true">As designed (boxy street)</option><option value="snug">Closer & sculpted</option><option value="relaxed">Roomier, to layer</option></select>
            </label>
          </div>
        )}
        {err && <p className="note note--warn" role="alert">{err}</p>}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'One moment…' : mode === 'up' ? 'Create account' : 'Sign in'}</button>
        <p className="fineprint">Your height and fit preferences are used only for size recommendations. Delete them anytime from your profile.</p>
      </form>
    </Shell>
  )
}
