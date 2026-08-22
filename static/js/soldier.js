import * as THREE from 'three';
import { mergeColored, mat } from './util.js';
import { blobShadowTexture } from './textures.js';

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const PALETTES = {
  rangers: {
    uniform: 0x55663f, uniformDark: 0x44522f, vest: 0x39422c, pouch: 0x2f3624,
    headgear: 0x3e4a30, band: 0x7ee06a, skin: 0xb08a62, boots: 0x26221a,
    gun: 0x2a2c26, gunWood: 0x6b4223, strap: 0x3a3428
  },
  militia: {
    uniform: 0x6b543a, uniformDark: 0x57422d, vest: 0x38302a, pouch: 0x2c2620,
    headgear: 0x2e2620, band: 0xd83a22, skin: 0xa87a54, boots: 0x211d18,
    gun: 0x24261f, gunWood: 0x5c3a20, strap: 0x332c22
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

  add(B(0.4, 0.5, 0.24), pal.uniform, 0, 1.18, 0);
  add(B(0.34, 0.16, 0.26), pal.uniformDark, 0, 0.88, 0);
  add(B(0.44, 0.34, 0.3), pal.vest, 0, 1.24, 0);
  add(B(0.46, 0.07, 0.32), pal.pouch, 0, 1.05, 0);
  add(B(0.1, 0.12, 0.05), pal.pouch, -0.11, 1.12, 0.16);
  add(B(0.1, 0.12, 0.05), pal.pouch, 0.11, 1.12, 0.16);
  add(B(0.36, 0.05, 0.28), pal.strap, 0, 0.9, 0);

  add(B(0.19, 0.2, 0.2), pal.skin, 0, 1.58, 0);
  add(B(0.23, 0.12, 0.23), pal.headgear, 0, 1.71, 0);
  add(B(0.24, 0.045, 0.24), pal.band, 0, 1.655, 0);
  add(B(0.2, 0.05, 0.02), 0x14120e, 0, 1.6, 0.105);

  add(B(0.13, 0.09, 0.5), pal.gun, 0.16, 1.34, -0.22);
  const barrel = new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6);
  barrel.rotateX(Math.PI / 2);
  add(barrel, pal.gun, 0.16, 1.36, -0.6);
  add(B(0.05, 0.14, 0.07), pal.gun, 0.16, 1.26, -0.14, 0.35);
  add(B(0.06, 0.08, 0.16), pal.gunWood, 0.16, 1.32, 0.1);
  add(B(0.04, 0.04, 0.14), pal.gunWood, 0.16, 1.33, -0.38);

  return mergeColored(P);
}

function buildArmGeo(pal, side) {
  const P = [];
  const s = side;
  P.push({ g: B(0.12, 0.3, 0.13), c: pal.uniform, m: mat(0, -0.15, 0, -0.5, 0, 0) });
  P.push({ g: B(0.1, 0.26, 0.11), c: pal.uniformDark, m: mat(0.02 * s, -0.34, -0.12, -1.15, 0, 0) });
  P.push({ g: B(0.09, 0.09, 0.1), c: pal.skin, m: mat(0.02 * s, -0.42, -0.24, -1.15, 0, 0) });
  return mergeColored(P);
}

function buildLegGeo(pal) {
  const P = [];
  P.push({ g: B(0.16, 0.46, 0.18), c: pal.uniform, m: mat(0, -0.23, 0) });
  P.push({ g: B(0.14, 0.42, 0.16), c: pal.uniformDark, m: mat(0, -0.65, 0.01) });
  P.push({ g: B(0.15, 0.11, 0.27), c: pal.boots, m: mat(0, -0.9, 0.04) });
  return mergeColored(P);
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
  armL.position.set(-0.3, 1.42, -0.04);
  armL.castShadow = true;
  body.add(armL);

  const armR = new THREE.Mesh(G.armR, bodyMat);
  armR.position.set(0.3, 1.42, -0.04);
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
  flash.scale.set(0.42, 0.42, 1);
  flash.position.set(0.16, 1.36, -0.78);
  flash.visible = false;
  body.add(flash);

  scene.add(root);
  return {
    root, body, armL, armR, legL, legR, blob, marker, flash,
    muzzleLocal: new THREE.Vector3(0.16, 1.36, -0.78),
    headLocal: new THREE.Vector3(0, 1.58, 0),
    chestLocal: new THREE.Vector3(0, 1.2, 0)
  };
}
