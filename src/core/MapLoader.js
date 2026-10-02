// MapLoader.js — battle-map file → engine-ready data (Role 3 contract).
// File: public/data/maps/<map_id>.json
//   { "map_id":"…", "width":10, "height":10,
//     "terrain":[ ["plains",…], … ],                       // height rows × width strings
//     "spawns":[ {"character_id":"arjuna","charioteer_id":"krishna","faction":"PANDAVA","x":2,"y":3},
//                {"character_id":"bhishma","faction":"KAURAVA","x":7,"y":6},
//                {"unit_class":"GAJA","faction":"KAURAVA","x":8,"y":5} ] }
// terrain: plains|forest|mountain|desert|river|lake. Errors are readable; callers fall back to the demo map.
import { TERRAIN_CONFIG } from '../data/TerrainConfig.js';

const FACTIONS = ['PANDAVA', 'KAURAVA'];
const UNIT_CLASSES = ['RATHA', 'GAJA', 'ASHVA', 'PADATI_MELEE', 'PADATI_RANGED', 'MAHARATHI'];

export function parseMap(json, terrainConfig = TERRAIN_CONFIG) {
    const where = json?.map_id || '(unnamed map)';
    const fail = (msg) => { throw new Error(`[MapLoader] ${where}: ${msg}`); };
    if (!json || typeof json !== 'object') fail('not an object');
    const { width, height, terrain } = json;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) fail('width/height must be integers ≥ 2');
    if (!Array.isArray(terrain) || terrain.length !== height) fail(`terrain must have ${height} rows, has ${terrain?.length}`);

    const matrix = terrain.map((row, y) => {
        if (!Array.isArray(row) || row.length !== width) fail(`terrain row ${y} must have ${width} entries, has ${row?.length}`);
        return row.map((name, x) => {
            const t = terrainConfig[String(name).toLowerCase()];
            if (!t) fail(`unknown terrain "${name}" at (${x},${y}) — valid: ${Object.keys(terrainConfig).join(', ')}`);
            return t;
        });
    });
    const spawns = (json.spawns || []).map((s, i) => {
        const tag = `spawns[${i}]`;
        if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || s.x < 0 || s.y < 0 || s.x >= width || s.y >= height) fail(`${tag}: (${s.x},${s.y}) is outside the ${width}×${height} grid`);
        const faction = String(s.faction || '').toUpperCase();
        if (!FACTIONS.includes(faction)) fail(`${tag}: faction must be one of ${FACTIONS.join('/')}`);
        if (!s.character_id && !s.unit_class) fail(`${tag}: needs character_id or unit_class`);
        if (s.unit_class && !UNIT_CLASSES.includes(s.unit_class)) fail(`${tag}: unknown unit_class "${s.unit_class}"`);
        if (s.charioteer_id && !s.character_id) fail(`${tag}: charioteer_id needs a character_id (the warrior)`);
        return { ...s, faction };
    });
    const seen = new Set();
    for (const s of spawns) { const k = `${s.x},${s.y}`; if (seen.has(k)) fail(`two spawns on tile (${k})`); seen.add(k); }
    return { mapId: json.map_id, width, height, matrix, spawns };
}
