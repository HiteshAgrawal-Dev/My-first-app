import * as THREE from 'three';
import { camoTexture, blobShadowTexture } from './textures.js';
import { mergeGeometries, mat } from './util.js';

const RANGER_CAMO = ['#8a8468', '#6b6248', '#a39a78', '#54503c'];
const MILITIA_CAMO = ['#5a4a3a', '#3d332a', '#6e5a42', '#2e2620'];

const geoCache = {};

function getGeos(team) {
  if (geoCache[team]) return geoCache[team];
  const camoColor = team === 'rangers' ? RANGER_CAMO : MILITIA_CAMO;

  const camoMat = new THREE.MeshStandardMaterial({ map: camoTexture(camoColor), roughness: 1 });
  const gearMat = new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xb08a62, roughness: 0.9 });

  const camoParts = [], gearParts = [];

  camoParts.push({ g: new THREE.BoxGeometry(0.46, 0.62, 0.26), m: mat(0, 1.18, 0) });
  camoParts.push({ g: new THREE.BoxGeometry(0.4, 0.2, 0.24), m: mat(0, 0.84, 0) });
  camoParts.push({ g: new THREE.BoxGeometry(0.13, 0.5, 0.15), m: mat(-0.27, 1.25, 0.12, -1.1, 0, 0) });
  camoParts.push({ g: new THREE.BoxGeometry(0.13, 0.48, 0.15), m: mat(0.26, 1.28, 0.1, -1.2, 0, 0) });
  const helmet = new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  camoParts.push({ g: helmet, m: mat(0, 1.72, 0) });

  gearParts.push({ g: new THREE.BoxGeometry(0.5, 0.42, 0.32), m: mat(0, 1.22, 0) });
  for (let i = 0; i < 3; i++) {
    gearParts.push({ g: new THREE.BoxGeometry(0.09, 0.13, 0.05), m: mat(-0.13 + i * 0.13, 1.1, 0.185) });
  }
  gearParts.push({ g: new THREE.BoxGeometry(0.22, 0.05, 0.02), m: mat(0, 1.7, 0.115) });
  gearParts.push({ g: new THREE.BoxGeometry(0.06, 0.08, 0.55), m: mat(0.05, 1.32, -0.28) });
  const rBarrel = new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6);
  rBarrel.rotateX(Math.PI / 2);
  gearParts.push({ g: rBarrel, m: mat(0.05, 1.32, -0.68) });
  gearParts.push({ g: new THREE.BoxGeometry(0.045, 0.16, 0.07), m: mat(0.05, 1.22, -0.34, 0.3, 0, 0) });
  gearParts.push({ g: new THREE.BoxGeometry(0.05, 0.09, 0.18), m: mat(0.05, 1.3, 0.04) });

  const legGeoL = mergeGeometries([
    { g: new THREE.BoxGeometry(0.17, 0.78, 0.19), m: mat(0, -0.39, 0) },
    { g: new THREE.BoxGeometry(0.18, 0.12, 0.28), m: mat(0, -0.81, 0.03) }
  ]);
  const legGeoR = legGeoL.clone();

  geoCache[team] = {
    camoMeshGeo: mergeGeometries(camoParts),
    gearMeshGeo: mergeGeometries(gearParts),
    headGeo: new THREE.BoxGeometry(0.22, 0.24, 0.22),
    legGeoL,
    camoMat, gearMat, skinMat
  };
  return geoCache[team];
}

export function buildSoldier(team, scene) {
  const G = getGeos(team);

  const group = new THREE.Group();

  const bodyMesh = new THREE.Mesh(G.camoMeshGeo, G.camoMat);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  const gearMesh = new THREE.Mesh(G.gearMeshGeo, G.gearMat);
  gearMesh.castShadow = true;
  group.add(gearMesh);

  const head = new THREE.Mesh(G.headGeo, G.skinMat);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);

  const legL = new THREE.Mesh(G.legGeoL, G.camoMat);
  legL.position.set(-0.12, 0.87, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(G.legGeoR, G.camoMat);
  legR.position.set(0.12, 0.87, 0);
  legR.castShadow = true;
  group.add(legR);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({
      map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.7
    })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  blob.renderOrder = 1;
  group.add(blob);

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
  flash.scale.set(0.4, 0.4, 1);
  flash.position.set(0.05, 1.34, -0.85);
  flash.visible = false;
  group.add(flash);

  scene.add(group);
  return {
    group, bodyMesh, gearMesh, head, legL, legR, blob, flash,
    muzzleLocal: new THREE.Vector3(0.05, 1.34, -0.85)
  };
}
