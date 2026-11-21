import { useEffect, useState } from 'react'

/** Image with graceful fallback: webp → png → tinted fabric swatch, never a broken icon. */
export default function Img({ src, alt, className, priority, tint = '#3a1f3d' }: { src: string; alt: string; className?: string; priority?: boolean; tint?: string }) {
  const [cur, setCur] = useState(src)
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading')
  useEffect(() => { setCur(src); setState('loading') }, [src])
  const onError = () => {
    const png = src.replace(/\.webp$/, '.png')
    if (cur !== png && src.endsWith('.webp')) setCur(png); else setState('err')
  }
  return (
    <span className={`img ${className ?? ''} is-${state}`} style={{ ['--tint' as any]: tint }}>
      {state !== 'err' && <img src={cur} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" onLoad={() => setState('ok')} onError={onError} />}
    </span>
  )
}
