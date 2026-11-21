export interface TryOnProduct {
  id: string
  name: string
  garment: string
  price: number
  fit: string
  colors: { name: string; hex: string }[]
  sizes: string[]
  image: string
}

export interface TryOnStudioProps {
  product: TryOnProduct
  products?: TryOnProduct[]
  colorIndex?: number
  heightCm?: number
  onAddToBag?: (p: { productId: string; size: string; colorIndex: number }) => void
  onClose?: () => void
}

export type StudioMode = 'start' | 'camera' | 'photo' | 'mannequin'
