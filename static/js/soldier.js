import * as THREE from 'three';
import { mergeColored, mat } from './util.js';
import { blobShadowTexture } from './textures.js';

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const PALETTES = {
  rangers: {
    shirt: 0x4e6138, shirtDark: 0x41522e, pants: 0x465832, pantsDark: 0x3a4a29,
    vest: 0x333d26, plate: 0x3e4a2e, pouch: 0x2c341f, belt: 0x272c1d,
    helmet: 0x3a472b, helmetBand: 0x2c3620, nvg: 0x1c1e18,
    pack: 0x39442b, roll: 0x6b6248, radio: 0x22251c,
    skin: 0xb0855c, gloves: 0x8a7454, boots: 0x5a4a34, knee: 0x2e3521,
    gun: 0x26281f, gunWood: 0x000000, gunMetal2: 0x31342a, tacLight: 0x181a14,
    patch: 0x59c24a, strap: 0x2a2f1e
  },
  militia: {
    shirt: 0x77603f, shirtDark: 0x614d33, pants: 0x5c4a32, pantsDark: 0x4c3c28,
    vest: 0x3c2f22, plate: 0x4a3a2a, pouch: 0x302518, belt: 0x2a2118,
    helmet: 0x2e2118, helmetBand: 0xb8351c, nvg: 0x000000,
    pack: 0x000000, roll: 0x6e5b3d, radio: 0x000000,
    skin: 0xa8794f, gloves: 0x000000, boots: 0x241f18, knee: 0x4c3c28,
    gun: 0x22241c, gunWood: 0x6e4322, gunMetal2: 0x2c2e24, tacLight: 0x000000,
    patch: 0xc23a20, strap: 0x33291c
  }
};

const geoCache = {};
const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const blobMat = new THREE.MeshBasicMaterial({
  map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.6
});

function jit(hex) {
  const c = new THREE.Color(hex);
  const j = 0.95 + Math.random() * 0.09;
  c.r = Math.min(1, c.r * j); c.g = Math.min(1, c.g * j); c.b = Math.min(1, c.b * j);
  return c.getHex();
}

function buildBodyGeo(pal) {
  const P = [];
  const add = (g, c, x, y, z, rx = 0, ry = 0, rz = 0) => P.push({ g, c: jit(c), m: mat(x, y, z, rx, ry, rz) });
  const C = (g, hex, x, y, z, rx = 0, ry = 0, rz = 0) => P.push({ g, c: hex, m: mat(x, y, z, rx, ry, rz) });

  add(B(0.36, 0.16, 0.23), pal.pants, 0, 0.9, 0);
  add(B(0.38, 0.05, 0.25), pal.belt, 0, 0.99, 0);
  add(B(0.07, 0.09, 0.04), pal.pouch, -0.1, 0.99, 0.13);
  add(B(0.07, 0.09, 0.04), pal.pouch, 0.1, 0.99, 0.13);

  add(B(0.4, 0.5, 0.24), pal.shirt, 0, 1.17, 0);
  add(B(0.42, 0.06, 0.26), pal.shirtDark, 0, 1.4, 0);

  add(B(0.42, 0.3, 0.28), pal.vest, 0, 1.23, 0);
  add(B(0.3, 0.24, 0.02), pal.plate, 0, 1.25, 0.145);
  add(B(0.3, 0.24, 0.02), pal.plate, 0, 1.25, -0.145);

  add(B(0.09, 0.11, 0.045), pal.pouch, -0.12, 1.1, 0.16);
  add(B(0.09, 0.11, 0.045), pal.pouch, 0, 1.1, 0.16);
  add(B(0.09, 0.11, 0.045), pal.pouch, 0.12, 1.1, 0.16);
  add(B(0.08, 0.12, 0.03), pal.pouch, -0.05, 1.34, 0.15);
  add(B(0.06, 0.09, 0.04), pal.radio, -0.15, 1.31, 0.13);
  const ant = new THREE.CylinderGeometry(0.005, 0.004, 0.2, 4);
  add(ant, pal.radio, -0.15, 1.45, 0.13);
  C(B(0.012, 0.012, 0.012), 0x111111, -0.15, 1.55, 0.13);

  if (pal.pack !== 0x000000) {
    add(B(0.26, 0.34, 0.12), pal.pack, 0, 1.24, -0.2);
    add(B(0.28, 0.05, 0.14), pal.pouch, 0, 1.1, -0.2);
    const roll = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6);
    roll.rotateZ(Math.PI / 2);
    add(roll, pal.roll, 0, 1.43, -0.2);
  } else {
    const roll = new THREE.CylinderGeometry(0.055, 0.055, 0.46, 6);
    roll.rotateZ(Math.PI / 2);
    add(roll, pal.roll, 0, 1.3, -0.19, 0.12, 0, 0.45);
    add(B(0.02, 0.3, 0.02), pal.strap, -0.1, 1.24, -0.155, 0, 0, 0.15);
    add(B(0.02, 0.3, 0.02), pal.strap, 0.1, 1.24, -0.155, 0, 0, -0.15);
  }

  C(B(0.02, 0.07, 0.09), pal.patch, -0.265, 1.4, 0.01);
  add(B(0.36, 0.05, 0.24), pal.shirtDark, 0, 1.44, 0);

  const RX = 0.16;
  add(B(0.05, 0.072, 0.42), pal.gun, RX, 1.318, 0.02);
  const cover = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8);
  cover.rotateX(Math.PI / 2);
  add(cover, pal.gunMetal2, RX, 1.356, 0.02);
  const barrel = new THREE.CylinderGeometry(0.011, 0.011, 0.34, 6);
  barrel.rotateX(Math.PI / 2);
  add(barrel, pal.gun, RX, 1.334, 0.38);
  const gasTube = new THREE.CylinderGeometry(0.008, 0.008, 0.15, 6);
  gasTube.rotateX(Math.PI / 2);
  add(gasTube, pal.gunMetal2, RX, 1.372, 0.42);
  add(B(0.02, 0.034, 0.028), pal.gun, RX, 1.352, 0.52);
  const post = new THREE.CylinderGeometry(0.0028, 0.0028, 0.03, 4);
  add(post, pal.gun, RX, 1.392, 0.52);
  const brake = new THREE.CylinderGeometry(0.0135, 0.0115, 0.05, 6);
  brake.rotateX(Math.PI / 2);
  if (pal.gunWood !== 0x000000) add(brake, pal.gunWood, RX, 1.334, 0.585, 0, 0, 0.35);
  else add(brake, pal.gun, RX, 1.334, 0.585);
  add(B(0.048, 0.046, 0.19), pal.gunWood !== 0x000000 ? pal.gunWood : pal.gunMetal2, RX, 1.298, 0.3);
  add(B(0.036, 0.02, 0.16), pal.gunWood !== 0x000000 ? pal.gunWood : pal.gunMetal2, RX, 1.346, 0.29);
  add(B(0.04, 0.1, 0.055), pal.gun, RX, 1.24, 0.09, 0.3);
  add(B(0.04, 0.092, 0.05), pal.gun, RX, 1.163, 0.125, 0.64);
  add(B(0.032, 0.085, 0.042), pal.gunWood !== 0x000000 ? pal.gunWood : pal.gun, RX, 1.243, -0.1, -0.3);
  add(B(0.042, 0.068, 0.22), pal.gunWood !== 0x000000 ? pal.gunWood : pal.gunMetal2, RX, 1.3, -0.24);
  add(B(0.046, 0.088, 0.018), pal.gun, RX, 1.292, -0.36);
  add(B(0.024, 0.015, 0.02), pal.gun, RX, 1.384, -0.08);
  add(B(0.018, 0.012, 0.028), pal.gunMetal2, RX + 0.031, 1.328, -0.02);
  if (pal.tacLight !== 0x000000) {
    const tl = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6);
    tl.rotateX(Math.PI / 2);
    add(tl, pal.tacLight, RX, 1.29, 0.5);
  }

  return mergeColored(P);
}

function buildHeadGeo(pal) {
  const P = [];
  const add = (g, c, x, y, z, rx = 0, ry = 0, rz = 0) => P.push({ g, c: jit(c), m: mat(x, y, z, rx, ry, rz) });
  const C = (g, hex, x, y, z, rx = 0, ry = 0, rz = 0) => P.push({ g, c: hex, m: mat(x, y, z, rx, ry, rz) });

  const neck = new THREE.CylinderGeometry(0.05, 0.06, 0.07, 6);
  add(neck, pal.skin, 0, 0.03, 0);
  add(B(0.185, 0.195, 0.185), pal.skin, 0, 0.14, 0);
  C(B(0.13, 0.026, 0.012), 0x17140f, 0, 0.155, 0.094);
  add(B(0.16, 0.03, 0.02), pal.shirtDark, 0, 0.055, 0.02);

  if (pal.nvg !== 0x000000) {
    const dome = new THREE.SphereGeometry(0.148, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.56);
    add(dome, pal.helmet, 0, 0.185, 0);
    const brim = new THREE.CylinderGeometry(0.152, 0.152, 0.014, 12);
    add(brim, pal.helmet, 0, 0.168, 0.005);
    add(B(0.2, 0.035, 0.2), pal.helmetBand, 0, 0.152, 0);
    add(B(0.034, 0.05, 0.028), pal.nvg, 0, 0.27, 0.128);
    C(B(0.024, 0.024, 0.014), 0x0a0c0a, 0, 0.262, 0.145);
    add(B(0.014, 0.05, 0.1), pal.helmetBand, -0.148, 0.16, 0);
    add(B(0.014, 0.05, 0.1), pal.helmetBand, 0.148, 0.16, 0);
    C(B(0.05, 0.012, 0.05), 0x101208, -0.1, 0.24, 0.09, 0.3, 0.5, 0);
  } else {
    add(B(0.196, 0.05, 0.196), pal.helmet, 0, 0.215, 0);
    add(B(0.19, 0.045, 0.19), pal.helmetBand, 0, 0.175, 0);
    add(B(0.185, 0.04, 0.185), pal.helmet, 0, 0.135, 0);
    add(B(0.06, 0.05, 0.03), pal.helmetBand, 0.05, 0.19, -0.09, 0, 0, 0.4);
    add(B(0.045, 0.13, 0.022), pal.helmet, 0.075, 0.06, -0.095, 0.15, 0, 0.25);
  }

  return mergeColored(P);
}

function buildArmGeo(pal, side) {
  const s = side;
  return mergeColored([
    { g: B(0.115, 0.28, 0.125), c: jit(pal.shirt), m: mat(0, -0.14, 0.02) },
    { g: B(0.13, 0.04, 0.13), c: jit(pal.vest), m: mat(0, -0.27, 0.02) },
    { g: B(0.098, 0.25, 0.108), c: jit(pal.shirtDark), m: mat(0.018 * s, -0.36, 0.1, -0.55, 0, 0) },
    { g: B(0.088, 0.085, 0.095), c: jit(pal.gloves), m: mat(0.02 * s, -0.44, 0.2, -0.55, 0, 0) }
  ]);
}

function buildLegGeo(pal) {
  return mergeColored([
    { g: B(0.155, 0.44, 0.175), c: jit(pal.pants), m: mat(0, -0.22, 0) },
    { g: B(0.145, 0.085, 0.165), c: jit(pal.knee), m: mat(0, -0.45, 0.008) },
    { g: B(0.135, 0.4, 0.155), c: jit(pal.pantsDark), m: mat(0, -0.64, 0.012) },
    { g: B(0.148, 0.105, 0.27), c: jit(pal.boots), m: mat(0, -0.885, 0.05) },
    { g: B(0.15, 0.03, 0.28), c: 0x14110c, m: mat(0, -0.945, 0.05) }
  ]);
}

function getGeoSet(team) {
  if (geoCache[team]) return geoCache[team];
  const pal = PALETTES[team];
  const set = {
    body: buildBodyGeo(pal),
    head: buildHeadGeo(pal),
    armL: buildArmGeo(pal, -1),
    armR: buildArmGeo(pal, 1),
    leg: buildLegGeo(pal)
  };
  geoCache[team] = set;
  return set;
}

function makeMarker(team, name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const x = c.getContext('2d');
  if (team === 'rangers') {
    const rx = 48, ry = 8, rw = 160, rh = 34, rr = 10;
    x.fillStyle = 'rgba(10,26,8,0.72)';
    x.beginPath();
    x.moveTo(rx + rr, ry);
    x.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
    x.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
    x.arcTo(rx, ry + rh, rx, ry, rr);
    x.arcTo(rx, ry, rx + rw, ry, rr);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(126,224,106,0.9)';
    x.lineWidth = 3;
    x.stroke();
    x.fillStyle = '#a8f096';
    x.font = '900 24px Arial';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(name, 128, 26);
    x.fillStyle = '#7ee06a';
    x.beginPath();
    x.moveTo(118, 50); x.lineTo(138, 50); x.lineTo(128, 66);
    x.closePath(); x.fill();
  } else {
    x.fillStyle = '#ff4a2e';
    x.beginPath();
    x.moveTo(112, 10); x.lineTo(144, 10); x.lineTo(128, 34);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(255,90,60,0.5)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(104, 6); x.lineTo(152, 6); x.lineTo(128, 42);
    x.closePath();
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
    depthTest: team === 'rangers' ? false : true,
    fog: false
  }));
  spr.scale.set(team === 'rangers' ? 1.15 : 0.55, team === 'rangers' ? 0.32 : 0.155, 1);
  spr.position.y = 2.14;
  spr.renderOrder = team === 'rangers' ? 5 : 2;
  return spr;
}

export function buildSoldierV2(team, name, scene) {
  const G = getGeoSet(team);
  const root = new THREE.Group();

  const body = new THREE.Group();
  root.add(body);

  const bodyMesh = new THREE.Mesh(G.body, bodyMat);
  bodyMesh.castShadow = true;
  body.add(bodyMesh);

  const head = new THREE.Mesh(G.head, bodyMat);
  head.position.set(0, 1.46, 0);
  head.castShadow = true;
  body.add(head);

  const armL = new THREE.Mesh(G.armL, bodyMat);
  armL.position.set(-0.3, 1.46, 0.02);
  armL.castShadow = true;
  body.add(armL);

  const armR = new THREE.Mesh(G.armR, bodyMat);
  armR.position.set(0.3, 1.46, 0.02);
  armR.castShadow = true;
  body.add(armR);

  const legL = new THREE.Mesh(G.leg, bodyMat);
  legL.position.set(-0.11, 0.94, 0);
  legL.castShadow = true;
  body.add(legL);

  const legR = new THREE.Mesh(G.leg, bodyMat);
  legR.position.set(0.11, 0.94, 0);
  legR.castShadow = true;
  body.add(legR);

  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.48, 12), blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  blob.renderOrder = 1;
  root.add(blob);

  const marker = makeMarker(team, name);
  root.add(marker);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d');
      const grd = x.createRadialGradient(16, 16, 1, 16, 16, 15);
      grd.addColorStop(0, 'rgba(255,250,220,1)');
      grd.addColorStop(0.5, 'rgba(255,170,60,.8)');
      grd.addColorStop(1, 'rgba(255,110,20,0)');
      x.fillStyle = grd; x.fillRect(0, 0, 32, 32);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })(),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
  }));
  flash.scale.set(0.46, 0.46, 1);
  flash.position.set(0.16, 1.334, 0.64);
  flash.visible = false;
  body.add(flash);

  scene.add(root);
  return {
    root, body, head, armL, armR, legL, legR, blob, marker, flash,
    muzzleLocal: new THREE.Vector3(0.16, 1.334, 0.62),
    headPivotY: 1.46,
    headLocal: new THREE.Vector3(0, 1.6, 0),
    chestLocal: new THREE.Vector3(0, 1.22, 0),
    eyeForward: 1
  };
}
