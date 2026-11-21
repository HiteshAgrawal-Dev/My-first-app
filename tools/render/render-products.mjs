// Renders every catalogue product (front / back / side + every colorway) and the six category heroes.
//   node tools/render/render-products.mjs [--only=id1,id2] [--skip-cats] [--cats-only] [--jobs=2]
// Output: web/public/renders/{id}.png|webp, {id}-back.*, {id}-side.*, {id}-{ci}.webp, cat-{garment}.webp
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { launch, openPage, BASE, ensureServer, ffmpegConvert, ROOT, sizeOf } from './lib.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const OUT = path.join(ROOT, 'web/public/renders')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'veloura-renders-'))
fs.mkdirSync(OUT, { recursive: true })
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/catalog.json'), 'utf8'))
let products = catalog.products
if (args.only) products = products.filter((p) => String(args.only).split(',').includes(p.id))

const W = 1000, H = 1250, SS = 2
const jobs = []
if (!args['cats-only']) {
  for (const p of products) {
    for (const view of ['front', 'back', 'side']) {
      const suffix = view === 'front' ? '' : `-${view}`
      jobs.push({ q: `mode=product&id=${p.id}&view=${view}&c=0`, w: W, h: H, outs: [`${p.id}${suffix}.png`, `${p.id}${suffix}.webp`, ...(view === 'front' ? [`${p.id}-0.webp`] : [])] })
    }
    p.colors.forEach((_, ci) => {
      if (ci === 0) return
      jobs.push({ q: `mode=product&id=${p.id}&view=front&c=${ci}`, w: W, h: H, outs: [`${p.id}-${ci}.webp`] })
    })
  }
}
if (!args['skip-cats'] && !args.only) {
  for (const g of ['hoodie', 'tee', 'cargo', 'puffer', 'blazer', 'corset']) {
    const pick = { hoodie: 'vl-d-hoodie-01', tee: 'vl-m-tee-01', cargo: 'vl-m-cargo-01', puffer: 'vl-d-puffer-01', blazer: 'vl-w-blazer-01', corset: 'vl-d-corset-01' }[g]
    jobs.push({ q: `mode=category&garment=${g}&id=${pick}`, w: 1600, h: 1000, outs: [`cat-${g}.webp`], opaque: true })
  }
}

// --fresh-since=<epoch ms>: skip jobs whose outputs were all written after that time (resume a run)
if (args['fresh-since']) {
  const since = Number(args['fresh-since'])
  const keep = jobs.filter((j) => !j.outs.every((o) => { try { return fs.statSync(path.join(OUT, o)).mtimeMs > since } catch { return false } }))
  jobs.length = 0
  jobs.push(...keep)
}
await ensureServer()
const nJobs = Number(args.jobs ?? 2)
console.log(`${jobs.length} renders, ${nJobs} parallel`)
const t0 = Date.now()
let done = 0
async function worker() {
  let browser = await launch()
  while (jobs.length) {
    const j = jobs.shift()
    const raw = path.join(TMP, `${Math.random().toString(36).slice(2)}.png`)
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const page = await openPage(browser, `${BASE}/render.html?${j.q}`, { width: j.w, height: j.h, scale: SS, timeout: 240000 })
        await page.screenshot({ path: raw, omitBackground: !j.opaque, timeout: 120000 })
        await page.close()
        break
      } catch (e) {
        console.error('retry', j.q, String(e.message).split('\n')[0])
        try { await browser.close() } catch {}
        browser = await launch()
      }
    }
    if (!fs.existsSync(raw)) { console.error('FAILED', j.q); continue }
    for (const o of j.outs) {
      const dst = path.join(OUT, o)
      if (o.endsWith('.png')) ffmpegConvert(raw, dst, { w: j.w, h: j.h })
      else ffmpegConvert(raw, dst, { w: j.w, h: j.h, quality: o.startsWith('cat-') ? 86 : 88 })
    }
    fs.rmSync(raw, { force: true })
    done++
    console.log(`[${done}] ${j.outs.join(', ')}  ${(sizeOf(path.join(OUT, j.outs[0])) / 1024).toFixed(0)}KB  ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  }
  await browser.close()
}
await Promise.all(Array.from({ length: nJobs }, worker))
fs.rmSync(TMP, { recursive: true, force: true })
console.log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's')
