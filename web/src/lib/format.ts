import { useStore } from '../store/useStore'
import { catalog } from './catalog'

const fmt: Record<string, Intl.NumberFormat> = {}
export function money(inr: number, currency = useStore.getState().currency) {
  const rate = catalog.shipping.currencies[currency] ?? 1
  const locale = currency === 'INR' ? 'en-IN' : currency === 'JPY' ? 'ja-JP' : currency === 'EUR' ? 'fr-FR' : 'en-US'
  fmt[currency] ??= new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 })
  return fmt[currency].format(Math.round(inr * rate))
}
/** Hook form so prices re-render when the currency changes. */
export function useMoney() {
  const c = useStore((s) => s.currency)
  return (inr: number) => money(inr, c)
}
