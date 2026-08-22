import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = THREE.MathUtils.lerp;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => (a + Math.random() * (b - a + 1)) | 0;
export const pick = arr => arr[(Math.random() * arr.length) | 0];

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
}

export function mergeGeometries(parts) {
  let total = 0;
  const geos = parts.map(p => {
    const src = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    if (p.m) src.applyMatrix4(p.m);
    total += src.attributes.position.count;
    return src;
  });
  const P = new Float32Array(total * 3);
  const N = new Float32Array(total * 3);
  const U = new Float32Array(total * 2);
  let off = 0;
  for (const g of geos) {
    P.set(g.attributes.position.array, off * 3);
    if (g.attributes.normal) N.set(g.attributes.normal.array, off * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array, off * 2);
    off += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  return out;
}

export function mergeColored(parts) {
  let total = 0;
  const prepared = parts.map(p => {
    const src = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    if (p.m) src.applyMatrix4(p.m);
    total += src.attributes.position.count;
    return { src, c: p.c || 0xffffff };
  });
  const P = new Float32Array(total * 3);
  const N = new Float32Array(total * 3);
  const C = new Float32Array(total * 3);
  let off = 0;
  for (const { src, c } of prepared) {
    const n = src.attributes.position.count;
    P.set(src.attributes.position.array, off * 3);
    if (src.attributes.normal) N.set(src.attributes.normal.array, off * 3);
    const col = new THREE.Color(c);
    col.convertSRGBToLinear();
    for (let i = 0; i < n; i++) {
      C[(off + i) * 3] = col.r;
      C[(off + i) * 3 + 1] = col.g;
      C[(off + i) * 3 + 2] = col.b;
    }
    off += n;
    src.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}
