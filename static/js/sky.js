import * as THREE from 'three';
import { flashTexture } from './textures.js';

export function createSky(scene, sunDir) {
  const geo = new THREE.SphereGeometry(320, 20, 12);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x6f8aa8) },
      mid: { value: new THREE.Color(0xd9c39a) },
      bot: { value: new THREE.Color(0xe8d2a6) }
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 col = h < 0.12
          ? mix(bot, mid, smoothstep(-0.05, 0.12, h))
          : mix(mid, top, smoothstep(0.12, 0.62, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const dome = new THREE.Mesh(geo, material);
  dome.frustumCulled = false;
  scene.add(dome);

  const glowTex = flashTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    color: 0xffe0a0, opacity: 0.95
  }));
  sunSprite.position.copy(sunDir).normalize().multiplyScalar(290);
  sunSprite.scale.setScalar(95);
  scene.add(sunSprite);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    color: 0xffd890, opacity: 0.3
  }));
  halo.position.copy(sunSprite.position);
  halo.scale.setScalar(240);
  scene.add(halo);

  return { dome, sunSprite, halo };
}
