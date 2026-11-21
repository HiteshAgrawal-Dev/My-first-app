/**
 * Procedural placeholder garments (1000×1250, transparent background, front view).
 * Used when a product render is missing or fails to load, so the try-on never shows a hole.
 * Drawn in a neutral shaded grey so colourway tinting reads naturally.
 */

type Ctx = CanvasRenderingContext2D

const W = 1000
const H = 1250

function shade(ctx: Ctx, x0: number, x1: number) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0)
  g.addColorStop(0, '#8f897f')
  g.addColorStop(0.18, '#b9b2a7')
  g.addColorStop(0.5, '#cdc6bb')
  g.addColorStop(0.82, '#b6afa4')
  g.addColorStop(1, '#8a847a')
  return g
}

function folds(ctx: Ctx, lines: [number, number, number, number, number, number][], dark = true) {
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.strokeStyle = dark ? 'rgba(40,34,30,0.22)' : 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 14
  ctx.filter = 'blur(6px)'
  ctx.lineCap = 'round'
  for (const [ax, ay, cx, cy, bx, by] of lines) {
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.quadraticCurveTo(cx, cy, bx, by)
    ctx.stroke()
  }
  ctx.restore()
}

function seam(ctx: Ctx, pts: [number, number][], w = 3, a = 0.3) {
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.strokeStyle = `rgba(30,26,24,${a})`
  ctx.lineWidth = w
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.stroke()
  ctx.restore()
}

function drawTop(ctx: Ctx, garment: string) {
  const short = garment === 'tee'
  const puffer = garment === 'puffer'
  const blazer = garment === 'blazer'
  const hood = garment === 'hoodie'
  const bulk = puffer ? 40 : 0
  const sl = 300 - bulk, // shoulder left
    sr = 700 + bulk
  const top = 250
  const hem = blazer ? 990 : puffer ? 880 : 930
  const bodyL = 318 - bulk,
    bodyR = 682 + bulk

  // Sleeves first
  ctx.fillStyle = shade(ctx, 120, 880)
  const sleeve = (side: 1 | -1) => {
    const sx = side < 0 ? sl : sr
    ctx.beginPath()
    if (short) {
      ctx.moveTo(sx + side * -20, top + 10)
      ctx.lineTo(sx + side * 150, top + 150)
      ctx.lineTo(sx + side * 95, top + 255)
      ctx.lineTo(sx + side * -5, top + 205)
    } else {
      ctx.moveTo(sx + side * -25, top + 8)
      ctx.quadraticCurveTo(sx + side * 95, top + 60, sx + side * 165, top + 560)
      ctx.lineTo(sx + side * (puffer ? 70 : 82), top + 585)
      ctx.quadraticCurveTo(sx + side * 40, top + 330, sx + side * 2, top + 225)
    }
    ctx.closePath()
    ctx.fill()
    if (!short) {
      // ribbed cuff
      ctx.save()
      ctx.globalCompositeOperation = 'source-atop'
      ctx.fillStyle = 'rgba(30,26,24,0.18)'
      ctx.fillRect(Math.min(sx + side * 60, sx + side * 175), top + 520, 120, 80)
      ctx.restore()
    }
  }
  sleeve(-1)
  sleeve(1)

  // Body
  ctx.fillStyle = shade(ctx, bodyL - 20, bodyR + 20)
  ctx.beginPath()
  ctx.moveTo(430, top - 10)
  ctx.quadraticCurveTo(500, top + (short ? 40 : 30), 570, top - 10)
  ctx.lineTo(sr - 10, top + 8)
  ctx.quadraticCurveTo(sr + 18, top + 30, sr, top + 230)
  ctx.lineTo(bodyR + (blazer ? 10 : 0), hem)
  ctx.quadraticCurveTo(500, hem + 14, bodyL - (blazer ? 10 : 0), hem)
  ctx.lineTo(sl, top + 230)
  ctx.quadraticCurveTo(sl - 18, top + 30, sl + 10, top + 8)
  ctx.closePath()
  ctx.fill()

  if (hood) {
    ctx.fillStyle = shade(ctx, 360, 640)
    ctx.beginPath()
    ctx.moveTo(400, top + 10)
    ctx.bezierCurveTo(330, 120, 400, 70, 500, 70)
    ctx.bezierCurveTo(600, 70, 670, 120, 600, top + 10)
    ctx.quadraticCurveTo(500, top + 70, 400, top + 10)
    ctx.fill()
    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = 'rgba(25,22,20,0.55)'
    ctx.beginPath()
    ctx.ellipse(500, 175, 62, 80, 0, 0, Math.PI * 2)
    ctx.filter = 'blur(10px)'
    ctx.fill()
    ctx.restore()
    // drawcords
    seam(ctx, [[475, top + 40], [470, top + 190]], 6, 0.35)
    seam(ctx, [[525, top + 40], [530, top + 190]], 6, 0.35)
    // kangaroo pocket
    seam(ctx, [[390, 820], [420, 640], [580, 640], [610, 820]], 3, 0.28)
  }
  if (short) {
    seam(ctx, [[440, top - 2], [500, top + 34], [560, top - 2]], 10, 0.25)
  }
  if (puffer) {
    for (let y = top + 90; y < hem; y += 105) {
      seam(ctx, [[bodyL - 30, y], [500, y + 8], [bodyR + 30, y]], 5, 0.32)
      folds(ctx, [[bodyL, y + 45, 500, y + 30, bodyR, y + 45]], false)
    }
    seam(ctx, [[500, top + 20], [500, hem]], 4, 0.4)
    seam(ctx, [[440, top - 10], [430, top - 70], [570, top - 70], [560, top - 10]], 8, 0.25)
  }
  if (blazer) {
    seam(ctx, [[440, top - 5], [500, 560], [560, top - 5]], 5, 0.4)
    seam(ctx, [[440, top - 5], [395, 380], [470, 470]], 4, 0.32)
    seam(ctx, [[560, top - 5], [605, 380], [530, 470]], 4, 0.32)
    seam(ctx, [[500, 560], [500, hem]], 3, 0.3)
    for (const y of [640, 760]) {
      ctx.save()
      ctx.globalCompositeOperation = 'source-atop'
      ctx.fillStyle = 'rgba(20,18,16,0.6)'
      ctx.beginPath()
      ctx.arc(512, y, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  folds(ctx, [
    [380, 420, 410, 650, 390, 880],
    [620, 420, 590, 650, 610, 880],
    [450, 700, 500, 760, 560, 700],
  ])
  folds(ctx, [[470, 330, 500, 560, 480, 860]], false)
}

function drawCorset(ctx: Ctx) {
  ctx.fillStyle = shade(ctx, 280, 720)
  ctx.beginPath()
  ctx.moveTo(300, 300)
  ctx.quadraticCurveTo(400, 250, 500, 290)
  ctx.quadraticCurveTo(600, 250, 700, 300)
  ctx.quadraticCurveTo(640, 560, 690, 860)
  ctx.quadraticCurveTo(500, 900, 310, 860)
  ctx.quadraticCurveTo(360, 560, 300, 300)
  ctx.fill()
  for (const x of [370, 430, 500, 570, 630]) seam(ctx, [[x, 290], [x + (x - 500) * -0.12, 580], [x, 870]], 4, 0.3)
  folds(ctx, [[400, 330, 450, 600, 400, 840]], false)
}

function drawCargo(ctx: Ctx) {
  ctx.fillStyle = shade(ctx, 250, 750)
  ctx.beginPath()
  ctx.moveTo(340, 60)
  ctx.lineTo(660, 60)
  ctx.quadraticCurveTo(700, 300, 720, 650)
  ctx.lineTo(745, 1170)
  ctx.lineTo(545, 1180)
  ctx.lineTo(510, 520)
  ctx.lineTo(490, 520)
  ctx.lineTo(455, 1180)
  ctx.lineTo(255, 1170)
  ctx.lineTo(280, 650)
  ctx.quadraticCurveTo(300, 300, 340, 60)
  ctx.fill()
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = 'rgba(30,26,24,0.2)'
  ctx.fillRect(330, 60, 340, 55)
  ctx.restore()
  seam(ctx, [[262, 560], [262, 760], [365, 770], [370, 560]], 4, 0.32)
  seam(ctx, [[738, 560], [738, 760], [635, 770], [630, 560]], 4, 0.32)
  folds(ctx, [
    [330, 800, 380, 880, 440, 820],
    [560, 820, 620, 880, 680, 800],
    [300, 1000, 360, 1060, 440, 1010],
    [560, 1010, 640, 1060, 700, 1000],
  ])
}

export function drawPlaceholderGarment(garment: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const g = garment.toLowerCase()
  if (g === 'cargo') drawCargo(ctx)
  else if (g === 'corset') drawCorset(ctx)
  else drawTop(ctx, g)
  return c
}
