// Shared Playwright helpers for the VÉLOURA render pipeline.
import { createRequire } from 'node:module'
import { spawn, execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
export const { chromium } = require('playwright')
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const WEB = path.join(ROOT, 'web')
export const BASE = process.env.RENDER_BASE ?? 'http://localhost:5180'

// SwiftShader (CPU) WebGL2 works headless with these flags; real GPUs are picked up automatically.
export const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']

export async function ensureServer() {
  try {
    const r = await fetch(BASE + '/render.html')
    if (r.ok) return null
  } catch {}
  const port = new URL(BASE).port || '5180'
  const child = spawn('npx', ['vite', '--port', port, '--strictPort'], { cwd: WEB, stdio: 'ignore', detached: true })
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const r = await fetch(BASE + '/render.html')
      if (r.ok) return child
    } catch {}
  }
  throw new Error('vite did not start')
}

export async function launch() {
  return chromium.launch({ args: GL_ARGS })
}

export async function openPage(browser, url, { width, height, scale = 1, timeout = 180000 }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()) })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__READY === true, null, { timeout, polling: 200 })
  return page
}

/** Downscale (supersampled) PNG → target PNG and/or WebP using ffmpeg. */
export function ffmpegConvert(input, output, { w, h, quality = 88, lossless = false } = {}) {
  const vf = w && h ? ['-vf', `scale=${w}:${h}:flags=lanczos`] : []
  const ext = path.extname(output)
  const codec = ext === '.webp'
    ? ['-c:v', 'libwebp', ...(lossless ? ['-lossless', '1'] : ['-quality', String(quality)]), '-compression_level', '6']
    : ['-pix_fmt', 'rgba']
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, ...vf, ...codec, output])
}

export function sizeOf(f) {
  try { return fs.statSync(f).size } catch { return 0 }
}
