import raw from '../../../shared/catalog.json'

export type Dept = 'men' | 'women' | 'drops'
export type Garment = 'hoodie' | 'tee' | 'cargo' | 'puffer' | 'blazer' | 'corset'
export interface Colorway { name: string; hex: string }
export interface Product {
  id: string; name: string; dept: Dept; garment: Garment; price: number; compareAt: number | null
  colors: Colorway[]; sizes: string[]; stock: Record<string, number>; gsm: number | null; material: string
  fit: string; description: string; badge: string | null; rating: number; reviews: number; tags: string[]
  drop: string | null; image: string; images: string[]
}
export interface SizeRow { size: string; chest: [number, number]; height: [number, number]; shoulder: number }

export const catalog = raw as unknown as {
  products: Product[]
  promos: { code: string; type: 'percent' | 'flat'; value: number; label: string; minSubtotal: number; requiresPrepaid?: boolean }[]
  sizeChart: { unit: string; rows: SizeRow[] }
  shipping: { freeAbove: number; standardFee: number; expressFee: number; codFee: number; exchangeDays: number; currencies: Record<string, number> }
}
export const products = catalog.products
export const byId = (id: string) => products.find((p) => p.id === id)

/** Asset URL relative to the document so it works under any base path. */
export const asset = (p: string) => p.replace(/^\//, '')
/** Product image for a colorway; falls back to the main render. */
export const productImage = (p: Product, colorIndex = 0, view: 'front' | 'back' | 'side' = 'front') => {
  if (view === 'back') return asset(`/renders/${p.id}-back.webp`)
  if (view === 'side') return asset(`/renders/${p.id}-side.webp`)
  return asset(colorIndex > 0 ? `/renders/${p.id}-${colorIndex}.webp` : `/renders/${p.id}.webp`)
}
export const totalStock = (p: Product) => Object.values(p.stock).reduce((a, b) => a + b, 0)
export const isUpcoming = (p: Product) => !!p.drop && new Date(p.drop).getTime() > Date.now()
export const GARMENT_LABEL: Record<Garment, string> = {
  hoodie: 'Hoodies', tee: 'Heavy Tees', cargo: 'Parachute Cargos', puffer: 'Puffers', blazer: 'Blazers', corset: 'Corset Blazers',
}
