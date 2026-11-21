// Quick single capture: node tools/render/shot.mjs "<query>" out.png [w] [h] [scale]
import { launch, openPage, BASE, ensureServer } from './lib.mjs'
const [query, out, w = '1000', h = '1250', scale = '1'] = process.argv.slice(2)
await ensureServer()
const b = await launch()
const t0 = Date.now()
const page = await openPage(b, `${BASE}/render.html?${query}`, { width: +w, height: +h, scale: +scale })
const info = await page.evaluate(() => window.__info)
await page.screenshot({ path: out, omitBackground: true })
console.log('ok', out, Date.now() - t0, 'ms', JSON.stringify(info))
await b.close()
