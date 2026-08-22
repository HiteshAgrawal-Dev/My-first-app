import * as THREE from 'three';

const cache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 2;
  return t;
}

function speckle(x, size, count, colors, rMin = 0.5, rMax = 1.6, alpha = 0.5) {
  for (let i = 0; i < count; i++) {
    x.fillStyle = colors[(Math.random() * colors.length) | 0];
    x.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
    const r = rMin + Math.random() * (rMax - rMin);
    x.beginPath();
    x.arc(Math.random() * size, Math.random() * size, r, 0, 7);
    x.fill();
  }
  x.globalAlpha = 1;
}

export function sandTexture() {
  if (cache.has('sand')) return cache.get('sand');
  const S = 512, [c, x] = canvas(S);
  x.fillStyle = '#c9b083'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = `rgba(${150 + Math.random() * 40 | 0},${125 + Math.random() * 30 | 0},${85 + Math.random() * 25 | 0},0.16)`;
    x.lineWidth = 2 + Math.random() * 7;
    x.beginPath();
    const y0 = Math.random() * S;
    x.moveTo(0, y0);
    for (let px = 0; px <= S; px += 32) x.lineTo(px, y0 + Math.sin(px * 0.03 + i) * 9);
    x.stroke();
  }
  speckle(x, S, 2600, ['#d8c49a', '#b89c6c', '#e0d0a8', '#a89060'], 0.4, 1.7, 0.35);
  speckle(x, S, 90, ['#8a784e'], 0.8, 2.4, 0.25);
  const t = finish(c);
  cache.set('sand', t);
  return t;
}

export function rockTexture() {
  if (cache.has('rock')) return cache.get('rock');
  const S = 512, [c, x] = canvas(S);
  x.fillStyle = '#9a8868'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const g = x.createRadialGradient(Math.random() * S, Math.random() * S, 4, Math.random() * S, Math.random() * S, 40 + Math.random() * 90);
    const tone = 110 + Math.random() * 70 | 0;
    g.addColorStop(0, `rgba(${tone},${tone - 12},${tone - 34},0.35)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  x.strokeStyle = 'rgba(50,40,26,0.5)';
  for (let i = 0; i < 22; i++) {
    x.lineWidth = 0.5 + Math.random() * 1.6;
    x.beginPath();
    let px = Math.random() * S, py = Math.random() * S;
    x.moveTo(px, py);
    for (let s = 0; s < 6; s++) { px += (Math.random() - 0.5) * 90; py += (Math.random() - 0.5) * 90; x.lineTo(px, py); }
    x.stroke();
  }
  speckle(x, S, 900, ['#b09a74', '#7a6a4c'], 0.5, 1.8, 0.3);
  const t = finish(c);
  cache.set('rock', t);
  return t;
}

export function adobeTexture() {
  if (cache.has('adobe')) return cache.get('adobe');
  const S = 512, [c, x] = canvas(S);
  x.fillStyle = '#bfa274'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 30; i++) {
    x.strokeStyle = `rgba(${140 + Math.random() * 50 | 0},${115 + Math.random() * 35 | 0},${80 + Math.random() * 25 | 0},0.28)`;
    x.lineWidth = 3 + Math.random() * 10;
    const y = Math.random() * S;
    x.beginPath(); x.moveTo(0, y);
    for (let px = 0; px <= S; px += 48) x.lineTo(px, y + (Math.random() - 0.5) * 14);
    x.stroke();
  }
  for (let i = 0; i < 300; i++) {
    x.fillStyle = Math.random() > 0.5 ? 'rgba(230,210,160,0.10)' : 'rgba(90,70,45,0.10)';
    x.fillRect(Math.random() * S, Math.random() * S, 6 + Math.random() * 30, 1 + Math.random() * 3);
  }
  speckle(x, S, 500, ['#d0b888', '#a08558'], 0.5, 1.5, 0.3);
  const t = finish(c);
  cache.set('adobe', t);
  return t;
}

export function woodTexture() {
  if (cache.has('wood')) return cache.get('wood');
  const S = 256, [c, x] = canvas(S);
  x.fillStyle = '#8a6a42'; x.fillRect(0, 0, S, S);
  const plank = S / 4;
  for (let p = 0; p < 4; p++) {
    x.fillStyle = `rgb(${125 + Math.random() * 30 | 0},${92 + Math.random() * 24 | 0},${52 + Math.random() * 18 | 0})`;
    x.fillRect(p * plank, 0, plank - 2, S);
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(60,40,20,${0.12 + Math.random() * 0.2})`;
      x.lineWidth = 0.6 + Math.random();
      x.beginPath();
      const gx = p * plank + Math.random() * (plank - 4);
      x.moveTo(gx, 0);
      for (let y = 0; y <= S; y += 24) x.lineTo(gx + Math.sin(y * 0.05 + i) * 2.4, y);
      x.stroke();
    }
    if (Math.random() > 0.4) {
      const kx = p * plank + plank * (0.3 + Math.random() * 0.4), ky = Math.random() * S;
      const g = x.createRadialGradient(kx, ky, 1, kx, ky, 6);
      g.addColorStop(0, '#3c2a14'); g.addColorStop(1, 'rgba(60,42,20,0)');
      x.fillStyle = g; x.beginPath(); x.arc(kx, ky, 6, 0, 7); x.fill();
    }
    x.fillStyle = 'rgba(30,20,10,0.55)'; x.fillRect(p * plank + plank - 2, 0, 2, S);
  }
  const t = finish(c);
  cache.set('wood', t);
  return t;
}

export function containerTexture(baseHex, doorSide = false) {
  const key = 'cont' + baseHex + doorSide;
  if (cache.has(key)) return cache.get(key);
  const S = 256, [c, x] = canvas(S);
  x.fillStyle = baseHex; x.fillRect(0, 0, S, S);
  const ridge = S / 8;
  for (let i = 0; i < 8; i++) {
    const gx = i * ridge;
    const g = x.createLinearGradient(gx, 0, gx + ridge, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.34)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.13)');
    g.addColorStop(0.62, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    x.fillStyle = g; x.fillRect(gx, 0, ridge, S);
  }
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(${100 + Math.random() * 60 | 0},${45 + Math.random() * 25 | 0},${18 + Math.random() * 14 | 0},${0.15 + Math.random() * 0.3})`;
    x.beginPath();
    x.ellipse(Math.random() * S, Math.random() * S, 3 + Math.random() * 16, 2 + Math.random() * 8, Math.random() * 3, 0, 7);
    x.fill();
  }
  if (doorSide) {
    x.strokeStyle = 'rgba(20,14,8,0.75)'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.stroke();
    for (const dx of [S / 2 - 14, S / 2 + 14]) {
      x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(dx, 12); x.lineTo(dx, S - 12); x.stroke();
    }
  }
  x.fillStyle = 'rgba(235,225,200,0.5)'; x.font = 'bold 17px Arial';
  x.fillText('MIL-CTR ' + ((Math.random() * 90000 | 0) + 10000), 12, S / 2 - ridge);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function camoTexture(colors) {
  const key = 'camo' + colors.join('');
  if (cache.has(key)) return cache.get(key);
  const S = 256, [c, x] = canvas(S);
  x.fillStyle = colors[0]; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 130; i++) {
    x.fillStyle = colors[1 + ((Math.random() * (colors.length - 1)) | 0)];
    x.globalAlpha = 0.75 + Math.random() * 0.25;
    x.beginPath();
    const cx = Math.random() * S, cy = Math.random() * S;
    x.moveTo(cx, cy);
    for (let a = 0; a < 7; a++) {
      const ang = (a / 7) * Math.PI * 2;
      const r = 6 + Math.random() * 20;
      x.quadraticCurveTo(cx + Math.cos(ang) * r * 1.4, cy + Math.sin(ang) * r * 1.4, cx + Math.cos(ang + 0.5) * r, cy + Math.sin(ang + 0.5) * r);
    }
    x.fill();
  }
  x.globalAlpha = 1;
  speckle(x, S, 400, ['rgba(0,0,0,0.25)', 'rgba(255,255,240,0.14)'], 0.4, 1.4, 0.4);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function gunMetalTexture() {
  if (cache.has('gm')) return cache.get('gm');
  const S = 128, [c, x] = canvas(S);
  x.fillStyle = '#3a3c36'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) {
    x.strokeStyle = `rgba(${190 + Math.random() * 40 | 0},${195 + Math.random() * 40 | 0},${185 + Math.random() * 40 | 0},${Math.random() * 0.09})`;
    x.lineWidth = 0.6;
    const y = Math.random() * S;
    x.beginPath(); x.moveTo(0, y); x.lineTo(S, y + (Math.random() - 0.5) * 3); x.stroke();
  }
  speckle(x, S, 120, ['#22241f', '#4c5046'], 0.4, 1.2, 0.35);
  const t = finish(c);
  cache.set('gm', t);
  return t;
}

export function akWoodTexture() {
  if (cache.has('akw')) return cache.get('akw');
  const S = 128, [c, x] = canvas(S);
  x.fillStyle = '#7a421f'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    x.strokeStyle = `rgba(${40 + Math.random() * 30 | 0},${18 + Math.random() * 14 | 0},${8 + Math.random() * 8 | 0},${0.2 + Math.random() * 0.35})`;
    x.lineWidth = 0.6 + Math.random() * 1.8;
    const y = Math.random() * S;
    x.beginPath(); x.moveTo(0, y);
    for (let px = 0; px <= S; px += 16) x.lineTo(px, y + Math.sin(px * 0.11 + i) * 3);
    x.stroke();
  }
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(255,200,120,0.14)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(40,18,4,0.28)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = finish(c);
  cache.set('akw', t);
  return t;
}

export function sleeveTexture() {
  if (cache.has('slv')) return cache.get('slv');
  const S = 64, [c, x] = canvas(S);
  x.fillStyle = '#6b6248'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 3) {
    x.fillStyle = i % 6 ? 'rgba(255,250,220,0.07)' : 'rgba(30,28,16,0.10)';
    x.fillRect(i, 0, 1.6, S);
    x.fillRect(0, i, S, 1.6);
  }
  const t = finish(c);
  cache.set('slv', t);
  return t;
}

export function gloveTexture() {
  if (cache.has('glv')) return cache.get('glv');
  const S = 64, [c, x] = canvas(S);
  x.fillStyle = '#211f1c'; x.fillRect(0, 0, S, S);
  speckle(x, S, 260, ['#332f2a', '#14120f'], 0.5, 1.6, 0.5);
  const t = finish(c);
  cache.set('glv', t);
  return t;
}

export function radialTexture(stops, size = 64) {
  const [c, x] = canvas(size);
  const g = x.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function flashTexture() {
  if (cache.has('flash')) return cache.get('flash');
  const t = radialTexture([[0, 'rgba(255,252,230,1)'], [0.25, 'rgba(255,214,120,0.95)'], [0.55, 'rgba(255,140,40,0.5)'], [1, 'rgba(255,100,20,0)']], 64);
  cache.set('flash', t);
  return t;
}

export function smokeTexture() {
  if (cache.has('smoke')) return cache.get('smoke');
  const [c, x] = canvas(64);
  for (let i = 0; i < 26; i++) {
    const g = x.createRadialGradient(16 + Math.random() * 32, 16 + Math.random() * 32, 1, 32, 32, 14 + Math.random() * 16);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  cache.set('smoke', t);
  cache.set('smoke', t);
  return t;
}

export function blobShadowTexture() {
  if (cache.has('blob')) return cache.get('blob');
  const t = radialTexture([[0, 'rgba(0,0,0,0.55)'], [0.65, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']], 64);
  cache.set('blob', t);
  return t;
}

export function decalTexture() {
  if (cache.has('decal')) return cache.get('decal');
  const [c, x] = canvas(64);
  x.clearRect(0, 0, 64, 64);
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 26);
  g.addColorStop(0, 'rgba(10,8,6,0.95)');
  g.addColorStop(0.4, 'rgba(20,16,10,0.65)');
  g.addColorStop(0.75, 'rgba(40,32,20,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) {
    x.strokeStyle = 'rgba(15,12,8,0.6)'; x.lineWidth = 1.4;
    const a = Math.random() * 7, l = 10 + Math.random() * 16;
    x.beginPath(); x.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6);
    x.lineTo(32 + Math.cos(a) * l, 32 + Math.sin(a) * l); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  cache.set('decal', t);
  return t;
}
