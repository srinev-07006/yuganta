// Headless smoke test: real TacticalScene + real data + stubbed Phaser objects.
//   node --import ./tests/register.mjs tests/scene-smoke.mjs [nodeId]      (env SET_HP=Name=hp to force triggers/defeat)
import fs from 'node:fs'; import path from 'node:path';
import { Emitter } from '../src/core/Emitter.js';
import { GameState } from '../src/core/GameState.js';
import { TimelineManager } from '../src/core/TimelineManager.js';
import { VNBridge } from '../src/core/VNBridge.js';
import { buildManifest } from '../tools/buildManifest.js';
import { TacticalScene } from '../src/scenes/TacticalScene.js';

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

const nodeId = process.argv[2] || 'day-1-kuru-kshetra';
const bundle = await timeline.loadNode(nodeId);
console.log(`node ${nodeId}: scene=${bundle.sceneType} map=${bundle.mapId}/${!!bundle.map} directives=${bundle.directives.length} triggers=${bundle.triggers.length} startSeq=${bundle.startSequences.length}`);
const scene = makeScene(bundle);
const problems = [];
const origErr = console.error; console.error = (...a) => { problems.push(a.join(' ')); origErr(...a); };
scene.create();
if (bundle.sceneType === 'VN') { await new Promise(r => setTimeout(r, 300)); console.log('VN node → advanced to', started.at(-1)?.bundle?.node?.node_id); process.exit(problems.length ? 1 : 0); }

if (process.env.SET_HP) { const [n, hp] = process.env.SET_HP.split('='); scene.unitManager.getAllUnits().filter(u => u.name.startsWith(n)).forEach(u => { u.currentHp = Number(hp); }); }
// let NODE_START sequences finish
await scene._whenIdle(); await new Promise(r => setTimeout(r, 50));
console.log('units:', scene.unitManager.getAllUnits().map(u => `${u.name}@${u.gridX},${u.gridY}`).join(' | '));
console.log('turns running:', scene.turns.running, 'round', scene.turns.round, 'phase', scene.turns.activeFaction);

// drive the player side with the same AI so the whole loop runs
const driveHuman = async ({ isPlayer }) => {
    if (!isPlayer || scene._ended) return;
    await scene._whenIdle();
    await scene.ai.takeTurn('PANDAVA');
    if (scene._alive && !scene._ended && scene.turns.isPlayerPhase) scene.turns.endPhase();
};
scene.turns.on('phase:start', driveHuman);
driveHuman({ isPlayer: scene.turns.isPlayerPhase });      // round-1 phase already started before we hooked in
const t0 = Date.now();
while (!scene._ended && scene.turns.round <= 6 && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 100));
console.log('scene.start calls:', started.map(d => d?.bundle?.node?.node_id ?? d));
console.log('after run: round', scene.turns.round, 'ended', scene._ended, 'resolution', scene.directives.resolution?.event);
console.log('units:', scene.unitManager.getAllUnits().map(u => `${u.name} ${u.currentHp}/${u.maxHp}@${u.gridX},${u.gridY}`).join(' | '));
// index consistency
for (const u of scene.unitManager.getAllUnits()) if (scene.unitManager.getUnitAt(u.gridX, u.gridY) !== u) problems.push(`spatial index stale for ${u.name}`);
scene._shutdown();
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'NO ERRORS');
setTimeout(() => process.exit(problems.length ? 1 : 0), 300);
