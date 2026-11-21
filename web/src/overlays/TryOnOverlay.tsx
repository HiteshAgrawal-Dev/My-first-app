import { useEffect } from 'react'
import { TryOnStudio } from '../tryon'
import { byId, products } from '../lib/catalog'
import { lockScroll } from '../lib/motion'
import { useStore } from '../store/useStore'

export default function TryOnOverlay() {
  const { close, overlayData, add, toast, user, open } = useStore()
  const p = byId(overlayData?.productId ?? 'vl-m-hoodie-01') ?? products[0]
  useEffect(() => { lockScroll(true); return () => lockScroll(false) }, [])
  const list = products.filter((x) => x.dept !== 'drops').map((x) => ({ ...x, image: `renders/${x.id}.png` }))
  return (
    <TryOnStudio
      product={{ ...p, image: `renders/${p.id}.png` }}
      products={list}
      colorIndex={overlayData?.colorIndex ?? 0}
      heightCm={user?.heightCm}
      onAddToBag={({ productId, size, colorIndex }) => { add({ id: productId, size, colorIndex }); toast(`${byId(productId)?.name} · ${size} added to bag`); open('bag') }}
      onClose={close}
    />
  )
}
