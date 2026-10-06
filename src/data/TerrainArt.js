// Terrain art: ground tiles (public/tiles/*.webp, 256×128 iso diamonds) and props (public/props/*.webp, transparent sprites).
// Built from Maptiles/ and Props/ by tools/buildTerrainArt.py. A missing file just falls back to the coloured tile.
// Keys: tile_<file>, prop_<file>.  Terrain keys are the TERRAIN_CONFIG keys (plains, forest, hill, …).

/** terrain key → ground tile variants (picked per tile so large areas do not look stamped). */
export const TERRAIN_TILE_FILES = {
    plains: ['plains1', 'plains2', 'plains3', 'plains4'],
    forest: ['forest1', 'forest2'],
    mountain: ['mountain'], hill: ['hill'], mud: ['mud'], fortified: ['fortified'], sanctuary: ['sanctuary'],
    river: ['river'], lake: ['lake'], pool: ['pool'], ford: ['ford'],
    hall: ['hall1', 'hall2'], carpet: ['carpet'], dais: ['dais', 'dias1', 'dias2'],
    wax: ['wax'], fire: ['fire'], tunnel: ['tunnel'], tent: ['tent'], rubble: ['rubble'],
    snow: ['snow1', 'snow2'], abyss: ['abyss']
};
const PRELOADED = new Set(['plains1', 'plains2']);   // already loaded by PLAINS_TILE_KEYS (BootScene)
export const tileKey = (file) => `tile_${file}`;
export const TILE_LOAD_LIST = [...new Set(Object.values(TERRAIN_TILE_FILES).flat())]
    .filter(f => !PRELOADED.has(f)).map(f => ({ key: tileKey(f), url: `tiles/${f}.webp` }));

/**
 * terrain key → prop sprite(s) stood on the tile.
 *   width    display width in game px (the files are built at 2×, so scale = width / texture width)
 *   density  share of tiles that get one (hash of the tile, so it is stable across redraws)
 *   tall     impassable block (pillar, wall, mountain): drawn in front of units on the same tile instead of behind them
 *   side     tents only: Pandava tent on the west half of the board, Kaurava on the east
 *   animated the fire prop plays the fire sheet when it is loaded
 */
export const TERRAIN_PROPS = {
    forest:    { files: ['trees1', 'tree2', 'tree3'], width: 124, density: 1 },
    snow:      { files: ['fir'], width: 104, density: 0.35 },
    mountain:  { files: ['mountain1', 'mountain2'], width: 150, density: 1, tall: true },
    fortified: { files: ['fortified_battlement'], width: 128, density: 0.5 },
    tent:      { files: ['pandava_tent', 'kaurava_tent'], width: 120, density: 1, side: true },
    pillar:    { files: ['pillar'], width: 46, density: 1, tall: true, originY: 0.9 },
    wall:      { files: ['wall'], width: 124, density: 1, tall: true },
    rubble:    { files: ['rubble'], width: 100, density: 1 },
    fire:      { files: ['fire'], width: 84, density: 1, animated: true },
    sanctuary: { files: ['shrine'], width: 108, density: 1 }
};
export const propKey = (file) => `prop_${file}`;
export const PROP_LOAD_LIST = [...new Set(Object.values(TERRAIN_PROPS).flatMap(p => p.files))]
    .map(f => ({ key: propKey(f), url: `props/${f}.webp` }));
export const terrainPropSpec = (terrainKey) => TERRAIN_PROPS[terrainKey] || null;

/** Looping fire (12 frames, 4×3 grid, keyed from fire_animation.mp4). Falls back to the static fire prop. */
export const FIRE_SHEET = { key: 'fire_sheet', url: 'props/fire_sheet.webp', frameWidth: 168, frameHeight: 216, frames: 12, anim: 'fire_burn', frameRate: 10 };
