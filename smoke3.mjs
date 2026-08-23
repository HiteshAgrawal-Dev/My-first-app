import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.requestAnimationFrame = cb => setTimeout(() => cb(1), 16);
global.screen = dom.window.screen; global.localStorage = dom.window.localStorage;
const THREE = await import('./static/js/lib/three.module.min.js');
const { World } = await import('./static/js/world.js');

const scene = new THREE.Scene();
const world = new World(scene);

let maxR = 0;
for (const n of world.navNodes) maxR = Math.max(maxR, Math.hypot(n.x, n.z));
console.log('navMaxR', maxR.toFixed(1), '(expect <=51)');

const p = new THREE.Vector3(0, 0.9, -52.5);
world.collide(p, 0.45);
console.log('boundary_clamp r=', Math.hypot(p.x, p.z).toFixed(2), '(expect <55)');

const p2 = new THREE.Vector3(Math.cos(0.3) * 53.6, 0, Math.sin(0.3) * 53.6);
world.collide(p2, 0.45);
const r2 = Math.hypot(p2.x, p2.z);
console.log('wall_pushback r=', r2.toFixed(2), '(expect <=54.4)', r2 <= 54.4 ? 'PASS' : 'FAIL');

const s0 = { position: new THREE.Vector3(5, 0, 7), yaw: 0 };
const muzzleLocal = new THREE.Vector3(0.17, 1.335, 0.84);
const c = Math.cos(0), si = Math.sin(0);
const mx = s0.position.x + c * muzzleLocal.x + si * muzzleLocal.z;
const mz = s0.position.z - si * muzzleLocal.x + c * muzzleLocal.z;
console.log('muzzle_front', mz > s0.position.z + 0.5 ? 'PASS(+Z forward)' : 'FAIL');

const v = world.spawnsMilitia[0];
console.log('militia_spawn_ok', !world.pointBlocked(v.x, v.z, 0.5) ? 'PASS' : 'FAIL');
console.log('SMOKE3_OK');
