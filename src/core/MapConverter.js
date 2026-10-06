// MapConverter.js — region-style battle maps → the engine's { width, height, terrain[][], spawns[] } shape.
//
// Role 3 authored most maps as REGIONS:
//   { map_id, grid_width, grid_height, tiles:[{x_min,x_max,y_min,y_max,terrain_type,movement_cost,
//     defense_multiplier,is_impassable,special_flag}], tile_overrides:[{x,y,…}], spawn_zones:{PANDAVA:{x_min…},…} }
// while core/MapLoader.js (and the renderer, pathfinder, combat) work on a grid of TerrainConfig keys.
// This file bridges the two:
//   isRegionMap(json)            true for the region shape
//   convertRegionMap(json)       → engine-shape JSON (+ spawn_zones, notes) ready for parseMap()
//   deriveSpawns(map, ctx)       region maps carry zones, not units → pick a playable roster inside the zones
// Pure functions, no Phaser, runs in Node.
import { TERRAIN_CONFIG } from '../data/TerrainConfig.js';

const isNum = Number.isFinite;

export function isRegionMap(json) {
    return !!json && isNum(json.grid_width) && isNum(json.grid_height) && Array.isArray(json.tiles);
}

/** Map one region/override tile definition to a TerrainConfig key. */
export function terrainKeyFor(t) {
    const type = String(t.terrain_type || 'PLAIN').toUpperCase();
    const flag = String(t.special_flag || 'NONE').toUpperCase();
    const cost = Number(t.movement_cost ?? 1);
    const mult = Number(t.defense_multiplier ?? 1);
    if (t.is_impassable === true) return type === 'RIVER' ? 'lake' : 'wall';
    switch (type) {
        case 'PLAIN': return flag === 'DENSE_FOREST' ? 'forest' : 'plains';
        case 'ELEVATED':
            if (flag === 'SNOW' || flag.endsWith('_FALLS_HERE')) return 'snow';
            if (cost >= 3) return mult >= 1.5 ? 'mountain' : 'snow';
            return 'hill';
        case 'FORTIFIED': return flag.startsWith('TENT') ? 'tent' : 'fortified';
        case 'MUD': return 'mud';
        case 'RIVER': return 'river';
        case 'SANCTUARY': return 'sanctuary';
        default: return null;
    }
}

// Region-map keys the engine does not implement yet. Reported (never silently dropped) so Role 3/1 can see them.
const UNSUPPORTED_KEYS = ['special_mechanics', 'event_triggers', 'fog_of_war', 'timer',
    'perimeter_impassable_rule', 'rotation_mechanic', 'formation_ref'];

export function convertRegionMap(json) {
    const width = json.grid_width, height = json.grid_height;
    const notes = [];
    const grid = Array.from({ length: height }, () => Array(width).fill('plains'));

    const paint = (x0, x1, y0, y1, def, label) => {
        const key = terrainKeyFor(def);
        if (!key || !TERRAIN_CONFIG[key]) { notes.push(`${label}: unmapped terrain "${def.terrain_type}/${def.special_flag}" — left as plains`); return; }
        for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++)
            for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) grid[y][x] = key;
    };
    (json.tiles || []).forEach((r, i) => {
        if (![r.x_min, r.x_max, r.y_min, r.y_max].every(isNum)) { notes.push(`tiles[${i}]: missing x/y bounds — skipped`); return; }
        paint(r.x_min, r.x_max, r.y_min, r.y_max, r, `tiles[${i}] ${r.region || ''}`.trim());
    });
    (json.tile_overrides || []).forEach((o, i) => {
        if (!isNum(o.x) || !isNum(o.y)) { notes.push(`tile_overrides[${i}]: missing x/y — skipped`); return; }
        if (o.x < 0 || o.y < 0 || o.x >= width || o.y >= height) { notes.push(`tile_overrides[${i}]: (${o.x},${o.y}) outside ${width}×${height} — skipped`); return; }
        paint(o.x, o.x, o.y, o.y, o, `tile_overrides[${i}]`);
    });

    const spawn_zones = {};
    for (const [faction, z] of Object.entries(json.spawn_zones || {})) {
        if (z && [z.x_min, z.x_max, z.y_min, z.y_max].every(isNum)) {
            spawn_zones[faction.toUpperCase()] = {
                x_min: Math.max(0, z.x_min), x_max: Math.min(width - 1, z.x_max),
                y_min: Math.max(0, z.y_min), y_max: Math.min(height - 1, z.y_max)
            };
        } else notes.push(`spawn_zones.${faction}: no usable bounds — ignored`);
    }
    const unsupported = UNSUPPORTED_KEYS.filter(k => json[k] !== undefined);

    return {
        map_id: json.map_id, name: json.name || json.map_id, description: json.description || '',
        width, height, terrain: grid,
        spawns: Array.isArray(json.spawns) ? json.spawns : [],
        spawn_zones, notes, unsupported, source_format: 'region'
    };
}

// ---------------------------------------------------------------------------------------------
// Roster derivation. Region maps say WHERE each side starts, not WHO. We pick:
//   player lead  – the PANDAVA character a directive/trigger names (e.g. Abhimanyu), else Arjuna + Krishna
//   enemy leads  – KAURAVA characters a directive/trigger names (Karna, Jayadratha…), else a hint/default set
//   support      – a few generic battalions per side when the zones are big enough for an army
// All of it is tunable in the constants below; maps that ship their own `spawns` bypass this entirely.
// ---------------------------------------------------------------------------------------------
export const DEFAULT_PLAYER_LEAD = { character_id: 'arjuna', charioteer_id: 'krishna' };
export const DEFAULT_ENEMY_LEADS = ['bhishma', 'drona', 'karna'];
export const NODE_ENEMY_HINTS = {
    'vp-arjuna-penance': { tag: 'kirata', name: 'The Kirata' },
    'avp-babruvahana-fight': { tag: 'babruvahana', name: 'Babruvahana' }
};
// Balance (tests/balance-sim.mjs): the first pass gave the Kauravas 3 support units against 1 and the Pandavas were wiped
// in every Virata run. Support is now near parity; the heroes carry the canon asymmetry.
export const SUPPORT = { minZoneTiles: 30, PANDAVA: ['PADATI_MELEE', 'PADATI_MELEE'], KAURAVA: ['PADATI_MELEE', 'ASHVA'] };
// Battles whose canon names the fighters. Each id is the character; Arjuna always rides with Krishna.
export const NODE_PLAYER_LEADS = {
    'shp-mace-duel': ['bhima'],                              // Bhima vs Duryodhana (vayu-putra + mace-master vs vajra-thighs)
    'dp-day13-chakravyuha': ['abhimanyu', 'arjuna']          // Jayadratha's boon blocks every Pandava except Arjuna
};
export const NODE_SUPPORT = {                              // per-node override of SUPPORT (a side left out keeps the default)
    'vip-virata-war': { PANDAVA: ['PADATI_MELEE', 'PADATI_MELEE', 'PADATI_MELEE'], KAURAVA: ['PADATI_MELEE'] }   // Arjuna's one-man host vs Karna and Drona
};
export const NODE_ENEMY_LEADS = {
    'dp-day13-chakravyuha': ['jayadratha', 'drona'],         // the gate-keeper and the general holding the formation
    'vip-virata-war': ['karna', 'drona']                     // Bhishma (iccha-mrityu) cannot be hurt without Shikhandi, and this objective needs the whole host down
};
const HERO_BLOCKED = ['Mountain', 'River', 'Lake'];

const walkable = (t) => !!t && t.isPassable !== false && (t.moveCost ?? 1) < 99;
const zoneArea = (z) => (z.x_max - z.x_min + 1) * (z.y_max - z.y_min + 1);

/** Free walkable tiles of a zone, nearest the zone centre first. */
function zoneTiles(map, zone, used, blockedNames = []) {
    const cx = (zone.x_min + zone.x_max) / 2, cy = (zone.y_min + zone.y_max) / 2;
    const out = [];
    for (let y = zone.y_min; y <= zone.y_max; y++)
        for (let x = zone.x_min; x <= zone.x_max; x++) {
            const t = map.matrix[y]?.[x];
            if (!walkable(t) || blockedNames.includes(t.name) || used.has(`${x},${y}`)) continue;
            out.push({ x, y, d: Math.hypot(x - cx, y - cy) });
        }
    return out.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
}

export function deriveSpawns(map, { directives = [], triggers = [], characterMap = null, nodeId = null } = {}) {
    const zones = map?.spawn_zones || {};
    const pz = zones.PANDAVA;
    const notes = [];
    let ez = zones.KAURAVA || zones.NEUTRAL;
    if (pz && !ez) {
        // e.g. Chakravyuha: the enemy IS the formation, so no zone is declared — use the middle of the board.
        const w = map.width, h = map.height;
        ez = { x_min: Math.floor(w * 0.3), x_max: Math.ceil(w * 0.7) - 1, y_min: Math.floor(h * 0.3), y_max: Math.ceil(h * 0.7) - 1 };
        notes.push('no KAURAVA zone declared — enemies start in the centre of the board');
    }
    if (!pz || !ez) return { spawns: [], notes: [`derived spawns: need a PANDAVA zone (have ${Object.keys(zones).join(', ') || 'none'})`] };

    const factionOf = (id) => String(characterMap?.get?.(id)?.default_faction || '').toUpperCase();
    const targets = [...new Set([...directives, ...triggers].map(d => d?.target_unit_id).filter(Boolean))];
    const known = (id) => !characterMap || characterMap.has(id);
    const pandavaTargets = targets.filter(id => known(id) && factionOf(id) === 'PANDAVA' && id !== DEFAULT_PLAYER_LEAD.charioteer_id);
    const kauravaTargets = targets.filter(id => known(id) && factionOf(id) === 'KAURAVA');

    const used = new Set();
    const spawns = [];
    const place = (zone, faction, spec, blocked = []) => {
        let tile = zoneTiles(map, zone, used, blocked)[0];
        if (!tile) {   // zone is full (the Chakravyuha's Pandava zone is one tile): take the nearest free tile within 3 of it
            const wide = { x_min: Math.max(0, zone.x_min - 3), x_max: Math.min(map.width - 1, zone.x_max + 3),
                           y_min: Math.max(0, zone.y_min - 3), y_max: Math.min(map.height - 1, zone.y_max + 3) };
            const cx = (zone.x_min + zone.x_max) / 2, cy = (zone.y_min + zone.y_max) / 2;
            tile = zoneTiles(map, wide, used, blocked).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
        }
        if (!tile) { notes.push(`no free walkable tile in ${faction} zone for ${spec.character_id || spec.tag || spec.unit_class}`); return false; }
        used.add(`${tile.x},${tile.y}`);
        spawns.push({ ...spec, faction, x: tile.x, y: tile.y });
        return true;
    };

    // player side
    const forcedP = NODE_PLAYER_LEADS[nodeId], forcedE = NODE_ENEMY_LEADS[nodeId];
    const lead = (id) => id === DEFAULT_PLAYER_LEAD.character_id && known(DEFAULT_PLAYER_LEAD.charioteer_id)
        ? { character_id: id, charioteer_id: DEFAULT_PLAYER_LEAD.charioteer_id } : { character_id: id };   // Arjuna always rides with Krishna
    if (forcedP) forcedP.filter(known).forEach(id => place(pz, 'PANDAVA', lead(id), HERO_BLOCKED));
    else if (pandavaTargets.length) pandavaTargets.slice(0, 2).forEach(id => place(pz, 'PANDAVA',
        id === DEFAULT_PLAYER_LEAD.character_id && known(DEFAULT_PLAYER_LEAD.charioteer_id)
            ? { character_id: id, charioteer_id: DEFAULT_PLAYER_LEAD.charioteer_id } : { character_id: id }, HERO_BLOCKED));
    else {
        const { character_id, charioteer_id } = DEFAULT_PLAYER_LEAD;
        place(pz, 'PANDAVA', known(charioteer_id) ? { character_id, charioteer_id } : { character_id }, HERO_BLOCKED);
    }
    // enemy side
    const hint = NODE_ENEMY_HINTS[nodeId];
    if (forcedE) forcedE.filter(known).forEach(id => place(ez, 'KAURAVA', { character_id: id }, HERO_BLOCKED));
    else if (kauravaTargets.length) kauravaTargets.slice(0, 3).forEach(id => place(ez, 'KAURAVA', { character_id: id }, HERO_BLOCKED));
    else if (hint) place(ez, 'KAURAVA', { unit_class: 'MAHARATHI', tag: hint.tag, name: hint.name }, HERO_BLOCKED);
    else DEFAULT_ENEMY_LEADS.filter(known).slice(0, 2).forEach(id => place(ez, 'KAURAVA', { character_id: id }, HERO_BLOCKED));

    // support troops only where the zones are army-sized
    const sup = { ...SUPPORT, ...(NODE_SUPPORT[nodeId] || {}) };
    if (zoneArea(pz) >= SUPPORT.minZoneTiles && zoneArea(ez) >= SUPPORT.minZoneTiles) {
        sup.PANDAVA.forEach(unit_class => place(pz, 'PANDAVA', { unit_class }));
        sup.KAURAVA.forEach(unit_class => place(ez, 'KAURAVA', { unit_class }));
    }
    return { spawns, notes };
}
