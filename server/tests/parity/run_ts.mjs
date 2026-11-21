// Runs parity cases through the bundled TypeScript commerce engine.
// Usage: node run_ts.mjs <bundle.mjs> <cases.json>   -> prints a JSON array of outcomes to stdout.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [bundlePath, casesPath] = process.argv.slice(2)
const C = await import(pathToFileURL(bundlePath).href)
const cases = JSON.parse(readFileSync(casesPath, 'utf8'))

function run(c) {
  switch (c.kind) {
    case 'quote':
      return C.quoteCart(c.items, c.promo, c.payment, c.shipping)
    case 'fit':
      return C.recommendFit(c.input)
    case 'delivery':
      return C.checkDelivery(c.pincode)
    case 'search':
      return C.searchProducts(c.q)
    case 'products':
      return C.getProducts(c.query)
    case 'product':
      return C.getProduct(c.id)
    default:
      throw new Error(`unknown case kind ${c.kind}`)
  }
}

const out = cases.map((c) => {
  try {
    return { ok: true, value: run(c) }
  } catch (e) {
    if (e instanceof C.CommerceError) return { ok: false, status: e.status, message: e.message }
    return { ok: false, status: -1, message: String(e && e.stack ? e.stack : e) }
  }
})
process.stdout.write(JSON.stringify(out))
