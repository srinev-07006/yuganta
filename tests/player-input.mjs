// Headless smoke test: real TacticalScene + real data + stubbed Phaser objects.
//   node --import ./tests/register.mjs tests/scene-smoke.mjs [nodeId]      (env SET_HP=Name=hp to force triggers/defeat)
import fs from 'node:fs'; import path from 'node:path';
import { Emitter } from '../src/core/Emitter.js';
import { GameState } from '../src/core/GameState.js';
import { TimelineManager } from '../src/core/TimelineManager.js';
import { VNBridge } from '../src/core/VNBridge.js';
import { buildManifest } from '../tools/buildManifest.js';
import { TacticalScene } from '../src/scenes/TacticalScene.js';
import { GridSystem } from '../src/systems/GridSystem.js';
// Headless: no renderer, so hide the rendering-only anchor; the scene skips token views when it is absent.
delete GridSystem.prototype.unitAnchor;

const dataDir = path.resolve('public/data');
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const fetchJson = async (url) => rj(path.resolve('public', url));

// same registry build as BootScene
const lore = rj(`${dataDir}/global/lore.json`), chars = rj(`${dataDir}/global/characters.json`);
const idx = (arr, k) => new Map(arr.map(x => [x[k], x]));
const traits = idx(lore.traits, 'trait_id'), astras = idx(lore.astras, 'astra_id');
const characterMap = new Map();
for (const c of chars.characters) {
    const rt = (c.traits || []).map(t => traits.get(t)).filter(Boolean);
    const ra = (c.astras || []).map(a => astras.get(a)).filter(Boolean);
    const nc = rt.some(t => ['NonCombatant()', 'NarratorVision()', 'WisdomCounsel()'].includes(t.custom_script_handler));
    characterMap.set(c.character_id, { ...c, resolvedTraits: rt, resolvedAstras: ra, isCombatant: !nc });
}

const els = {};
const mk = () => ({ style: {}, remove() {}, appendChild() {}, set innerHTML(v) {}, set textContent(v) {}, set innerText(v) {}, scrollTop: 0, scrollHeight: 0 });
globalThis.document = { getElementById: (id) => (els[id] ||= mk()), createElement: () => ({ style: {}, remove() {}, appendChild() {}, set innerHTML(v) {}, }), body: { appendChild() {} } };
globalThis.window = { innerWidth: 1280, innerHeight: 720 };

const gameState = new GameState();
const gameEvents = new Emitter();
const manifest = buildManifest(dataDir);
const timeline = new TimelineManager({ manifest, fetchJson, gameState, baseUrl: 'data' });
const vnBridge = new VNBridge({ gameState, events: gameEvents, fallbackProvider: { play: (seq) => Promise.resolve({ choicesMade: [], visitedNodeIds: seq.nodes.map(n => n.dialogue_id) }) } });

const registry = new Map([['characterMap', characterMap], ['gameState', gameState], ['timeline', timeline], ['vnBridge', vnBridge]]);
const started = [];
function makeScene(bundle) {
    const s = new TacticalScene();
    s.events = new Emitter();
    s.registry = registry;
    s.scale = { width: 1280, height: 720, on() {}, off() {} };
    s.cameras = { main: { width: 1280, height: 720, shake() {}, flash() {}, fadeIn() {}, fadeOut() {}, setZoom() {}, centerOn() {}, pan() {} } };
    s.input = { on() {}, off() {} };
    const any = (await_ => null);
    const { default: P } = { default: null };
    s.add = new Proxy({}, { get: () => () => new Proxy({}, { get: () => function () { return this; } }) });
    s.game = { events: gameEvents };
    s.scene = { start: (k, d) => started.push(d), restart: () => started.push('restart') };
    s.init({ bundle });
    return s;
}

// Simulates a HUMAN player's clicks: select -> Move -> pick tile -> Attack -> pick enemy.
//   node tests/player-input.mjs [node_id]
const nodeId = process.argv[2] || 'day-1-kuru-kshetra';
const bundle = await timeline.loadNode(nodeId);
const scene = makeScene(bundle);
const errs = []; const origErr = console.error; console.error = (...a) => { errs.push(a.join(' ')); origErr(...a); };
scene.tweens = { add: c => { Object.assign(c.targets ?? {}, { x: c.x ?? c.targets?.x, y: c.y ?? c.targets?.y }); setTimeout(() => c.onComplete?.(), 0); } };   // headless: tweens finish instantly
scene.create(); await scene._whenIdle(); await new Promise(r => setTimeout(r, 50));
const fail = m => { console.log('FAIL:', m); scene._shutdown(); process.exit(1); };
const ok = m => console.log('ok  -', m);
if (!scene.turns?.running) fail('turns never started (battle did not boot)'); ok('battle booted, phase ' + scene.turns.activeFaction);
if (!scene.turns.isPlayerPhase) fail('not the player phase at start');
const me = scene.unitManager.getAllUnits().find(u => u.faction === 'PANDAVA' && !u.isProp); if (!me) fail('no player unit');
for (const m of ['unitAnchor','highlightTiles','clearHighlights','pickTile']) if (typeof scene.gridSystem[m] !== 'function') scene.gridSystem[m] = m === 'unitAnchor' ? (x, y) => ({ x: x * 64, y: y * 64 }) : () => null;   // headless stub gaps
scene._redrawUnitFace = () => {};   // pure rendering; the headless Phaser stub cannot build unit art
const click = (x, y) => { scene.gridSystem.pickTile = () => ({ x, y }); scene._pickUnit = () => null; scene._handleClick({ worldX: 0, worldY: 0 }); };
click(me.gridX, me.gridY);
if (scene.selectedUnit !== me) fail('click did not select the unit'); ok('selected ' + me.name);
scene._onActionMove();
if (scene.currentState !== scene.STATES.AWAITING_MOVE_TARGET) fail('Move did not enter move mode'); ok('move mode, ' + scene.reachableTiles.length + ' reachable tiles');
const dest = scene.reachableTiles.find(t => !scene.unitManager.getUnitAt(t.x, t.y) && (t.x !== me.gridX || t.y !== me.gridY));
if (!dest) fail('no reachable destination'); const from = [me.gridX, me.gridY];
click(dest.x, dest.y); await scene._whenIdle(); await new Promise(r => setTimeout(r, 400));
if (me.gridX === from[0] && me.gridY === from[1]) fail('unit did not move'); ok(`moved ${from} -> ${me.gridX},${me.gridY}`);
// bring an enemy into range, then attack it
const foes = scene.unitManager.getAllUnits().filter(u => u.faction === 'KAURAVA' && !u.isProp);
if (!foes.length) { console.log('SKIP attack: this node has no enemy units (move worked)'); scene._shutdown(); process.exit(0); }
// prefer a non-hero target: some heroes are invulnerable to standard damage BY DESIGN (e.g. Bhishma)
const foe = foes.find(u => u.unitClass !== 'MAHARATHI') ?? foes[0];
const spot = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => [me.gridX+dx, me.gridY+dy]).find(([x,y]) => !scene.unitManager.getUnitAt(x,y) && scene.mapGrid?.isWalkable?.(x,y) !== false);
scene.unitManager.updateUnitPosition(foe.unitId, spot[0], spot[1]);
if (scene.currentState !== scene.STATES.IDLE && scene.currentState !== scene.STATES.UNIT_SELECTED) scene._selectUnit(me);
scene._onActionAttack();
if (scene.currentState !== scene.STATES.AWAITING_ATTACK_TARGET) fail('Attack did not enter attack mode (state=' + scene.currentState + ')'); ok('attack mode');
const hp = foe.currentHp; click(foe.gridX, foe.gridY); await scene._whenIdle(); await new Promise(r => setTimeout(r, 600));
if (foe.currentHp >= hp && foe.isAlive !== false) fail(`attack did no damage (${hp} -> ${foe.currentHp})`); ok(`attacked: ${hp} -> ${foe.currentHp}`);
if (errs.length) fail('errors logged: ' + errs[0]);
console.log('PLAYER INPUT WORKS: select, move, attack'); scene._shutdown(); setTimeout(() => process.exit(0), 200);
