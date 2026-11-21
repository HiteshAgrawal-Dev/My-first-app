import { useStore } from '../store/useStore'
import Icon from './Icon'
export default function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast--${t.tone}`}><Icon name={t.tone === 'warn' ? 'bell' : 'check'} size={16} />{t.text}</div>)}
    </div>
  )
}
