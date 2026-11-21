import type { GarmentType, GarmentVariant } from './kit'
import type { FabricKind } from './materials'

export interface ProductGarmentSpec {
  type: GarmentType
  variant?: GarmentVariant
  fabric?: FabricKind
  accent?: string
}

/** Per-product construction/fabric tweaks so each catalogue item reads as its own design. */
const OVERRIDES: Record<string, Omit<ProductGarmentSpec, 'type'>> = {
  'vl-m-hoodie-02': { variant: 'zip', fabric: 'terry' },
  'vl-w-hoodie-01': { variant: 'cocoon' },
  'vl-d-hoodie-01': { fabric: 'velour' },
  'vl-w-tee-01': { variant: 'fitted', fabric: 'rib' },
  'vl-w-puffer-01': { variant: 'cropped', fabric: 'satin' },
  'vl-d-puffer-01': { fabric: 'iridescent' },
  'vl-w-blazer-01': { fabric: 'gabardine' },
  'vl-d-corset-01': { fabric: 'silkVelvet' },
  'vl-w-cargo-01': { variant: 'wide' },
  'vl-d-cargo-01': { accent: '#c9ccd2' },
}

/** Map a catalogue product ({ id, garment }) to buildGarment options. */
export function productGarment(p: { id: string; garment: string }): ProductGarmentSpec {
  return { type: p.garment as GarmentType, ...(OVERRIDES[p.id] ?? {}) }
}
