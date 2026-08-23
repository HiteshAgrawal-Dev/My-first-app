import * as THREE from 'three';
import * as TEX from './textures.js';
import { mergeGeometries, mat, rand } from './util.js';
import { CFG } from './config.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.shootables = [];
    this.spawnsRangers = [];
    this.spawnsMilitia = [];
    this.coverPoints = [];
    this.navNodes = [];
    this.navEdges = [];
    this._rc = new THREE.Raycaster();
    this._build();
    this._buildNav();
  }

  addBoxCol(cx, cz, w, d, h = 3, y0 = 0, ry = 0) {
    const cw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d;
    const cd = Math.abs(Math.cos(ry)) * d + Math.abs(Math.sin(ry)) * w;
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - cw / 2, y0, cz - cd / 2),
      new THREE.Vector3(cx + cw / 2, y0 + h, cz + cd / 2)
    ));
  }

  pointBlocked(x, z, pad) {
    for (const b of this.colliders) {
      if (b.max.y < 0.4 || b.min.y > 1.7) continue;
      if (x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad) return true;
    }
    return false;
  }

  collide(pos, r) {
    for (const box of this.colliders) {
      if (box.max.y < 0.35 || box.min.y > 1.55) continue;
      const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
      const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          const pL = pos.x - box.min.x + r, pR = box.max.x - pos.x + r;
          const pB = pos.z - box.min.z + r, pF = box.max.z - pos.z + r;
          const m = Math.min(pL, pR, pB, pF);
          if (m === pL) pos.x = box.min.x - r;
          else if (m === pR) pos.x = box.max.x + r;
          else if (m === pB) pos.z = box.min.z - r;
          else pos.z = box.max.z + r;
        }
      }
    }
    const R = CFG.arena.radius;
    const dd = Math.hypot(pos.x, pos.z);
    if (dd > R) { pos.x *= R / dd; pos.z *= R / dd; }
  }

  losBlocked(from, to) {
    const dir = this._v1.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.5) return false;
    this._rc.set(from, dir.normalize());
    this._rc.far = dist - 0.4;
    return this._rc.intersectObjects(this.shootables, false).length > 0;
  }

  _build() {
    const scene = this.scene;

    scene.fog = new THREE.Fog(0xdcc49c, 50, 215);
    scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x8a7048, 0.95));
    const sun = new THREE.DirectionalLight(0xffe4b8, 2.35);
    sun.position.set(60, 90, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -62; sun.shadow.camera.right = 62;
    sun.shadow.camera.top = 62; sun.shadow.camera.bottom = -62;
    sun.shadow.camera.far = 280;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.matSand = new THREE.MeshStandardMaterial({ map: TEX.sandTexture(), roughness: 1 });
    const matSandTiled = this.matSand.clone();
    matSandTiled.map = TEX.sandTexture().clone();
    matSandTiled.map.wrapS = matSandTiled.map.wrapT = THREE.RepeatWrapping;
    matSandTiled.map.repeat.set(14, 14);
    matSandTiled.map.needsUpdate = true;
    this.matSand = matSandTiled;
    const matRock = new THREE.MeshStandardMaterial({ map: TEX.rockTexture(), roughness: 1 });
    const matAdobe = new THREE.MeshStandardMaterial({ map: TEX.adobeTexture(), roughness: 0.95 });
    this.matWood = new THREE.MeshStandardMaterial({ map: TEX.woodTexture(), roughness: 0.9 });
    const matMetalRoof = new THREE.MeshStandardMaterial({ map: TEX.containerTexture('#5c584e'), roughness: 0.55, metalness: 0.45 });

    const groundGeo = new THREE.PlaneGeometry(340, 340, 56, 56);
    const gp = groundGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const gx = gp.getX(i), gy = gp.getY(i);
      const d = Math.hypot(gx, gy);
      let h = 0;
      if (d > 62) {
        const k = Math.min(1, (d - 62) / 40);
        h = k * (Math.sin(gx * 0.05) * Math.cos(gy * 0.06) * 2.2 + Math.sin(gx * 0.11 + 2) * 1.1 + k * 6);
      } else if (d > 55) {
        const k = (d - 55) / 7;
        h = Math.sin(gx * 0.05) * Math.cos(gy * 0.06) * 0.35 * k;
      }
      gp.setZ(i, h);
    }
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, matSandTiled);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    this.shootables.push(ground);
    this.groundMesh = ground;

    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    const canyonIM = new THREE.InstancedMesh(rockGeo, matRock, 26);
    canyonIM.castShadow = true; canyonIM.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = 96 + Math.sin(i * 2.7) * 16;
      const s = rand(24, 50);
      dummy.position.set(Math.cos(a) * r, s * 0.35 - 4, Math.sin(a) * r);
      dummy.scale.set(s * rand(0.8, 1.4), s * rand(1.1, 2.0), s * rand(0.7, 1.2));
      dummy.rotation.set(0, a + Math.random() * 2, 0);
      dummy.updateMatrix();
      canyonIM.setMatrixAt(i, dummy.matrix);
    }
    scene.add(canyonIM);
    this.shootables.push(canyonIM);

    const mesaMat = new THREE.MeshBasicMaterial({ color: 0xbfa887, fog: true });
    const mesaIM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), mesaMat, 10);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.31;
      const s = rand(60, 115);
      dummy.position.set(Math.cos(a) * 178, s * 0.32 - 10, Math.sin(a) * 178);
      dummy.scale.set(s * 1.6, s * 1.25, s);
      dummy.rotation.set(0, a, 0);
      dummy.updateMatrix();
      mesaIM.setMatrixAt(i, dummy.matrix);
    }
    scene.add(mesaIM);

    const adobeParts = [], woodParts = [], winParts = [], roofParts = [];
    const W = (g, m) => woodParts.push({ g, m });
    const A = (g, m) => adobeParts.push({ g, m });

    const villageBoxes = [
      [58, 10, 8, 6, 7, 0.1], [58, 20, 7, 9, 7, -0.05], [56, 30, 9, 5, 8, 0.15],
      [64, 14, 6, 11, 6, 0], [66, 26, 7, 8, 6, 0.1], [63, 38, 8, 6, 7, -0.1],
      [55, -4, 7, 7, 6, 0.2], [64, 0, 6, 9, 6, 0], [70, 20, 8, 13, 7, 0.05],
      [52, 44, 6, 5, 6, -0.2], [70, 36, 7, 10, 6, 0]
    ];
    for (const [vx, vz, w, h, d, ry] of villageBoxes) {
      A(new THREE.BoxGeometry(w, h, d), mat(vx, h / 2 - 0.4, vz, 0, ry, 0));
      this.addBoxCol(vx, vz, w, d, h, -0.4, ry);
      const rows = Math.max(1, Math.floor(h / 3.2));
      const q = new THREE.PlaneGeometry(0.85, 1.15);
      for (let r = 0; r < rows; r++) {
        for (let ci = 0; ci < 2; ci++) {
          const local = new THREE.Vector3(-w / 2 - 0.03, 1.6 + r * 3.0, (ci - 0.5) * d * 0.42);
          const world = local.clone().applyEuler(new THREE.Euler(0, ry, 0));
          const rotY = -Math.PI / 2;
          world.y += h / 2 - 0.4;
          world.x += vx; world.z += vz;
          winParts.push({
            g: q,
            m: mat(world.x, world.y, world.z, 0, ry + rotY, 0)
          });
        }
      }
      for (let b = 0; b < 3; b++) {
        W(new THREE.BoxGeometry(0.22, 0.22, d + 1), mat(
          vx + (-w / 2 + 0.6 + b * 1.1) * Math.cos(ry),
          h / 2 - 0.75,
          vz - (-w / 2 + 0.6 + b * 1.1) * Math.sin(ry),
          0, ry, 0
        ));
      }
    }

    for (const [wx, wz, w, h, d] of [[-4, 0, 0.35, 3.2, 10], [4, -3, 8.3, 3.2, 0.35], [4, 5, 8.3, 3.2, 0.35]]) {
      A(new THREE.BoxGeometry(w, h, d), mat(wx, h / 2, wz));
      this.addBoxCol(wx, wz, w, d, h);
    }

    const towerAt = (tx, tz) => {
      for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
        W(new THREE.BoxGeometry(0.3, 6, 0.3), mat(tx + lx, 3, tz + lz));
      }
      W(new THREE.BoxGeometry(3.4, 0.25, 3.4), mat(tx, 6, tz));
      for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
        W(new THREE.BoxGeometry(0.16, 2.4, 0.16), mat(tx + lx, 7.2, tz + lz));
      }
      roofParts.push({ g: new THREE.BoxGeometry(3.9, 0.18, 3.9), m: mat(tx, 8.45, tz) });
      this.addBoxCol(tx, tz, 3, 3, 6.2);
      this.coverFromCol(this.colliders[this.colliders.length - 1]);
    };
    towerAt(-14, -16);
    towerAt(34, 26);

    const crateSpots = [[2, 1], [3.4, 1.4], [2.6, 2.6], [-10, -14], [-11.4, -13.2], [16, 8], [-2, 20], [-20, 30], [24, -12]];
    const crateGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    for (const [cx, cz] of crateSpots) {
      const ry = rand(0, 3);
      W(crateGeo, mat(cx, 0.65, cz, 0, ry, 0));
      this.addBoxCol(cx, cz, 1.3, 1.3, 1.3);
      this.coverFromCol(this.colliders[this.colliders.length - 1]);
    }

    const barrierSpots = [
      [0, -26, 0], [-14, 10, 1.2], [18, 22, 0.5], [-30, -6, -0.8], [34, -32, 0.3], [8, -8, -1.1], [-24, 14, 2.4]
    ];
    for (const [bx, bz, ry] of barrierSpots) {
      const cos = Math.cos(ry), sin = Math.sin(ry);
      W(new THREE.BoxGeometry(4.6, 1.5, 0.32), mat(bx, 0.75, bz, 0, ry, 0));
      for (const sx of [-1.8, 1.8]) {
        W(new THREE.BoxGeometry(0.28, 2.0, 0.28), mat(bx + sx * cos, 1.0, bz - sx * sin, 0, ry, 0));
      }
      this.addBoxCol(bx, bz, 4.6, 1.2, 1.6, 0, ry);
      this.coverFromCol(this.colliders[this.colliders.length - 1]);
    }

    const fenceSpots = [[-34, 22, 0.3], [-38, 26.5, 0.3], [20, -28, -0.5], [46, 8, 1.35]];
    const fenceTex = TEX.containerTexture('#6a5f4c');
    for (const [fx, fz, ry] of fenceSpots) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(6.5, 2.6, 0.18),
        new THREE.MeshStandardMaterial({ map: fenceTex, roughness: 0.7, metalness: 0.3 })
      );
      m.position.set(fx, 1.3, fz); m.rotation.y = ry;
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      this.shootables.push(m);
      this.addBoxCol(fx, fz, 6.5, 0.5, 2.6, 0, ry);
      this.coverFromCol(this.colliders[this.colliders.length - 1]);
    }

    const contCols = ['#7a4a2a', '#4a5a3a', '#5a4a5a', '#3a4a5a'];
    const contSpots = [
      [-28, 30, 0.4], [-24, 34, -0.2], [26, -22, 1.2], [30, -18, 1.2],
      [-38, -34, 0.9], [14, 40, -0.6]
    ];
    contSpots.forEach(([cx, cz, ry], i) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(9, 3.4, 3.2),
        new THREE.MeshStandardMaterial({ map: TEX.containerTexture(contCols[i % 4]), roughness: 0.7, metalness: 0.35 })
      );
      m.position.set(cx, 1.7, cz); m.rotation.y = ry;
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      this.shootables.push(m);
      this.addBoxCol(cx, cz, 9, 3.2, 3.4, 0, ry);
      this.coverFromCol(this.colliders[this.colliders.length - 1]);
    });
    const stacked = new THREE.Mesh(
      new THREE.BoxGeometry(9, 3.4, 3.2),
      new THREE.MeshStandardMaterial({ map: TEX.containerTexture('#8a3a2a', true), roughness: 0.7, metalness: 0.35 })
    );
    stacked.position.set(-26, 5.1, 32); stacked.rotation.y = 0.1;
    stacked.castShadow = true;
    scene.add(stacked);
    this.shootables.push(stacked);

    const bagGeo = new THREE.CapsuleGeometry(0.28, 0.6, 3, 6);
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x9a8a62, roughness: 1 });
    const bagIM = new THREE.InstancedMesh(bagGeo, bagMat, 72);
    bagIM.castShadow = true; bagIM.receiveShadow = true;
    let bi = 0;
    for (const [sx, sz] of [[6, 28], [-18, -30], [40, 14]]) {
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 8 && bi < 72; i++) {
          const a = (i / 8) * Math.PI * 1.25 - 0.6 + sx * 0.01;
          dummy.position.set(sx + Math.cos(a) * 2.2, 0.25 + row * 0.42, sz + Math.sin(a) * 2.2);
          dummy.rotation.set(Math.PI / 2, 0, a + (row % 2) * 0.35);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          bagIM.setMatrixAt(bi++, dummy.matrix);
        }
      }
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(sx - 2.5, 0, sz - 2.5),
        new THREE.Vector3(sx + 2.5, 1.3, sz + 2.5)
      ));
      this.coverFromCol(this.colliders[this.colliders.length - 1]);
    }
    scene.add(bagIM);
    this.shootables.push(bagIM);

    const barrelSpots = [[6.5, 3], [7.2, 2.2], [-12, 12], [24, -6], [-20, -22], [12, -30]];
    const barIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.15, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a5540, roughness: 0.65, metalness: 0.4 }), 3
    );
    const barIM2 = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.15, 10),
      new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.65, metalness: 0.4 }), 3
    );
    barIM.castShadow = barIM2.castShadow = true;
    let b1 = 0, b2 = 0;
    barrelSpots.forEach(([bx, bz], i) => {
      dummy.position.set(bx, 0.58, bz);
      dummy.rotation.set(0, rand(0, 3), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      if (i % 2) barIM2.setMatrixAt(b2++, dummy.matrix);
      else barIM.setMatrixAt(b1++, dummy.matrix);
      this.addBoxCol(bx, bz, 0.95, 0.95, 1.15);
    });
    scene.add(barIM); scene.add(barIM2);
    this.shootables.push(barIM, barIM2);

    const boulderIM = new THREE.InstancedMesh(rockGeo, matRock, 12);
    boulderIM.castShadow = true; boulderIM.receiveShadow = true;
    const boulderSpots = [
      [12, -18, 2.6], [-16, -8, 2.0], [8, 14, 2.3], [-22, 18, 3.0],
      [30, 6, 2.2], [-34, -20, 2.8], [22, -34, 2.4], [-8, 34, 2.1],
      [44, -12, 3.2], [-44, 8, 2.6], [4, -44, 2.9], [36, 30, 2.5]
    ];
    boulderSpots.forEach(([bx, bz, bs], i) => {
      dummy.position.set(bx, bs * 0.3, bz);
      dummy.scale.set(bs * rand(0.9, 1.3), bs * rand(0.7, 1.2), bs * rand(0.9, 1.3));
      dummy.rotation.set(rand(-0.2, 0.2), rand(0, 6.3), rand(-0.2, 0.2));
      dummy.updateMatrix();
      boulderIM.setMatrixAt(i, dummy.matrix);
      this.addBoxCol(bx, bz, bs * 1.2, bs * 1.2, bs * 0.9);
      this.coverFromCol(this.colliders[this.colliders.length - 1]);
    });
    scene.add(boulderIM);
    this.shootables.push(boulderIM);

    const shrubIM = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x6a6a3a, roughness: 1 }), 70
    );
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 62;
      dummy.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r);
      dummy.scale.setScalar(rand(0.5, 1.4));
      dummy.rotation.y = rand(0, 6);
      dummy.updateMatrix();
      shrubIM.setMatrixAt(i, dummy.matrix);
    }
    scene.add(shrubIM);

    const palletIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.25, 0.12, 1.25), this.matWood, 16
    );
    palletIM.castShadow = true; palletIM.receiveShadow = true;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 48;
      dummy.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r);
      dummy.rotation.set(0, rand(0, 6.3), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      palletIM.setMatrixAt(i, dummy.matrix);
    }
    scene.add(palletIM);

    const tireIM = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.42, 0.16, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.95 }), 9
    );
    tireIM.castShadow = true;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 44;
      dummy.position.set(Math.cos(a) * r, 0.17, Math.sin(a) * r);
      dummy.rotation.set(Math.PI / 2, 0, rand(0, 6.3));
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      tireIM.setMatrixAt(i, dummy.matrix);
    }
    scene.add(tireIM);

    const ammoMat = new THREE.MeshStandardMaterial({ color: 0x44523a, roughness: 0.8 });
    for (const [ax, az, ry] of [[-42, -38, 0.4], [-43.2, -36.6, -0.2], [-42.6, -37.3, 1.1]]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), ammoMat);
      crate.position.set(ax, 0.28, az);
      crate.rotation.y = ry;
      crate.castShadow = true; crate.receiveShadow = true;
      scene.add(crate);
      this.addBoxCol(ax, az, 1.1, 0.7, 0.55, 0, ry);
    }

    this.fires = [];
    const flameTex = TEX.flashTexture();
    for (const [fx, fz] of [[-2, 8], [54, 12], [-26, -36]]) {
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10),
        new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.7, metalness: 0.4 })
      );
      drum.position.set(fx, 0.5, fz);
      drum.castShadow = true;
      scene.add(drum);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, color: 0xff9030, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      flame.position.set(fx, 1.35, fz);
      flame.scale.set(0.9, 1.3, 1);
      scene.add(flame);
      const light = new THREE.PointLight(0xff8030, 16, 10, 2);
      light.position.set(fx, 1.5, fz);
      scene.add(light);
      this.fires.push({ flame, light, seed: Math.random() * 10 });
      this.addBoxCol(fx, fz, 0.9, 0.9, 1.0);
    }

    const mastX = 0, mastZ = -52;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.2, 15, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a5a52, roughness: 0.6, metalness: 0.6 })
    );
    mast.position.set(mastX, 7.5, mastZ);
    mast.castShadow = true;
    scene.add(mast);
    this.mastBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false })
    );
    this.mastBeacon.position.set(mastX, 15.2, mastZ);
    scene.add(this.mastBeacon);
    this.addBoxCol(mastX, mastZ, 0.5, 0.5, 15);

    this.clouds = [];
    const cloudTex = TEX.smokeTexture();
    for (let i = 0; i < 7; i++) {
      const cl = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, color: 0xf2e8d8, transparent: true,
        opacity: rand(0.2, 0.34), depthWrite: false, fog: false
      }));
      cl.position.set(rand(-170, 170), rand(62, 96), rand(-170, 170));
      cl.scale.set(rand(60, 115), rand(22, 40), 1);
      scene.add(cl);
      this.clouds.push(cl);
    }

    const adobeMesh = new THREE.Mesh(mergeGeometries(adobeParts), matAdobe);
    adobeMesh.castShadow = true; adobeMesh.receiveShadow = true;
    scene.add(adobeMesh);
    this.shootables.push(adobeMesh);

    const woodMesh = new THREE.Mesh(mergeGeometries(woodParts), this.matWood);
    woodMesh.castShadow = true; woodMesh.receiveShadow = true;
    scene.add(woodMesh);
    this.shootables.push(woodMesh);

    if (winParts.length) {
      const winMesh = new THREE.Mesh(mergeGeometries(winParts), new THREE.MeshBasicMaterial({ color: 0x171208 }));
      scene.add(winMesh);
    }
    if (roofParts.length) {
      const roofMesh = new THREE.Mesh(mergeGeometries(roofParts), matMetalRoof);
      roofMesh.castShadow = true;
      scene.add(roofMesh);
      this.shootables.push(roofMesh);
    }

    this.spawnsRangers = [
      new THREE.Vector3(-46, 0, -42), new THREE.Vector3(-52, 0, -30), new THREE.Vector3(-40, 0, -50)
    ].filter(v => !this.pointBlocked(v.x, v.z, 0.8));
    if (!this.spawnsRangers.length) this.spawnsRangers.push(new THREE.Vector3(-46, 0, -42));
    this.spawnsMilitia = [
      new THREE.Vector3(44, 0, 40), new THREE.Vector3(48, 0, 28), new THREE.Vector3(40, 0, 48)
    ].filter(v => !this.pointBlocked(v.x, v.z, 0.8));
    if (!this.spawnsMilitia.length) this.spawnsMilitia.push(new THREE.Vector3(44, 0, 40));

    const WR = CFG.arena.wallR;
    const SEG = 72;
    const wallGeo = new THREE.BoxGeometry(1.1, 1.8, 4.9);
    const wallIM = new THREE.InstancedMesh(wallGeo, this.matWood, SEG);
    wallIM.castShadow = true; wallIM.receiveShadow = true;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const wx = Math.cos(a) * WR, wz = Math.sin(a) * WR;
      dummy.position.set(wx, 0.9, wz);
      dummy.rotation.set(0, -a, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      wallIM.setMatrixAt(i, dummy.matrix);
      this.addBoxCol(wx, wz, 1.1, 4.9, 1.8, 0, -a);
    }
    scene.add(wallIM);
    this.shootables.push(wallIM);

    const zoneSpec = [
      { cx: -45, cz: -40, color: 0x3f7a34, cloth: 0x59c24a },
      { cx: 45, cz: 40, color: 0x7a2a1c, cloth: 0xd83a22 }
    ];
    for (const zs of zoneSpec) {
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(10, 24),
        new THREE.MeshBasicMaterial({ color: zs.color, transparent: true, opacity: 0.22, depthWrite: false })
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(zs.cx, 0.02, zs.cz);
      patch.renderOrder = 1;
      scene.add(patch);
      for (let f = 0; f < 3; f++) {
        const fa = (f / 3) * Math.PI * 2 + 0.6;
        const fx = zs.cx + Math.cos(fa) * 7, fz = zs.cz + Math.sin(fa) * 7;
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6),
          this.matWood
        );
        pole.position.set(fx, 2.1, fz);
        pole.castShadow = true;
        scene.add(pole);
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 0.95),
          new THREE.MeshBasicMaterial({ color: zs.cloth, side: THREE.DoubleSide })
        );
        cloth.position.set(fx + 0.78, 3.7, fz);
        cloth.rotation.y = rand(0, 6.3);
        scene.add(cloth);
        this.addBoxCol(fx, fz, 0.3, 0.3, 4.2);
      }
    }

    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();

    const dustCount = 180;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = rand(-70, 70);
      dustPos[i * 3 + 1] = rand(0.2, 11);
      dustPos[i * 3 + 2] = rand(-70, 70);
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xe8d8b0, size: 0.13, transparent: true, opacity: 0.45,
      sizeAttenuation: true, depthWrite: false
    }));
    scene.add(this.dust);
  }

  coverFromCol(box) {
    if (box.max.y - box.min.y < 1.05) return;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const hw = (box.max.x - box.min.x) / 2 + 0.8;
    const hd = (box.max.z - box.min.z) / 2 + 0.8;
    const pts = [
      [cx - hw, cz], [cx + hw, cz], [cx, cz - hd], [cx, cz + hd]
    ];
    for (const [px, pz] of pts) {
      if (Math.hypot(px, pz) > CFG.arena.radius - 2) continue;
      if (this.pointBlocked(px, pz, 0.35)) continue;
      this.coverPoints.push(new THREE.Vector3(px, 0, pz));
    }
  }

  _buildNav() {
    const N = 15, span = 104, step = span / (N - 1);
    const xs = [], zs = [], idx = [];
    const idOf = {};
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = -span / 2 + i * step, z = -span / 2 + j * step;
        idx[i * N + j] = -1;
        if (Math.hypot(x, z) > 51) continue;
        if (this.pointBlocked(x, z, 1.15)) continue;
        idx[i * N + j] = xs.length;
        idOf[xs.length] = [i, j];
        xs.push(x); zs.push(z);
      }
    }
    const adj = xs.map(() => []);
    const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    for (let n = 0; n < xs.length; n++) {
      const [i, j] = idOf[n];
      for (const [di, dj] of dirs) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const m = idx[ni * N + nj];
        if (m < 0) continue;
        if (this._segClear(xs[n], zs[n], xs[m], zs[m], 0.95)) adj[n].push(m);
      }
    }
    this.navNodes = xs.map((x, k) => new THREE.Vector3(x, 0, zs[k]));
    this.navEdges = adj;
  }

  _segClear(ax, az, bx, bz, pad) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.9) + 1;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.pointBlocked(ax + (bx - ax) * t, az + (bz - az) * t, pad)) return false;
    }
    return true;
  }

  nearestNode(x, z) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.navNodes.length; i++) {
      const n = this.navNodes[i];
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return -1;
    if (!this.pointBlocked(this.navNodes[best].x, this.navNodes[best].z, 0.5)) return best;
    let alt = -1, abd = Infinity;
    for (let i = 0; i < this.navNodes.length; i++) {
      const n = this.navNodes[i];
      if (this.pointBlocked(n.x, n.z, 0.5)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < abd) { abd = d; alt = i; }
    }
    return alt >= 0 ? alt : best;
  }

  findPath(sv, ev) {
    const start = this.nearestNode(sv.x, sv.z);
    const goal = this.nearestNode(ev.x, ev.z);
    if (start < 0 || goal < 0) return null;
    const nCount = this.navNodes.length;
    const g = new Float32Array(nCount).fill(Infinity);
    const came = new Int16Array(nCount).fill(-1);
    const closed = new Uint8Array(nCount);
    const gx = this.navNodes[goal].x, gz = this.navNodes[goal].z;
    const h = i => {
      const nx = this.navNodes[i];
      return Math.hypot(nx.x - gx, nx.z - gz);
    };
    g[start] = 0;
    const open = [start];
    const f = new Float32Array(nCount).fill(Infinity);
    f[start] = h(start);
    let expansions = 0;
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      closed[cur] = 1;
      if (++expansions > 420) return null;
      for (const nb of this.navEdges[cur]) {
        if (closed[nb]) continue;
        const nn = this.navNodes[cur], mn = this.navNodes[nb];
        const cost = g[cur] + Math.hypot(mn.x - nn.x, mn.z - nn.z);
        if (cost < g[nb]) {
          came[nb] = cur;
          g[nb] = cost;
          f[nb] = cost + h(nb);
          if (!open.includes(nb)) open.push(nb);
        }
      }
    }
    if (came[goal] < 0 && goal !== start) return null;
    const path = [];
    let c = goal;
    while (c >= 0 && c !== start) { path.push(this.navNodes[c]); c = came[c]; }
    path.reverse();
    path.push(new THREE.Vector3(ev.x, 0, ev.z));
    return path;
  }

  randomNode() {
    for (let tries = 0; tries < 12; tries++) {
      const n = this.navNodes[(Math.random() * this.navNodes.length) | 0];
      if (Math.hypot(n.x, n.z) < 48) return n;
    }
    return this.navNodes[0];
  }

  randomCoverNear(pos, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of this.coverPoints) {
      const d = (c.x - pos.x) ** 2 + (c.z - pos.z) ** 2;
      if (d < bd && Math.random() < 0.6) { bd = d; best = c; }
    }
    return best;
  }

  update(dt, t) {
    this.dust.rotation.y = t * 0.008;
    this.dust.position.y = Math.sin(t * 0.3) * 0.4;
    for (const f of this.fires) {
      const n = 0.85 + Math.sin(t * 12 + f.seed * 7) * 0.1 + Math.sin(t * 23 + f.seed * 3) * 0.06;
      f.flame.scale.set(0.9 * n, 1.3 * (2 - n), 1);
      f.light.intensity = 14 + n * 6;
    }
    this.mastBeacon.visible = (t % 1.4) < 0.7;
    for (let i = 0; i < this.clouds.length; i++) {
      const cl = this.clouds[i];
      cl.position.x += dt * (1.1 + i * 0.15);
      if (cl.position.x > 185) cl.position.x = -185;
    }
  }

  followPlayer(px, pz) {
    this.sun.position.set(px + 60, 90, pz + 30);
    this.sun.target.position.set(px, 0, pz);
  }
}
