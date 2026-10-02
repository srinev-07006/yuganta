// MapLoader.js — battle-map file → engine-ready data (Role 3 contract).
// File: public/data/maps/<map_id>.json
//
//   {
//     "map_id": "map_panchala_court",         // must equal the timeline node's map_id
//     "name": "Panchala Court",               // optional display name
//     "kind": "TUTORIAL",                     // optional: MISSION (default) | TUTORIAL | STAGE (VN backdrop, no fight)
//     "description": "…",                     // optional
//     "width": 10, "height": 10,
//     "terrain": [ ["hall","hall",…], … ],    // height rows × width keys of TerrainConfig
//     "spawns": [ … ],                        // default spawn set
//     "spawns_by_node": { "kp-final-duel": [ … ] },   // optional: overrides `spawns` for that node
//     "markers": [ { "x":5, "y":5, "type":"GOAL", "label":"Firing position" } ]   // optional
//   }
//
// SPAWN FORMS (faction PANDAVA|KAURAVA, x = column, y = row, origin top-left):
//   hero            { "character_id":"bhishma", "faction":"KAURAVA", "x":7, "y":2 }
//   chariot pair    { "character_id":"arjuna", "charioteer_id":"krishna", "faction":"PANDAVA", "x":2, "y":7 }   (ONE token)
//   battalion       { "unit_class":"GAJA", "faction":"KAURAVA", "x":8, "y":5 }
//   named unit      { "unit_class":"MAHARATHI", "tag":"babruvahana", "name":"Babruvahana", "faction":"KAURAVA", "x":5, "y":2 }
//                   `tag` becomes the unit's characterId so directives/triggers can target it.
//   objective prop  { "unit_class":"TARGET", "tag":"matsya-yantra", "name":"The Golden Fish", "faction":"KAURAVA", "x":5, "y":3 }
//                   Immobile, never acts, MAY sit on an impassable tile (e.g. above the pool). `tag` required.
//
// MARKERS (rendering/tutorial hints, not rules): type GOAL | WAYPOINT | FIRING_POSITION | HAZARD.
//
// Fighters must stand on passable terrain. Errors are readable; callers fall back to the demo map.
import { TERRAIN_CONFIG } from '../data/TerrainConfig.js';

export const FACTIONS = ['PANDAVA', 'KAURAVA'];
export const UNIT_CLASSES = ['RATHA', 'GAJA', 'ASHVA', 'PADATI_MELEE', 'PADATI_RANGED', 'MAHARATHI', 'TARGET'];
export const MAP_KINDS = ['MISSION', 'TUTORIAL', 'STAGE'];
export const MARKER_TYPES = ['GOAL', 'WAYPOINT', 'FIRING_POSITION', 'HAZARD'];

/** True when a unit of any ordinary class could ever stand on this terrain. */
export function isWalkable(terrain) {
    return !!terrain && terrain.isPassable !== false && (terrain.moveCost ?? 1) < 99;
}

export function parseMap(json, terrainConfig = TERRAIN_CONFIG, opts = {}) {
    const where = json?.map_id || '(unnamed map)';
    const fail = (msg) => { throw new Error(`[MapLoader] ${where}: ${msg}`); };
    if (!json || typeof json !== 'object') fail('not an object');
    const { width, height, terrain } = json;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) fail('width/height must be integers ≥ 2');
    if (!Array.isArray(terrain) || terrain.length !== height) fail(`terrain must have ${height} rows, has ${terrain?.length}`);
    const kind = json.kind || 'MISSION';
    if (!MAP_KINDS.includes(kind)) fail(`kind must be one of ${MAP_KINDS.join('/')}`);

    const matrix = terrain.map((row, y) => {
        if (!Array.isArray(row) || row.length !== width) fail(`terrain row ${y} must have ${width} entries, has ${row?.length}`);
        return row.map((name, x) => {
            const t = terrainConfig[String(name).toLowerCase()];
            if (!t) fail(`unknown terrain "${name}" at (${x},${y}) — valid: ${Object.keys(terrainConfig).join(', ')}`);
            return t;
        });
    });

    const inGrid = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;

    const checkSpawns = (list, label) => {
        if (!Array.isArray(list)) fail(`${label} must be an array`);
        const out = list.map((s, i) => {
            const tag = `${label}[${i}]`;
            if (!inGrid(s.x, s.y)) fail(`${tag}: (${s.x},${s.y}) is outside the ${width}×${height} grid`);
            const faction = String(s.faction || '').toUpperCase();
            if (!FACTIONS.includes(faction)) fail(`${tag}: faction must be one of ${FACTIONS.join('/')}`);
            if (!s.character_id && !s.unit_class) fail(`${tag}: needs character_id or unit_class`);
            if (s.character_id && s.unit_class) fail(`${tag}: use character_id OR unit_class, not both (use "tag" to name a battalion-class unit)`);
            if (s.unit_class && !UNIT_CLASSES.includes(s.unit_class)) fail(`${tag}: unknown unit_class "${s.unit_class}"`);
            if (s.charioteer_id && !s.character_id) fail(`${tag}: charioteer_id needs a character_id (the warrior)`);
            if (s.unit_class === 'TARGET' && !s.tag) fail(`${tag}: a TARGET needs a "tag" so directives can name it`);
            if (s.tag && !s.unit_class) fail(`${tag}: "tag" is only for unit_class spawns (heroes are already addressable by character_id)`);
            const prop = s.unit_class === 'TARGET';
            if (!prop && !isWalkable(matrix[s.y][s.x])) {
                fail(`${tag}: ${s.character_id || s.unit_class} cannot stand on ${matrix[s.y][s.x].name} at (${s.x},${s.y})`);
            }
            return { ...s, faction };
        });
        const seen = new Set();
        for (const s of out) { const k = `${s.x},${s.y}`; if (seen.has(k)) fail(`${label}: two spawns on tile (${k})`); seen.add(k); }
        return out;
    };

    const defaultSpawns = checkSpawns(json.spawns || [], 'spawns');
    const byNode = {};
    for (const [nodeId, list] of Object.entries(json.spawns_by_node || {})) byNode[nodeId] = checkSpawns(list, `spawns_by_node["${nodeId}"]`);
    const spawns = (opts.nodeId && byNode[opts.nodeId]) || defaultSpawns;

    const markers = (json.markers || []).map((m, i) => {
        if (!inGrid(m.x, m.y)) fail(`markers[${i}]: (${m.x},${m.y}) is outside the grid`);
        if (!MARKER_TYPES.includes(m.type)) fail(`markers[${i}]: type must be one of ${MARKER_TYPES.join('/')}`);
        return { ...m };
    });

    return {
        mapId: json.map_id, name: json.name || json.map_id, kind, description: json.description || '',
        width, height, matrix, spawns, spawnsByNode: byNode, markers
    };
}
