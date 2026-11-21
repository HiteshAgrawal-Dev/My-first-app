// Isolated test bench for the virtual try-on module (served by `npx vite` at /tryon-test.html).
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TryOnStudio, type TryOnProduct } from './tryon'

const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const PRODUCTS: TryOnProduct[] = [
  { id: 'vl-m-hoodie-01', name: 'Monolith 500 Hoodie', garment: 'hoodie', price: 7990, fit: 'Boxy', sizes, image: 'renders/vl-m-hoodie-01.png', colors: [{ name: 'Onyx Velour', hex: '#15121a' }, { name: 'Bone', hex: '#e6dccb' }, { name: 'Oxblood', hex: '#5c1428' }] },
  { id: 'vl-m-tee-01', name: 'Kinetic Heavy Tee', garment: 'tee', price: 3490, fit: 'Boxy', sizes, image: 'renders/vl-m-tee-01.png', colors: [{ name: 'Bone', hex: '#e6dccb' }, { name: 'Onyx Velour', hex: '#15121a' }, { name: 'Tokyo Steel', hex: '#7d8796' }] },
  { id: 'vl-m-cargo-01', name: 'Parachute Cargo 02', garment: 'cargo', price: 6490, fit: 'Relaxed', sizes, image: 'renders/vl-m-cargo-01.png', colors: [{ name: 'Tokyo Steel', hex: '#7d8796' }, { name: 'Onyx Velour', hex: '#15121a' }, { name: 'Kyoto Moss', hex: '#4b5640' }] },
  { id: 'vl-m-puffer-01', name: 'Puffer', garment: 'puffer', price: 15990, fit: 'Oversized', sizes, image: 'renders/vl-m-puffer-01.png', colors: [{ name: 'Oxblood', hex: '#5c1428' }, { name: 'Bone', hex: '#e6dccb' }] },
  { id: 'vl-m-blazer-01', name: 'Blazer', garment: 'blazer', price: 13490, fit: 'Relaxed', sizes, image: 'renders/vl-m-blazer-01.png', colors: [{ name: 'Onyx Velour', hex: '#15121a' }, { name: 'Tokyo Steel', hex: '#7d8796' }] },
  { id: 'vl-w-corset-01', name: 'Corset', garment: 'corset', price: 12990, fit: 'Sculpted', sizes, image: 'renders/vl-w-corset-01.png', colors: [{ name: 'Oxblood', hex: '#5c1428' }, { name: 'Bone', hex: '#e6dccb' }] },
]

// Test instrumentation: remember every camera stream so tests can assert tracks are stopped.
const w = window as unknown as { __vtStreams: MediaStream[]; __vtBag: unknown[] }
w.__vtStreams = []
w.__vtBag = []
if (navigator.mediaDevices?.getUserMedia) {
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getUserMedia = async (c) => {
    const s = await orig(c)
    w.__vtStreams.push(s)
    return s
  }
}

function Bench() {
  const params = new URLSearchParams(location.search)
  const start = PRODUCTS.find((p) => p.id === params.get('p')) ?? PRODUCTS[0]
  const [open, setOpen] = useState(true)
  return open ? (
    <TryOnStudio
      product={start}
      products={PRODUCTS}
      colorIndex={Number(params.get('c') ?? 0)}
      heightCm={178}
      onAddToBag={(p) => w.__vtBag.push(p)}
      onClose={() => setOpen(false)}
    />
  ) : (
    <button id="reopen" onClick={() => setOpen(true)} style={{ margin: 40 }}>Reopen try-on</button>
  )
}

createRoot(document.getElementById('root')!).render(<Bench />)
