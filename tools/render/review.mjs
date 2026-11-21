// Review helper: renders front/back/side for a query and tiles them into one image.
// node tools/render/review.mjs "mode=debug&type=hoodie&color=%23e6dccb" out.png [scale]
import { launch, openPage, BASE, ensureServer } from './lib.mjs'
import { execFileSync } from 'node:child_process'
const [query, out, scale = '1'] = process.argv.slice(2)
await ensureServer()
const b = await launch()
const files = []
for (const view of ['front', 'back', 'side']) {
  const page = await openPage(b, `${BASE}/render.html?${query}&view=${view}`, { width: 600, height: 750, scale: +scale })
  const f = out.replace(/\.png$/, `-${view}.png`)
  await page.screenshot({ path: f, omitBackground: true })
  if (view === 'front') console.log(JSON.stringify(await page.evaluate(() => window.__info)))
  await page.close()
  files.push(f)
}
await b.close()
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `color=c=0xf2efe9:s=${1800 * +scale}x${750 * +scale}[bg];[0][1][2]hstack=3[s];[bg][s]overlay=0:0`, '-frames:v', '1', out])
console.log('ok', out)
