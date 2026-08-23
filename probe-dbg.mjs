import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.requestAnimationFrame = cb => setTimeout(() => cb(1), 16);
global.screen = dom.window.screen; global.localStorage = dom.window.localStorage;
const THREE = await import('./static/js/lib/three.module.min.js');
const { World } = await import('./static/js/world.js');
const { Soldier } = await import('./static/js/ai.js');
const { Effects } = await import('./static/js/effects.js');
const scene = new THREE.Scene();
const world = new World(scene);
const effects = new Effects(scene);
let dmgEvents = 0;
const game = { scene, world, effects, soldiers: [],
  player: { dead:false, position:new THREE.Vector3(-46,1.66,-42) },
  controls:{yaw:0}, audio:{enemyShot(){},shot(){},hit(){},kill(){}},
  difficulty:{enemyErr:0.09,assistPlayer:false}, noiseEvents:[], state:'playing', time:0,
  aiRaycaster:new THREE.Raycaster(), pushNoise(){},
  damagePlayer(){dmgEvents++;}, onBotKill(){}, respawnBot(){} };
for(let i=0;i<4;i++) game.soldiers.push(new Soldier(game,'rangers','R'+i));
for(let i=0;i<5;i++) game.soldiers.push(new Soldier(game,'militia','M'+i));
const v = game.soldiers[0], sh = game.soldiers[4];
v.spawnAt(new THREE.Vector3(-40,0,-40));
sh.spawnAt(new THREE.Vector3(-38.5,0,-39));

const eye = new THREE.Vector3(sh.position.x, 1.5, sh.position.z);
const dir = new THREE.Vector3(-40 - eye.x, 1.25 - eye.y, -40 - eye.z).normalize();
console.log('eye', eye.x, eye.y, eye.z, 'dir', dir.x.toFixed(3), dir.y.toFixed(3), dir.z.toFixed(3));
game.aiRaycaster.set(eye, dir);
game.aiRaycaster.far = 30;
const eh = game.aiRaycaster.intersectObjects(world.shootables, false);
console.log('envHits', eh.length, eh.slice(0,3).map(h=>h.distance.toFixed(2)));
console.log('shootables_count', world.shootables.length);

const before = v.hp;
sh.ai.curTarget={soldier:v,isPlayer:false,pos:v.position};
sh.ai.targetPos.copy(v.position);
sh.fireAt({pos:v.position,isPlayer:false,soldier:v},game);
console.log('after_shot hp', v.hp, 'delta', before - v.hp);
