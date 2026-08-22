import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
global.performance = dom.window.performance;
global.screen = dom.window.screen;
global.localStorage = dom.window.localStorage;

const THREE = await import('./static/js/lib/three.module.min.js');
const { World } = await import('./static/js/world.js');

const scene = new THREE.Scene();
const t0 = Date.now();
const world = new World(scene);
console.log('WORLD_BUILT_MS', Date.now() - t0);
console.log('colliders', world.colliders.length);
console.log('shootables', world.shootables.length);
console.log('coverPoints', world.coverPoints.length);
console.log('navNodes', world.navNodes.length);
let edgeCount = 0;
for (const e of world.navEdges) edgeCount += e.length;
console.log('navEdges', edgeCount);
console.log('spawnsR', world.spawnsRangers.length, 'spawnsM', world.spawnsMilitia.length);

const start = new THREE.Vector3(-46, 0, -42);
const end = new THREE.Vector3(46, 0, 42);
const t1 = Date.now();
const path = world.findPath(start, end);
console.log('PATH_MS', Date.now() - t1, 'len', path ? path.length : 'NULL');

const t2 = Date.now();
for (let i = 0; i < 20; i++) world.findPath(start, end);
console.log('20_PATHS_MS', Date.now() - t2);

const p = new THREE.Vector3(2.6, 1.66, 2.6);
world.collide(p, 0.45);
console.log('collide_pushed_out', p.x.toFixed(2), p.z.toFixed(2), Math.abs(p.x) > 3.4 || Math.abs(p.z) > 3.4 ? 'PASS' : 'FAIL');

let blocked = 0;
for (let i = 0; i < 500; i++) {
  const x = (Math.random() - 0.5) * 100, z = (Math.random() - 0.5) * 100;
  if (world.pointBlocked(x, z, 0.5)) blocked++;
}
console.log('random_blocked_ratio', (blocked / 500).toFixed(2));

const eye = new THREE.Vector3(0, 1.55, 0);
const tgt = new THREE.Vector3(58, 1.35, 10);
console.log('losBlocked_through_village', world.losBlocked(eye, tgt));

const cover = world.randomCoverNear(new THREE.Vector3(0, 0, 0), 25);
console.log('cover_near_center', cover ? 'FOUND' : 'NONE');

console.log('SMOKE_OK');
