import * as THREE from 'three';
import { mergeColored, mat } from './util.js';
import { blobShadowTexture } from './textures.js';

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const PALETTES = {
  rangers: {
    uniform: 0x50633a, uniformDark: 0x41522f, vest: 0x36412b, pouch: 0x2e3523,
    headgear: 0x39472c, band: 0x86ff6e, skin: 0xb08a62, boots: 0x26221a,
    gun: 0x272923, gunWood: 0x744624, pack: 0x35402a
  },
  militia: {
    uniform: 0x6e5638, uniformDark: 0x5a462c, vest: 0x3c3026, pouch: 0x2d251d,
    headgear: 0x2f2118, band: 0xe8401f, skin: 0xa87a54, boots: 0x211d18,
    gun: 0x23251e, gunWood: 0x663d1e, pack: 0x38302a
  }
};

const geoCache = {};
const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const blobMat = new THREE.MeshBasicMaterial({
  map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.65
});

function buildBodyGeo(pal) {
  const P = [];
  const add = (g, c, x, y, z, rx = 0, ry = 0, rz = 0) => P.push({ g, c, m: mat(x, y, z, rx, ry, rz) });

  add(B(0.4, 0.52, 0.24), pal.uniform, 0, 1.16, 0);
  add(B(0.34, 0.16, 0.24), pal.uniformDark, 0, 0.88, 0);
  add(B(0.3, 0.36, 0.13), pal.pack, 0, 1.24, -0.18);
  add(B(0.44, 0.32, 0.3), pal.vest, 0, 1.23, 0);
  add(B(0.46, 0.07, 0.32), pal.pouch, 0, 1.04, 0);
  add(B(0.1, 0.12, 0.05), pal.pouch, -0.11, 1.14, 0.165);
  add(B(0.1, 0.12, 0.05), pal.pouch, 0.11, 1.14, 0.165);

  add(B(0.19, 0.2, 0.19), pal.skin, 0, 1.585, 0);
  const helmet = new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58);
  add(helmet, pal.headgear, 0, 1.68, 0);
  add(B(0.235, 0.03, 0.235), pal.headgear, 0, 1.655, 0.01);
  add(B(0.18, 0.045, 0.02), 0x14120e, 0, 1.6, 0.105);

  const RX = 0.17;
  add(B(0.055, 0.07, 0.44), pal.gun, RX, 1.315, 0.2);
  const cover = new THREE.CylinderGeometry(0.027, 0.027, 0.43, 8);
  cover.rotateX(Math.PI / 2);
  add(cover, pal.gun, RX, 1.357, 0.2);
  const barrel = new THREE.CylinderGeometry(0.012, 0.012, 0.38, 6);
  barrel.rotateX(Math.PI / 2);
  add(barrel, pal.gun, RX, 1.335, 0.6);
  const gasTube = new THREE.CylinderGeometry(0.009, 0.009, 0.2, 6);
  gasTube.rotateX(Math.PI / 2);
  add(gasTube, pal.gun, RX, 1.372, 0.48);
  add(B(0.018, 0.05, 0.02), pal.gun, RX, 1.38, 0.74);
  add(B(0.007, 0.03, 0.007), pal.gun, RX, 1.41, 0.74);
  const brake = new THREE.CylinderGeometry(0.015, 0.013, 0.045, 6);
  brake.rotateX(Math.PI / 2);
  add(brake, pal.gun, RX, 1.335, 0.805);
  add(B(0.05, 0.05, 0.2), pal.gunWood, RX, 1.298, 0.44);
  add(B(0.04, 0.024, 0.17), pal.gunWood, RX, 1.348, 0.43);
  add(B(0.042, 0.11, 0.06), pal.gun, RX, 1.235, 0.31, 0.32);
  add(B(0.042, 0.1, 0.055), pal.gun, RX, 1.152, 0.35, 0.62);
  add(B(0.035, 0.09, 0.048), pal.gunWood, RX, 1.245, 0.06, -0.28);
  add(B(0.045, 0.075, 0.24), pal.gunWood, RX, 1.295, -0.03);
  add(B(0.05, 0.09, 0.02), pal.gun, RX, 1.285, -0.155);
  add(B(0.026, 0.02, 0.024), pal.gun, RX, 1.382, 0.05);

  return mergeColored(P);
}

function buildArmGeo(pal, side) {
  const s = side;
  return mergeColored([
    { g: B(0.12, 0.3, 0.13), c: pal.uniform, m: mat(0, -0.15, 0.02) },
    { g: B(0.1, 0.26, 0.11), c: pal.uniformDark, m: mat(0.02 * s, -0.35, 0.11, -0.5, 0, 0) },
    { g: B(0.09, 0.09, 0.1), c: pal.skin, m: mat(0.02 * s, -0.42, 0.21, -0.5, 0, 0) }
  ]);
}

function buildLegGeo(pal) {
  return mergeColored([
    { g: B(0.16, 0.46, 0.18), c: pal.uniform, m: mat(0, -0.23, 0) },
    { g: B(0.14, 0.42, 0.16), c: pal.uniformDark, m: mat(0, -0.65, 0.01) },
    { g: B(0.15, 0.11, 0.28), c: pal.boots, m: mat(0, -0.9, 0.05) }
  ]);
}

function getGeoSet(team) {
  if (geoCache[team]) return geoCache[team];
  const pal = PALETTES[team];
  const set = {
    body: buildBodyGeo(pal),
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
  spr.position.y = 2.12;
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

  const armL = new THREE.Mesh(G.armL, bodyMat);
  armL.position.set(-0.31, 1.44, 0.02);
  armL.castShadow = true;
  body.add(armL);

  const armR = new THREE.Mesh(G.armR, bodyMat);
  armR.position.set(0.31, 1.44, 0.02);
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
  flash.scale.set(0.44, 0.44, 1);
  flash.position.set(0.17, 1.335, 0.85);
  flash.visible = false;
  body.add(flash);

  scene.add(root);
  return {
    root, body, armL, armR, legL, legR, blob, marker, flash,
    muzzleLocal: new THREE.Vector3(0.17, 1.335, 0.84),
    headLocal: new THREE.Vector3(0, 1.58, 0),
    chestLocal: new THREE.Vector3(0, 1.2, 0),
    eyeForward: 1
  };
}
