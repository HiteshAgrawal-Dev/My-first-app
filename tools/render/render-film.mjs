// Campaign film + scroll sequence renderer (deterministic, frame-by-frame).
//   node tools/render/render-film.mjs [wide] [vertical] [seq] [poster] [--frames=N] [--fps=24] [--test]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { launch, openPage, BASE, ensureServer, ROOT, sizeOf } from './lib.mjs'

const argv = process.argv.slice(2)
const flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true] }))
const what = argv.filter((a) => !a.startsWith('--'))
const OUT = path.join(ROOT, 'web/public/film')
fs.mkdirSync(path.join(OUT, 'seq'), { recursive: true })
const DURATION = 12
const FPS = Number(flags.fps ?? 24)
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' })

await ensureServer()
const browser = await launch()

async function frames(query, w, h, n, timeOf, dir, ext = 'jpg') {
  fs.mkdirSync(dir, { recursive: true })
  const page = await openPage(browser, `${BASE}/render.html?${query}`, { width: w, height: h, scale: 1, timeout: 300000 })
  const t0 = Date.now()
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.__frame(t), timeOf(i))
    const file = path.join(dir, `f${String(i).padStart(4, '0')}.${ext}`)
    await page.screenshot({ path: file, type: ext === 'jpg' ? 'jpeg' : 'png', quality: ext === 'jpg' ? 95 : undefined })
    if (i % 24 === 0) console.log(`${query} ${i}/${n}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)}s/frame`)
  }
  await page.close()
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'veloura-film-'))
const N = Number(flags.frames ?? DURATION * FPS)
// subtle vignette + filmic grain at encode time
const grade = 'vignette=angle=PI/4.6,noise=alls=5:allf=t,format=yuv420p'

if (what.includes('wide') || what.includes('poster')) {
  const dir = path.join(tmp, 'wide')
  if (what.includes('wide')) {
    await frames('mode=film&aspect=wide', 1600, 900, N, (i) => (i / N) * DURATION, dir)
    ff('-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-vf', grade, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(OUT, 'campaign.mp4'))
    ff('-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-vf', grade, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', path.join(OUT, 'campaign.webm'))
  }
  // poster from a hand-picked moment
  const pdir = path.join(tmp, 'poster')
  await frames('mode=film&aspect=wide', 1600, 900, 1, () => Number(flags.posterT ?? 1.6), pdir, 'png')
  ff('-i', path.join(pdir, 'f0000.png'), '-vf', 'vignette=angle=PI/4.6', '-c:v', 'libwebp', '-quality', '86', path.join(OUT, 'campaign-poster.webp'))
}

if (what.includes('vertical')) {
  const dir = path.join(tmp, 'vertical')
  await frames('mode=film&aspect=vertical', 720, 1280, N, (i) => (i / N) * DURATION, dir)
  ff('-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-vf', grade, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(OUT, 'campaign-vertical.mp4'))
}

if (what.includes('seq')) {
  const dir = path.join(tmp, 'seq')
  const n = 90
  await frames('mode=seq', 1200, 900, n, (i) => i / n, dir, 'png')
  for (let i = 0; i < n; i++) {
    ff('-i', path.join(dir, `f${String(i).padStart(4, '0')}.png`), '-c:v', 'libwebp', '-quality', '80', path.join(OUT, 'seq', `frame-${String(i).padStart(3, '0')}.webp`))
  }
}

await browser.close()
fs.rmSync(tmp, { recursive: true, force: true })
for (const f of ['campaign.mp4', 'campaign.webm', 'campaign-vertical.mp4', 'campaign-poster.webp']) {
  const s = sizeOf(path.join(OUT, f))
  if (s) console.log(f, (s / 1024 / 1024).toFixed(2), 'MB')
}
