import { useEffect, useRef, type ReactNode } from 'react'
import { lockScroll } from '../lib/motion'
import Icon from '../components/Icon'

/** Accessible overlay shell: ESC to close, focus trap, scroll lock, restores focus. */
export default function Shell({ kind, title, eyebrow, onClose, children, footer, wide }: {
  kind: 'drawer' | 'modal' | 'sheet'; title: string; eyebrow?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    lockScroll(true)
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, button:not(.shell__x), a[href]')
    setTimeout(() => first?.focus(), 60)
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null)
        if (!f.length) return
        const a = f[0], z = f[f.length - 1]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    addEventListener('keydown', on)
    return () => { removeEventListener('keydown', on); lockScroll(false); prev?.focus?.() }
  }, [onClose])

  return (
    <div className={`shell shell--${kind}`} role="presentation">
      <div className="shell__scrim" onClick={onClose} />
      <div ref={ref} className={`shell__panel ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} data-lenis-prevent>
        <div className="shell__head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 className="shell__title">{title}</h2>
          </div>
          <button className="shell__x icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /><span className="mono hide-sm">ESC</span></button>
        </div>
        <div className="shell__body">{children}</div>
        {footer && <div className="shell__foot">{footer}</div>}
      </div>
    </div>
  )
}
