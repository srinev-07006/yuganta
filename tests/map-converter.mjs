// Converts every file in public/data/maps through parseMap() and checks the result.
//   node --import ./tests/register.mjs tests/map-converter.mjs
import fs from 'node:fs'; import path from 'node:path';
import { parseMap } from '../src/core/MapLoader.js';
import { deriveSpawns } from '../src/core/MapConverter.js';
import { buildManifest } from '../tools/buildManifest.js';

const dir = path.resolve('public/data/maps');
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const manifest = buildManifest(path.resolve('public/data'));
const tactical = new Map();   // map_id → node ids that play on it
for (const p of manifest.parvas) for (const n of p.nodes) if (n.initial_scene_type === 'TACTICAL' && n.map_id) (tactical.get(n.map_id) || tactical.set(n.map_id, []).get(n.map_id)).push(n.node_id);

let fail = 0, ok = 0, skipped = 0;
const bad = (m) => { fail++; console.log('  ✗', m); };
for (const f of fs.readdirSync(dir).filter(f => f.startsWith('map_')).sort()) {
    const id = f.slice(0, -5), json = rj(path.join(dir, f));
    if (!tactical.has(id)) { skipped++; continue; }                 // VN backdrop maps are never built as a grid
    try {
        const m = parseMap(json);
        if (m.matrix.length !== m.height || m.matrix.some(r => r.length !== m.width)) bad(`${id}: matrix is not ${m.width}×${m.height}`);
        const zones = m.spawn_zones || {};
        for (const [fac, z] of Object.entries(zones)) if (z.x_max >= m.width || z.y_max >= m.height) bad(`${id}: ${fac} zone outside grid`);
        let line = `✓ ${id} ${m.width}×${m.height} [${m.sourceFormat}]`;
        if (m.spawns.length === 0 && m.spawn_zones) {
            const { spawns, notes } = deriveSpawns(m, { nodeId: tactical.get(id)[0] });
            const tiles = new Set(spawns.map(s => `${s.x},${s.y}`));
            if (tiles.size !== spawns.length) bad(`${id}: derived spawns overlap`);
            for (const s of spawns) if (!s.unit_class?.includes('TARGET') && (m.matrix[s.y][s.x].isPassable === false)) bad(`${id}: spawn on impassable tile ${s.x},${s.y}`);
            line += ` → ${spawns.length} derived spawns`; notes.forEach(n => line += `\n     note: ${n}`);
        }
        console.log(line); ok++;
    } catch (e) { bad(`${id}: ${e.message}`); }
}
console.log(`\n${ok} tactical maps OK, ${fail} problems, ${skipped} VN-only maps skipped`);
process.exit(fail ? 1 : 0);
