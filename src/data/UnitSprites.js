// Battle art for generic troops and chariot pairs: public/sprites/units/<slug>.webp (built by tools/buildArt.py).
// Plains ground tiles: public/tiles/plains{1,2}.webp.  A missing file simply falls back to the coloured token.
export const UNIT_SPRITE_SLUGS = [
    'ratha_kaurava_1', 'ratha_kaurava_2', 'ratha_pandava_1', 'ratha_pandava_2',
    'gaja_kaurava_1', 'gaja_kaurava_2', 'gaja_pandava_1', 'gaja_pandava_2', 'gaja_neutral',
    'ashva_kaurava_1', 'ashva_kaurava_2', 'ashva_pandava_1', 'ashva_pandava_2',
    'archer_kaurava_1', 'archer_pandava_1', 'archer_neutral',
    'melee_kaurava_1', 'melee_kaurava_2', 'melee_pandava_1', 'melee_pandava_2', 'melee_neutral',
    'pair_arjuna_krishna', 'pair_arjuna_sikhandi'
];
export const PLAINS_TILE_KEYS = ['tile_plains1', 'tile_plains2'];
export const unitTextureKey = (slug) => `unit_${slug}`;

const CLASS_SLUG = { RATHA: 'ratha', GAJA: 'gaja', ASHVA: 'ashva', PADATI_RANGED: 'archer', PADATI_MELEE: 'melee' };
const SIDE = { PANDAVA: 'pandava', ALLY: 'pandava', KAURAVA: 'kaurava', ENEMY: 'kaurava' };
const have = new Set(UNIT_SPRITE_SLUGS);
const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** On-board footprint (max width, max height in world px) per art kind; tile is 128x64. */
export function unitArtBox(slug) {
    if (slug.startsWith('pair_')) return { w: 150, h: 112 };
    if (slug.startsWith('ratha_')) return { w: 136, h: 104 };
    if (slug.startsWith('gaja_')) return { w: 124, h: 124 };
    return { w: 92, h: 110 };
}

/** Texture slug for a unit with no character sprite of its own (or a hero riding a chariot pair). null = none. */
export function pickUnitSlug(unit) {
    if (!unit || unit.isProp) return null;
    const crew = unit.crew?.charioteerId;
    if (unit.characterId === 'arjuna' && crew === 'krishna') return 'pair_arjuna_krishna';
    if (unit.characterId === 'arjuna' && crew === 'shikhandi') return 'pair_arjuna_sikhandi';
    if (unit.characterId) return null;                                   // named heroes use their own standing sprite
    const cls = CLASS_SLUG[unit.unitClass]; if (!cls) return null;
    const side = SIDE[String(unit.faction || '').toUpperCase()];
    const options = [];
    if (side) for (let n = 1; n <= 2; n++) if (have.has(`${cls}_${side}_${n}`)) options.push(`${cls}_${side}_${n}`);
    if (!options.length && have.has(`${cls}_neutral`)) options.push(`${cls}_neutral`);
    if (!options.length) for (const s of ['pandava', 'kaurava']) if (have.has(`${cls}_${s}_1`)) { options.push(`${cls}_${s}_1`); break; }
    if (!options.length) return null;
    return options[((unit.gridX ?? 0) * 7 + (unit.gridY ?? 0) * 13 + hash(unit.name)) % options.length];   // stable per spawn position
}
