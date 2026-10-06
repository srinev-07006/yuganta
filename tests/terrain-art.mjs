// Terrain art wiring: ground tiles on every terrain that has art, props stood on tiles at the right depth,
// fallbacks when textures are missing.   node --import ./tests/register.mjs tests/terrain-art.mjs
import fs from 'node:fs';
import { GridSystem } from '../src/systems/GridSystem.js';
import { TERRAIN_CONFIG } from '../src/data/TerrainConfig.js';
import { TERRAIN_TILE_FILES, TERRAIN_PROPS, TILE_LOAD_LIST, PROP_LOAD_LIST, FIRE_SHEET, tileKey, propKey } from '../src/data/TerrainArt.js';

let fail = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fail++; console.log('  ✗', m); } };

// ---- 1. every file the game loads actually exists on disk, and every terrain key is real ----
for (const { url } of [...TILE_LOAD_LIST, ...PROP_LOAD_LIST, { url: FIRE_SHEET.url }]) ok(fs.existsSync(`public/${url}`), `missing file public/${url}`);
for (const f of ['plains1', 'plains2']) ok(fs.existsSync(`public/tiles/${f}.webp`), `missing public/tiles/${f}.webp`);
for (const k of [...Object.keys(TERRAIN_TILE_FILES), ...Object.keys(TERRAIN_PROPS)]) ok(TERRAIN_CONFIG[k], `TerrainArt names unknown terrain "${k}"`);
for (const [k, files] of Object.entries(TERRAIN_TILE_FILES)) for (const f of files) ok(fs.existsSync(`public/tiles/${f}.webp`), `tile ${k}: public/tiles/${f}.webp missing`);

// ---- 2. a fake scene with every texture "loaded" and recording game objects ----
function fakeScene({ textures = true, anims = true } = {}) {
    const made = [];
    const obj = (kind, x, y, key) => {
        const o = { kind, x, y, key, width: 256, depth: null, scale: 1, played: null, destroyed: false,
            setDisplaySize() { return this; }, setDepth(d) { this.depth = d; return this; }, setScale(s) { this.scale = s; return this; },
            setOrigin(ox, oy) { this.origin = [ox, oy]; return this; }, play(c) { this.played = c; return this; }, destroy() { this.destroyed = true; } };
        made.push(o); return o;
    };
    const g = () => new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : (k in t ? t[k] : function () { return this; })) });
    return {
        made,
        add: { image: (x, y, k) => obj('image', x, y, k), sprite: (x, y, k) => obj('sprite', x, y, k), graphics: () => g(), text: () => g() },
        textures: { exists: () => textures }, anims: { exists: () => anims },
        cameras: { main: { width: 1280, height: 720, setZoom() {}, centerOn() {} } }, scale: { width: 1280, height: 720 }
    };
}
const T = (k) => TERRAIN_CONFIG[k];
const layout = ['plains', 'forest', 'mountain', 'pillar', 'wall', 'hill', 'lake', 'fire', 'tent', 'fortified', 'sanctuary', 'rubble', 'snow', 'abyss', 'desert', 'plains'];
const W = 8, H = 4;
const matrix = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => T(layout[(y * W + x) % layout.length])));
const at = (k) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (matrix[y][x] === T(k)) return { x, y }; };

{
    const sc = fakeScene(); const gs = new GridSystem(sc, { width: W, height: H }); gs.createGrid(matrix);
    const ground = sc.made.filter(o => o.kind === 'image' && String(o.key).startsWith('tile_'));
    const props = sc.made.filter(o => (o.kind === 'image' && String(o.key).startsWith('prop_')) || o.kind === 'sprite');
    ok(ground.length >= W * H - 6, `ground art: expected most tiles painted, got ${ground.length}/${W * H}`);
    ok(ground.some(o => o.key === tileKey('forest1') || o.key === tileKey('forest2')), 'forest tiles should use the forest art');
    ok(new Set(ground.filter(o => /plains/.test(o.key)).map(o => o.key)).size >= 2, 'plains should vary between several variants');
    ok(ground.filter(o => o.depth === -1).length > 0 && ground.filter(o => o.depth === 0.5).length > 0, 'flat art sits under the graphics (-1), raised/sunken art over their block (0.5)');
    ok(!ground.some(o => /desert/.test(o.key)), 'desert has no art and must fall back to its colour');

    const forest = at('forest'), fp = props.filter(o => o.key?.startsWith('prop_tree') || o.key === propKey('trees1'));
    ok(fp.length > 0 && fp.every(o => o.depth % 10 === 2), 'forest props sit behind units on their tile (depth tile+2)');
    const pil = at('pillar'), pp = props.find(o => o.key === propKey('pillar'));
    ok(pp && pp.depth === gs.getTileDepth(pil.x, pil.y) + 6, 'pillar sprite sits in front of units on its tile (tile+6)');
    ok(gs._props.some(o => o.key === propKey('wall')) && gs._props.some(o => o.key === propKey('mountain1') || o.key === propKey('mountain2')), 'wall and mountain use their sprites');
    const tents = props.filter(o => /tent/.test(o.key)); const tt = at('tent');
    ok(tents.length > 0 && tents[0].key === propKey(tt.x * 2 < W ? 'pandava_tent' : 'kaurava_tent'), 'tent colour follows the board half');
    const fire = props.find(o => o.kind === 'sprite');
    ok(fire && fire.key === FIRE_SHEET.key && fire.played?.key === FIRE_SHEET.anim, 'fire tile plays the fire animation');
    ok(fire && Math.abs(fire.scale - 84 / FIRE_SHEET.frameWidth) < 1e-9, 'fire sheet is scaled to its display width');
    ok(props.every(o => o.origin && o.origin[0] === 0.5), 'props are anchored at their horizontal centre');
    gs._clearProps();
    ok(sc.made.filter(o => o.destroyed).length === props.length + ground.length, 'clearing destroys every prop and ground image');
}
{   // static fallback when the animation is not registered
    const sc = fakeScene({ anims: false }); const gs = new GridSystem(sc, { width: W, height: H }); gs.createGrid(matrix);
    ok(!sc.made.some(o => o.kind === 'sprite') && sc.made.some(o => o.key === propKey('fire')), 'no animation → static fire prop');
}
{   // nothing loaded: must not throw, must draw no sprites
    const sc = fakeScene({ textures: false }); const gs = new GridSystem(sc, { width: W, height: H });
    let threw = null; try { gs.createGrid(matrix); } catch (e) { threw = e; }
    ok(!threw, `createGrid threw with no textures: ${threw?.message}`);
    ok(sc.made.length === 0, 'no textures → no sprites at all (coloured tiles + flat-shaded blocks as before)');
    ok(gs._props.length > 0, 'pillar/wall still draw as flat-shaded blocks without art');
}
console.log(fail ? `\n${fail} of ${checks} checks FAILED` : `${checks} checks passed`);
process.exit(fail ? 1 : 0);
